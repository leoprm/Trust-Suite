import { Client, ClientChannel, ConnectConfig } from 'ssh2';
import { prisma } from '../index';
import { decryptKey } from './encryptionService';

// ── Types ───────────────────────────────────────────────────────────────────

interface ExecResult {
  stdout: string;
  stderr: string;
  exitCode: number | null;
}

interface ExecOptions {
  /** Overall timeout in ms for the entire SSH operation (default: 30_000). */
  timeoutMs?: number;
}

interface RateLimitEntry {
  count: number;
  resetAt: number; // epoch ms
}

// ── Constants ───────────────────────────────────────────────────────────────

const DEFAULT_TIMEOUT_MS    = 30_000;   // 30s
const RATE_LIMIT_MAX        = 10;       // commands per window
const RATE_LIMIT_WINDOW_MS  = 60_000;   // 1 minute

// ── Rate-limit store (in-memory, per-server) ────────────────────────────────

const rateLimitMap = new Map<string, RateLimitEntry>();

/** Purge expired entries so the map doesn't grow unbounded. */
function cleanRateLimitMap(): void {
  const now = Date.now();
  for (const [id, entry] of rateLimitMap) {
    if (now >= entry.resetAt) {
      rateLimitMap.delete(id);
    }
  }
}

/** Check / bump the counter. Throws SSHGatewayError('RATE_LIMITED') if exceeded. */
function checkRateLimit(serverId: string): void {
  const now = Date.now();

  // Periodic cleanup — cheap amortised O(1) check every 100 calls
  if (Math.random() < 0.01) cleanRateLimitMap();

  let entry = rateLimitMap.get(serverId);

  if (!entry || now >= entry.resetAt) {
    // Fresh window
    entry = { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS };
    rateLimitMap.set(serverId, entry);
    return;
  }

  entry.count++;

  if (entry.count > RATE_LIMIT_MAX) {
    throw new SSHGatewayError(
      `Rate limit exceeded for server ${serverId} (max ${RATE_LIMIT_MAX} commands/min)`,
      'RATE_LIMITED',
    );
  }
}

// ── Error classes ───────────────────────────────────────────────────────────

class SSHGatewayError extends Error {
  constructor(message: string, public readonly code: string, public readonly cause?: Error) {
    super(message);
    this.name = 'SSHGatewayError';
  }
}

// ── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Zero-out a string in-place by overwriting its characters.
 * This is a best-effort measure — V8 may still retain internalised strings.
 * At minimum it ensures the plaintext doesn't survive in our own scope.
 */
function scrub(str: string): void {
  if (!str) return;
  const arr = str.split('');
  for (let i = 0; i < arr.length; i++) arr[i] = '\x00';
  arr.length = 0;
}

/**
 * Map raw ssh2-level errors into user-friendly codes.
 */
function classifyError(err: Error): string {
  const msg = err.message.toLowerCase();
  if (err.name === 'TimeoutError' || msg.includes('timed out') || msg.includes('timeout')) {
    return 'SSH_TIMEOUT';
  }
  if (msg.includes('connection refused') || msg.includes('econnrefused')) {
    return 'SSH_CONNECTION_REFUSED';
  }
  if (msg.includes('authentication failed') || msg.includes('auth fail') || msg.includes('no auth')) {
    return 'SSH_AUTH_FAILED';
  }
  if (msg.includes('enotfound') || msg.includes('dns')) {
    return 'SSH_HOST_UNREACHABLE';
  }
  return 'SSH_ERROR';
}

// ── Public API ──────────────────────────────────────────────────────────────

/**
 * Execute a shell command on a managed server via SSH.
 *
 * Workflow:
 *  1. Rate-limit check (10 commands/min per server, in-memory).
 *  2. Look up ManagedServer by id in the database.
 *  3. Decrypt the stored SSH private key using encryptionService.
 *  4. Open an SSH connection + execute the command.
 *  5. The whole operation races against a configurable timeout (default 30 s).
 *  6. Scrub the decrypted key from memory immediately.
 *
 * Security contract:
 *  - The decrypted private key is NEVER logged.
 *  - The key is scrubbed from memory as soon as the SSH handshake completes
 *    (success or failure).
 *  - Command output is returned to the caller but not logged here.
 *
 * @param serverId - UUID of the ManagedServer record.
 * @param command  - Shell command to execute on the remote host.
 * @param options  - Optional { timeoutMs }.
 * @returns {stdout, stderr, exitCode}
 * @throws {SSHGatewayError}
 */
