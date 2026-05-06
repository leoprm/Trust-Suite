import { Request, Response } from 'express';
import fs from 'fs';
import path from 'path';
import { prisma } from '../index';
import {
  ALLOWED_UPLOAD_TYPES,
  canAccessEvidenceFile,
  resolveStoragePath,
  toSafeEvidenceMetadata,
  verifyFileChecksum,
} from '../utils/fileSecurity';
import { getRequestContext, getRequestMetadata, logEvent } from '../services/eventLogService';

const EVIDENCE_INCLUDE = {
  task: {
    select: {
      id: true,
      assignedTo: true,
      creatorId: true,
      evidenceStatus: true,
      branchId: true,
      branch: {
        select: {
          treeId: true,
          idea: { select: { need: { select: { treeLinks: { select: { treeId: true } } } } } },
        },
      },
    },
  },
};

async function getEvidenceFile(id: string) {
  return (prisma as any).evidenceFile.findUnique({
    where: { id },
    include: EVIDENCE_INCLUDE,
  });
}

function paramString(value: unknown): string {
  return Array.isArray(value) ? value[0] : String(value || '');
}

function setSecureFileHeaders(res: Response, file: any) {
  const typeConfig = ALLOWED_UPLOAD_TYPES[file.mimeType];
  const inline = Boolean(typeConfig?.inline);
  const safeName = path.basename(file.originalName || `evidence${file.extension}`);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Cache-Control', file.visibility === 'PUBLIC' ? 'private, max-age=0, no-store' : 'private, max-age=0, no-store');
  res.setHeader('Content-Type', file.mimeType);
  res.setHeader('Content-Disposition', `${inline ? 'inline' : 'attachment'}; filename="${safeName.replace(/"/g, '')}"`);
}

export const getEvidenceMetadata = async (req: Request, res: Response) => {
  try {
    const evidenceId = paramString(req.params.evidenceId);
    const file = await getEvidenceFile(evidenceId);
    if (!file || file.status !== 'ACTIVE') return res.status(404).json({ error: 'Evidence not found' });

    const allowed = await canAccessEvidenceFile(file, req);
    const publicMetadata = file.visibility === 'PUBLIC_METADATA' || file.visibility === 'PUBLIC';
    if (!allowed && !publicMetadata) {
      return res.status(403).json({ error: 'Not allowed to view this evidence metadata' });
    }
    res.json(toSafeEvidenceMetadata(file, allowed));
  } catch (error) {
    console.error('[getEvidenceMetadata]', error);
    res.status(500).json({ error: 'Failed to fetch evidence metadata' });
  }
};

export const serveEvidenceFile = async (req: Request, res: Response) => {
  try {
    const fileId = paramString(req.params.fileId);
    if (!fileId || fileId.includes('..') || fileId.includes('/') || fileId.includes('\\')) {
      void logEvent({
        ...getRequestContext(req),
        action: 'SUSPICIOUS_FILE_ACCESS_BLOCKED',
        entityType: 'EvidenceFile',
        metadataJson: getRequestMetadata(req, { reason: 'invalid_file_id' }),
        severity: 'WARNING',
        source: 'USER',
      });
      return res.status(404).json({ error: 'File not found' });
    }

    const file = await getEvidenceFile(fileId);
    if (!file || file.status !== 'ACTIVE') return res.status(404).json({ error: 'File not found' });

    const allowed = await canAccessEvidenceFile(file, req);
    if (!allowed) {
      void logEvent({
        ...getRequestContext(req),
        treeId: file.treeId,
        action: 'EVIDENCE_ACCESS_DENIED',
        entityType: 'EvidenceFile',
        entityId: file.id,
        metadataJson: getRequestMetadata(req, { reason: 'permission_denied', visibility: file.visibility }),
        severity: 'WARNING',
        source: 'USER',
      });
      return res.status(403).json({ error: 'Not allowed to access this file' });
    }

    let realPath: string;
    try {
      realPath = resolveStoragePath(file.storagePath);
    } catch {
      void logEvent({
        ...getRequestContext(req),
        treeId: file.treeId,
        action: 'SUSPICIOUS_FILE_ACCESS_BLOCKED',
        entityType: 'EvidenceFile',
        entityId: file.id,
        metadataJson: getRequestMetadata(req, { reason: 'storage_path_escape_blocked' }),
        severity: 'CRITICAL',
        source: 'USER',
      });
      return res.status(404).json({ error: 'File not found' });
    }

    if (!fs.existsSync(realPath)) return res.status(404).json({ error: 'File not found' });
    setSecureFileHeaders(res, file);
    res.sendFile(realPath);
  } catch (error) {
    console.error('[serveEvidenceFile]', error);
    res.status(500).json({ error: 'Failed to serve file' });
  }
};

export const verifyEvidenceChecksum = async (req: Request, res: Response) => {
  try {
    const file = await getEvidenceFile(paramString(req.params.evidenceId));
    if (!file || file.status !== 'ACTIVE') return res.status(404).json({ error: 'Evidence not found' });
    const allowed = await canAccessEvidenceFile(file, req);
    if (!allowed) return res.status(403).json({ error: 'Not allowed to verify this file' });

    const ok = await verifyFileChecksum(file.id);
    void logEvent({
      ...getRequestContext(req),
      treeId: file.treeId,
      action: ok ? 'EVIDENCE_CHECKSUM_VERIFIED' : 'EVIDENCE_CHECKSUM_MISMATCH',
      entityType: 'EvidenceFile',
      entityId: file.id,
      metadataJson: getRequestMetadata(req, { result: ok ? 'match' : 'mismatch' }),
      severity: ok ? 'INFO' : 'CRITICAL',
      source: 'USER',
    });
    res.json({ id: file.id, checksumSha256: file.checksumSha256, valid: ok });
  } catch (error) {
    console.error('[verifyEvidenceChecksum]', error);
    res.status(500).json({ error: 'Failed to verify checksum' });
  }
};

export const deleteEvidenceFile = async (req: Request, res: Response) => {
  try {
    const file = await getEvidenceFile(paramString(req.params.evidenceId));
    if (!file || file.status !== 'ACTIVE') return res.status(404).json({ error: 'Evidence not found' });
    const allowed = await canAccessEvidenceFile(file, req);
    if (!allowed || (req.user?.id !== file.uploaderId && req.user?.role !== 'ADMINISTRATOR')) {
      return res.status(403).json({ error: 'Not allowed to delete this evidence' });
    }

    const updated = await (prisma as any).evidenceFile.update({
      where: { id: file.id },
      data: { status: 'DELETED' },
    });
    void logEvent({
      ...getRequestContext(req),
      treeId: file.treeId,
      action: 'EVIDENCE_FILE_DELETED',
      entityType: 'EvidenceFile',
      entityId: file.id,
      beforeJson: { status: file.status },
      afterJson: { status: updated.status },
      metadataJson: getRequestMetadata(req, { deletionType: 'logical' }),
      source: 'USER',
    });
    res.json(toSafeEvidenceMetadata(updated, false));
  } catch (error) {
    console.error('[deleteEvidenceFile]', error);
    res.status(500).json({ error: 'Failed to delete evidence' });
  }
};
