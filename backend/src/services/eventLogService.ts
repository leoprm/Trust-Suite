import { Request } from 'express';
import { prisma } from '../index';

export type EventSeverity = 'INFO' | 'WARNING' | 'CRITICAL';
export type EventSource = 'USER' | 'SYSTEM' | 'ADMIN' | 'AUTOMATION';

export type LogEventInput = {
  treeId?: string | null;
  actorId?: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  beforeJson?: unknown;
  afterJson?: unknown;
  metadataJson?: unknown;
  ipAddress?: string | null;
  userAgent?: string | null;
  severity?: EventSeverity;
  source?: EventSource;
};

const SENSITIVE_KEY_PATTERN = /password|passwordHash|token|refreshToken|jwt|secret|apiKey|authorization|cookie|credential|comprobante|evidence|evidencia|file|buffer|binary|photo|image|archivo/i;
const MAX_DEPTH = 6;
const MAX_ARRAY_ITEMS = 30;
const MAX_STRING_LENGTH = 1000;

function normalizeString(value: string) {
  if (value.length <= MAX_STRING_LENGTH) return value;
  return `${value.slice(0, MAX_STRING_LENGTH)}...[TRUNCATED]`;
}

export function sanitizeForEventLog(value: unknown, depth = 0): unknown {
  if (value === null || value === undefined) return value;
  if (depth > MAX_DEPTH) return '[TRUNCATED_DEPTH]';

  if (typeof Buffer !== 'undefined' && Buffer.isBuffer(value)) return '[REDACTED_BINARY]';
  if (value instanceof Date) return value.toISOString();

  if (typeof value === 'string') return normalizeString(value);
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  if (typeof value === 'bigint') return value.toString();
  if (typeof value === 'function' || typeof value === 'symbol') return undefined;

  if (Array.isArray(value)) {
    return value.slice(0, MAX_ARRAY_ITEMS).map((item) => sanitizeForEventLog(item, depth + 1));
  }

  if (typeof value === 'object') {
    const result: Record<string, unknown> = {};
    for (const [key, nestedValue] of Object.entries(value as Record<string, unknown>)) {
      if (SENSITIVE_KEY_PATTERN.test(key)) {
        result[key] = '[REDACTED]';
      } else {
        result[key] = sanitizeForEventLog(nestedValue, depth + 1);
      }
    }
    return result;
  }

  return String(value);
}

export function getRequestContext(req: Request) {
  const userAgentHeader = req.headers['user-agent'];
  return {
    actorId: req.user?.id ?? null,
    ipAddress: req.ip ?? null,
    userAgent: Array.isArray(userAgentHeader) ? userAgentHeader.join(' ') : userAgentHeader ?? null,
  };
}

export function getRequestMetadata(req: Request, extra?: Record<string, unknown>) {
  return sanitizeForEventLog({
    route: req.originalUrl,
    method: req.method,
    ...extra,
  });
}

export async function logEvent(input: LogEventInput): Promise<void> {
  try {
    if (!input.action || !input.entityType) return;

    await (prisma as any).eventLog.create({
      data: {
        treeId: input.treeId ?? null,
        actorId: input.actorId ?? null,
        action: input.action,
        entityType: input.entityType,
        entityId: input.entityId ?? null,
        beforeJson: input.beforeJson === undefined ? undefined : sanitizeForEventLog(input.beforeJson),
        afterJson: input.afterJson === undefined ? undefined : sanitizeForEventLog(input.afterJson),
        metadataJson: input.metadataJson === undefined ? undefined : sanitizeForEventLog(input.metadataJson),
        ipAddress: input.ipAddress ?? null,
        userAgent: input.userAgent ?? null,
        severity: input.severity ?? 'INFO',
        source: input.source ?? 'USER',
      },
    });
  } catch (error) {
    console.error('[EventLog] Failed to record event:', error);
    if (process.env.NODE_ENV === 'test') {
      throw error;
    }
  }
}