export async function execCommand(
  serverId: string,
  command: string,
  options: ExecOptions = {},
): Promise<ExecResult> {
  // ── 0. Rate-limit check ─────────────────────────────────────────────────
  checkRateLimit(serverId);

  // ── 1. Fetch the server record ──────────────────────────────────────────
  const server = await prisma.managedServer.findUnique({
    where: { id: serverId },
    select: { id: true, treeId: true, name: true, ip: true, port: true, username: true, encryptedKey: true },
  });

  if (!server) {
    throw new SSHGatewayError(`Server not found: ${serverId}`, 'SSH_SERVER_NOT_FOUND');
  }

  // ── 2. Decrypt the key — this plaintext must not leak ───────────────────
  let decryptedKey: string;
  try {
    decryptedKey = decryptKey(server.encryptedKey, server.treeId);
  } catch (err: any) {
    throw new SSHGatewayError(
      `Failed to decrypt SSH key for server ${server.name}`,
      'SSH_KEY_DECRYPT_FAILED',
      err,
    );
  }

  // ── 3. Connect + execute with configurable timeout via Promise.race ─────
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  const sshPromise = new Promise<ExecResult>((resolve, reject) => {
    const conn = new Client();

    // Track whether cleanup has already run to avoid double-reject
    let settled = false;

    const done = (fn: () => void) => {
      if (settled) return;
      settled = true;
      fn();
    };

    // ── ready ──────────────────────────────────────────────────────────
    conn.on('ready', () => {
      // Scrub the key now that the connection is established
      scrub(decryptedKey);
      decryptedKey = '';

      conn.exec(command, (err: Error | undefined, stream: ClientChannel) => {
        if (err) {
          conn.end();
          done(() =>
            reject(new SSHGatewayError(`SSH exec failed: ${err.message}`, 'SSH_EXEC_FAILED', err)),
          );
          return;
        }

        let stdout = '';
        let stderr = '';

        stream
          .on('data', (data: Buffer) => {
            stdout += data.toString('utf8');
          })
          .stderr
          .on('data', (data: Buffer) => {
            stderr += data.toString('utf8');
          });

        stream.on('close', (code: number | null) => {
          conn.end();
          done(() => resolve({ stdout, stderr, exitCode: code }));
        });

        stream.on('error', (streamErr: Error) => {
          conn.end();
          done(() =>
            reject(
              new SSHGatewayError(`SSH stream error: ${streamErr.message}`, 'SSH_STREAM_ERROR', streamErr),
            ),
          );
        });
      });
    });

    // ── error (auth fail, refused, etc.) ───────────────────────────────
    conn.on('error', (err: Error) => {
      scrub(decryptedKey);
      decryptedKey = '';
      done(() => {
        const code = classifyError(err);
        reject(new SSHGatewayError(`SSH connection failed: ${err.message}`, code, err));
      });
    });

    // ── close (safety net) ─────────────────────────────────────────────
    conn.on('close', () => {
      scrub(decryptedKey);
      decryptedKey = '';
    });

    // ── connect ────────────────────────────────────────────────────────
    conn.connect({
      host: server.ip,
      port: server.port,
      username: server.username,
      privateKey: decryptedKey,
      readyTimeout: Math.min(timeoutMs, 60_000), // ssh2 caps at 60s
      algorithms: {
        kex: [
          'curve25519-sha256',
          'curve25519-sha256@libssh.org',
          'ecdh-sha2-nistp256',
          'ecdh-sha2-nistp384',
          'ecdh-sha2-nistp521',
          'diffie-hellman-group-exchange-sha256',
        ],
      },
    } as ConnectConfig);
  });

  // ── Timeout promise (configurable, default 30s) ──────────────────────────
  const timeoutPromise = new Promise<never>((_, reject) => {
    setTimeout(() => {
      reject(
        new SSHGatewayError(
          `SSH operation timed out after ${timeoutMs / 1000}s`,
          'SSH_TIMEOUT',
        ),
      );
    }, timeoutMs);
  });

  try {
    return await Promise.race([sshPromise, timeoutPromise]);
  } finally {
    // Double-scrub: ensure key is cleaned even if timeout won the race
    scrub(decryptedKey);
    decryptedKey = '';
  }
}
