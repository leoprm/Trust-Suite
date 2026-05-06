import { Request, Response } from 'express';
import fs from 'fs/promises';
import path from 'path';
import { prisma } from '../index';
import { resolveBranchTreeId } from '../utils/economicEngine';
import {
  buildEvidenceStoragePath,
  calculateSha256,
  ensureUploadRoot,
  resolveStoragePath,
  sanitizeOriginalName,
  toSafeEvidenceMetadata,
  validateUploadFile,
  type EvidenceVisibility,
} from '../utils/fileSecurity';
import { getRequestContext, getRequestMetadata, logEvent } from '../services/eventLogService';

const ALLOWED_VISIBILITIES = new Set<EvidenceVisibility>([
  'PRIVATE',
  'TASK_PARTICIPANTS',
  'TREE_ONLY',
  'TRUST_NETWORK',
  'PUBLIC_METADATA',
  'PUBLIC',
]);

async function canUploadEvidenceForTask(userId: string, task: any, treeId: string | null) {
  if (task.assignedTo === userId || task.creatorId === userId) return true;
  if (!treeId) return false;
  const membership = await (prisma as any).treeMember.findUnique({
    where: { userId_treeId: { userId, treeId } },
    select: { id: true, status: true },
  });
  return Boolean(membership && membership.status === 'VERIFIED');
}

async function createEvidenceFileRecord(req: Request, taskId: string) {
  const userId = req.user!.id;
  const file = req.file;
  if (!file) {
    return { errorStatus: 400, error: 'No se recibio ningun archivo' };
  }

  const task = await (prisma as any).task.findUnique({
    where: { id: taskId },
    include: {
      branch: {
        include: {
          tree: true,
          idea: { include: { need: { include: { treeLinks: true } } } },
        },
      },
    },
  });
  if (!task) return { errorStatus: 404, error: 'Task not found' };

  const treeId = await resolveBranchTreeId(task.branchId);
  const allowed = await canUploadEvidenceForTask(userId, task, treeId);
  if (!allowed) {
    void logEvent({
      ...getRequestContext(req),
      treeId,
      action: 'PERMISSION_DENIED',
      entityType: 'Task',
      entityId: taskId,
      metadataJson: getRequestMetadata(req, { reason: 'task_evidence_upload_denied' }),
      severity: 'WARNING',
      source: 'USER',
    });
    return { errorStatus: 403, error: 'No tienes permiso para subir evidencia a esta tarea' };
  }

  const validation = validateUploadFile(file);
  if (!validation.ok) {
    void logEvent({
      ...getRequestContext(req),
      treeId,
      action: 'SUSPICIOUS_FILE_UPLOAD_BLOCKED',
      entityType: 'Task',
      entityId: taskId,
      metadataJson: getRequestMetadata(req, {
        reason: validation.reason,
        originalName: sanitizeOriginalName(file.originalname),
        mimeType: file.mimetype,
        sizeBytes: file.size,
      }),
      severity: 'WARNING',
      source: 'USER',
    });
    return { errorStatus: 400, error: 'Archivo no permitido' };
  }

  const requestedVisibility = req.body?.visibility as EvidenceVisibility | undefined;
  const visibility = requestedVisibility && ALLOWED_VISIBILITIES.has(requestedVisibility)
    ? requestedVisibility
    : 'PRIVATE';

  ensureUploadRoot();
  const { storedName, relativeDir, relativePath } = buildEvidenceStoragePath(validation.extension);
  await fs.mkdir(resolveStoragePath(relativeDir), { recursive: true });
  const realPath = resolveStoragePath(relativePath);
  await fs.writeFile(realPath, file.buffer);
  const checksumSha256 = await calculateSha256(realPath);

  const evidence = await (prisma as any).evidenceFile.create({
    data: {
      uploaderId: userId,
      treeId,
      taskId,
      originalName: validation.originalName,
      storedName,
      storagePath: relativePath,
      mimeType: file.mimetype,
      extension: validation.extension,
      sizeBytes: file.size,
      visibility,
      checksumSha256,
    },
    include: { task: { select: { evidenceStatus: true } } },
  });

  void logEvent({
    ...getRequestContext(req),
    treeId,
    action: 'TASK_EVIDENCE_UPLOADED',
    entityType: 'EvidenceFile',
    entityId: evidence.id,
    afterJson: {
      id: evidence.id,
      taskId,
      mimeType: evidence.mimeType,
      extension: evidence.extension,
      sizeBytes: evidence.sizeBytes,
      visibility: evidence.visibility,
      checksumSha256: evidence.checksumSha256,
    },
    metadataJson: getRequestMetadata(req, { taskId, result: 'success' }),
    source: 'USER',
  });

  const metadata = toSafeEvidenceMetadata(evidence, true);
  return {
    evidence,
    response: {
      ...metadata,
      url: metadata.downloadUrl,
    },
  };
}

export const uploadTaskEvidence = async (req: Request, res: Response) => {
  try {
    const taskId = req.params.id || req.body?.taskId;
    if (!taskId) return res.status(400).json({ error: 'taskId is required' });
    const result = await createEvidenceFileRecord(req, taskId);
    if ('error' in result) return res.status(result.errorStatus ?? 500).json({ error: result.error });
    res.status(201).json(result.response);
  } catch (error: any) {
    console.error('[uploadTaskEvidence]', error);
    res.status(500).json({ error: 'Error al procesar evidencia' });
  }
};

export const uploadEvidence = async (req: Request, res: Response) => {
  try {
    const taskId = req.body?.taskId;
    if (!taskId) {
      return res.status(400).json({ error: 'taskId is required. Use /api/tasks/:id/evidence for task evidence.' });
    }
    const result = await createEvidenceFileRecord(req, taskId);
    if ('error' in result) return res.status(result.errorStatus ?? 500).json({ error: result.error });
    res.status(201).json(result.response);
  } catch (error: any) {
    console.error('[uploadEvidence]', error);
    res.status(500).json({ error: 'Error al procesar evidencia' });
  }
};
