import { Request, Response } from 'express';
import { prisma } from '../index';
import { encryptKey } from '../services/encryptionService';
import { execCommand as sshExecCommand } from '../services/sshGateway';

export const createServer = async (req: any, res: Response) => {
  try {
    const { treeId, name, ip, port, username, sshKey } = req.body;
    const userId = req.user?.id;

    // Validate required fields
    if (!treeId || !name || !ip || !username || !sshKey) {
      return res.status(400).json({ error: 'Missing required fields: treeId, name, ip, username, sshKey' });
    }

    // Validate SSH key is a private key
    if (!/BEGIN\s+(?:(?:OPENSSH|RSA)\s+)?PRIVATE\s+KEY/i.test(sshKey)) {
      return res.status(400).json({ error: 'Invalid SSH key: must be a private key (BEGIN ... PRIVATE KEY)' });
    }

    // Verify user is ADMIN of the tree
    const membership = await prisma.treeMember.findUnique({
      where: {
        userId_treeId: {
          userId,
          treeId,
        },
      },
      select: { role: true },
    });

    if (!membership || membership.role !== 'ADMIN') {
      return res.status(403).json({ error: 'Only tree admins can register servers' });
    }

    // Encrypt the SSH key for storage
    const encrypted = encryptKey(sshKey, treeId);

    // Create the server record
    const server = await prisma.managedServer.create({
      data: {
        treeId,
        name,
        ip,
        port: port || 22,
        username,
        encryptedKey: encrypted,
      },
    });

    // Test connectivity — echo ok
    try {
      await sshExecCommand(server.id, 'echo ok');
      // Success → mark active
      await prisma.managedServer.update({
        where: { id: server.id },
        data: { status: 'ACTIVE', lastCheck: new Date() },
      });
    } catch (sshErr: any) {
      // SSH unreachable — leave status as PENDING_VERIFICATION and override to UNREACHABLE
      await prisma.managedServer.update({
        where: { id: server.id },
        data: { status: 'UNREACHABLE' },
      });
    }

    // Return server info without the key
    const final = await prisma.managedServer.findUnique({
      where: { id: server.id },
      select: { id: true, name: true, ip: true, port: true, username: true, status: true, lastCheck: true, createdAt: true },
    });

    res.status(201).json({ server: final });
  } catch (error: any) {
    console.error('[createServer] ERROR:', error?.message || error);
    res.status(500).json({ error: 'Failed to register server' });
  }
};

export const deleteServer = async (req: any, res: Response) => {
  try {
    const { id } = req.params;
    const userId = req.user?.id;

    // Find the server
    const server = await prisma.managedServer.findUnique({
      where: { id },
    });

    if (!server) {
      return res.status(404).json({ error: 'Server not found' });
    }

    // Verify user is ADMIN of the server's tree
    const membership = await prisma.treeMember.findUnique({
      where: {
        userId_treeId: {
          userId,
          treeId: server.treeId,
        },
      },
      select: { role: true },
    });

    if (!membership || membership.role !== 'ADMIN') {
      return res.status(403).json({ error: 'Only tree admins can delete servers' });
    }

    // Delete the server (encryptedKey is deleted along with the record)
    await prisma.managedServer.delete({ where: { id } });

    res.json({ message: 'Server deleted successfully' });
  } catch (error: any) {
    console.error('[deleteServer] ERROR:', error?.message || error);
    res.status(500).json({ error: 'Failed to delete server' });
  }
};

export const getServerStatus = async (req: any, res: Response) => {
  try {
    const { id } = req.params;
    const userId = req.user?.id;

    // Find the server
    const server = await prisma.managedServer.findUnique({
      where: { id },
      select: { id: true, name: true, status: true, lastCheck: true, consecutiveFails: true, treeId: true },
    });

    if (!server) {
      return res.status(404).json({ error: 'Server not found' });
    }

    // Verify user is ADMIN of the server's tree
    const membership = await prisma.treeMember.findUnique({
      where: {
        userId_treeId: {
          userId,
          treeId: server.treeId,
        },
      },
      select: { role: true },
    });

    if (!membership || membership.role !== 'ADMIN') {
      return res.status(403).json({ error: 'Only tree admins can view server status' });
    }

    res.json({
      id: server.id,
      name: server.name,
      status: server.status,
      lastCheck: server.lastCheck,
      consecutiveFails: server.consecutiveFails,
    });
  } catch (error: any) {
    console.error('[getServerStatus] ERROR:', error?.message || error);
    res.status(500).json({ error: 'Failed to get server status' });
  }
};

// ── POST /api/servers/:id/exec ───────────────────────────────────────────

export const execServerCommand = async (req: any, res: Response) => {
  try {
    const { id } = req.params;
    const { command } = req.body;
    const userId = req.user?.id;

    // Validate input
    if (!command || typeof command !== 'string' || command.trim().length === 0) {
      return res.status(400).json({ error: 'command is required and must be a non-empty string' });
    }

    // Find the server — only fetch treeId for membership check, NEVER encryptedKey
    const server = await prisma.managedServer.findUnique({
      where: { id },
      select: { id: true, treeId: true, name: true },
    });

    if (!server) {
      return res.status(404).json({ error: 'Server not found' });
    }

    // Verify user is a member of the server's tree (any role, not just ADMIN)
    const membership = await prisma.treeMember.findUnique({
      where: {
        userId_treeId: {
          userId,
          treeId: server.treeId,
        },
      },
    });

    if (!membership) {
      return res.status(403).json({ error: 'Tree membership required to execute commands' });
    }

    // Execute via SSH gateway — key is decrypted and scrubbed inside sshExecCommand()
    const result = await sshExecCommand(id, command.trim());

    // Return ONLY { stdout, stderr, exitCode } — no server metadata, no key
    res.json({
      stdout: result.stdout,
      stderr: result.stderr,
      exitCode: result.exitCode,
    });
  } catch (error: any) {
    // SSHGatewayError has machine-readable .code field (duck-typed — class not exported)
    const sshCode = error?.code;
    if (sshCode && typeof sshCode === 'string' && sshCode.startsWith('SSH_')) {
      const statusMap: Record<string, number> = {
        SSH_SERVER_NOT_FOUND: 404,
        SSH_KEY_DECRYPT_FAILED: 500,
        SSH_TIMEOUT: 504,
        SSH_CONNECTION_REFUSED: 502,
        SSH_AUTH_FAILED: 502,
        SSH_HOST_UNREACHABLE: 502,
        SSH_EXEC_FAILED: 502,
        SSH_STREAM_ERROR: 502,
        SSH_EXEC_TIMEOUT: 504,
      };
      const status = statusMap[sshCode] || 500;
      return res.status(status).json({
        error: error.message || 'SSH command failed',
        code: sshCode,
      });
    }

    console.error('[execServerCommand] ERROR:', error?.message || error);
    res.status(500).json({ error: 'Failed to execute command' });
  }
};
