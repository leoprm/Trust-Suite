import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { Request } from 'express';
import { prisma } from '../index';

export const UPLOAD_ROOT = path.resolve(process.env.UPLOAD_ROOT || path.join(__dirname, '../../uploads'));

export const ALLOWED_UPLOAD_TYPES: Record<string, { extensions: string[]; maxBytes: number; inline: boolean }> = {
  'image/jpeg': { extensions: ['.jpg', '.jpeg'], maxBytes: 5 * 1024 * 1024, inline: true },
  'image/png': { extensions: ['.png'], maxBytes: 5 * 1024 * 1024, inline: true },
  'image/webp': { extensions: ['.webp'], maxBytes: 5 * 1024 * 1024, inline: true },
  'application/pdf': { extensions: ['.pdf'], maxBytes: 10 * 1024 * 1024, inline: true },
  'text/plain': { extensions: ['.txt'], maxBytes: 10 * 1024 * 1024, inline: false },
  'text/csv': { extensions: ['.csv'], maxBytes: 10 * 1024 * 1024, inline: false },
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': { extensions: ['.docx'], maxBytes: 10 * 1024 * 1024, inline: false },
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': { extensions: ['.xlsx'], maxBytes: 10 * 1024 * 1024, inline: false },
};

export const BLOCKED_EXTENSIONS = new Set([
  '.exe', '.sh', '.bat', '.cmd', '.js', '.ts', '.html', '.htm', '.svg', '.php', '.jar', '.zip',
]);

export type EvidenceVisibility = 'PRIVATE' | 'TASK_PARTICIPANTS' | 'TREE_ONLY' | 'TRUST_NETWORK' | 'PUBLIC_METADATA' | 'PUBLIC';

export function ensureUploadRoot() {
  fs.mkdirSync(UPLOAD_ROOT, { recursive: true });
}

export function sanitizeOriginalName(name: string) {
  const base = path.basename(name || 'file').replace(/[^\w.\- ()]/g, '_').slice(0, 180);
  return base || 'file';
}

export function validateUploadFile(file: Express.Multer.File) {
  const originalName = sanitizeOriginalName(file.originalname);
  const extension = path.extname(originalName).toLowerCase();
  const typeConfig = ALLOWED_UPLOAD_TYPES[file.mimetype];
  const envMaxBytes = Number(process.env.MAX_UPLOAD_SIZE_MB || 10) * 1024 * 1024;

  if (!extension || BLOCKED_EXTENSIONS.has(extension)) {
    return { ok: false as const, reason: 'extension_blocked', originalName, extension };
  }

  if (!typeConfig || !typeConfig.extensions.includes(extension)) {
    return { ok: false as const, reason: 'mime_or_extension_not_allowed', originalName, extension };
  }

  const maxBytes = Math.min(typeConfig.maxBytes, envMaxBytes);
  if (file.size > maxBytes) {
    return { ok: false as const, reason: 'file_too_large', originalName, extension, maxBytes };
  }

  return { ok: true as const, originalName, extension, typeConfig };
}

export function buildEvidenceStoragePath(extension: string) {
  const now = new Date();
  const yyyy = String(now.getUTCFullYear());
  const mm = String(now.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(now.getUTCDate()).padStart(2, '0');
  const storedName = `${crypto.randomUUID()}${extension}`;
  const relativeDir = path.join('evidence', yyyy, mm, dd);
  const relativePath = path.join(relativeDir, storedName);
  return { storedName, relativeDir, relativePath };
}

export function resolveStoragePath(storagePath: string) {
  const resolved = path.resolve(UPLOAD_ROOT, storagePath);
  const relative = path.relative(UPLOAD_ROOT, resolved);
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error('Path traversal blocked');
  }
  return resolved;
}

export async function calculateSha256(filePath: string): Promise<string> {
  const hash = crypto.createHash('sha256');
  await new Promise<void>((resolve, reject) => {
    const stream = fs.createReadStream(filePath);
    stream.on('data', chunk => hash.update(chunk));
    stream.on('error', reject);
    stream.on('end', resolve);
  });
  return hash.digest('hex');
}

export async function verifyFileChecksum(fileId: string): Promise<boolean> {
  const file = await (prisma as any).evidenceFile.findUnique({ where: { id: fileId } });
  if (!file?.checksumSha256) return false;
  const realPath = resolveStoragePath(file.storagePath);
  const checksum = await calculateSha256(realPath);
  return checksum === file.checksumSha256;
}

export async function canAccessEvidenceFile(file: any, req: Request): Promise<boolean> {
  const viewerId = req.user?.id;
  const viewerRole = req.user?.role;
  if (viewerRole === 'ADMINISTRATOR') return true;
  if (file.status !== 'ACTIVE') return false;
  if (file.visibility === 'PUBLIC') return true;
  if (file.visibility === 'TRUST_NETWORK') return Boolean(viewerId);
  if (!viewerId) return false;
  if (file.uploaderId === viewerId) return true;

  const treeId = file.treeId || file.task?.branch?.treeId || file.task?.branch?.idea?.need?.treeLinks?.[0]?.treeId;
  const task = file.task;

  if (task && (task.assignedTo === viewerId || task.creatorId === viewerId)) return true;

  if (task) {
    const audit = await (prisma as any).auditoria.findFirst({
      where: { taskId: task.id, usuarioId: viewerId },
      select: { id: true },
    });
    if (audit) return true;
  }

  if (treeId) {
    const membership = await (prisma as any).treeMember.findUnique({
      where: { userId_treeId: { userId: viewerId, treeId } },
      select: { role: true },
    });
    if (membership?.role === 'ADMIN') return true;
    if (membership && file.visibility === 'TREE_ONLY') return true;
  }

  if (file.visibility === 'TASK_PARTICIPANTS') return false;
  if (file.visibility === 'PUBLIC_METADATA') return false;
  if (file.visibility === 'PRIVATE') return false;
  return false;
}

export function toSafeEvidenceMetadata(file: any, fileAccessAllowed: boolean) {
  return {
    id: file.id,
    hasEvidence: true,
    originalName: file.originalName,
    mimeType: file.mimeType,
    extension: file.extension,
    sizeBytes: file.sizeBytes,
    visibility: file.visibility,
    status: file.status,
    checksumSha256: file.checksumSha256,
    createdAt: file.createdAt,
    updatedAt: file.updatedAt,
    auditStatus: file.task?.evidenceStatus ?? null,
    fileAccessAllowed,
    downloadUrl: fileAccessAllowed ? `/api/files/${file.id}` : undefined,
  };
}
