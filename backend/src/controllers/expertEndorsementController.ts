import { Request, Response } from 'express';
import {
  createEndorsement,
  resolveEndorsement,
  getEndorsementBoostStatus,
  getEndorsementsForTree,
} from '../services/expertEndorsementService';

export async function createEndorsementHandler(req: Request, res: Response) {
  try {
    const { treeId, endorsedMemberId, expertise, requiredTasks, satisfactionThreshold } = req.body;
    if (!treeId || !endorsedMemberId || !expertise) {
      return res.status(400).json({ error: 'treeId, endorsedMemberId, and expertise are required' });
    }
    const result = await createEndorsement(req.user!.id, {
      treeId,
      endorsedMemberId,
      expertise,
      requiredTasks,
      satisfactionThreshold,
    });
    return res.status(201).json(result);
  } catch (err: any) {
    return res.status(400).json({ error: err.message });
  }
}

export async function resolveEndorsementHandler(req: Request, res: Response) {
  try {
    const endorsementId = String(req.params.endorsementId || '');
    const { status, evidenceTaskIds, avgSatisfaction, completedTasks, resolutionNote } = req.body;
    if (!status || !['SUCCESS', 'FAILED_PERFORMANCE', 'FAILED_FRAUD'].includes(status)) {
      return res.status(400).json({ error: 'status must be SUCCESS, FAILED_PERFORMANCE, or FAILED_FRAUD' });
    }
    const result = await resolveEndorsement(req.user!.id, {
      endorsementId,
      status,
      evidenceTaskIds,
      avgSatisfaction,
      completedTasks,
      resolutionNote,
    });
    return res.json(result);
  } catch (err: any) {
    return res.status(400).json({ error: err.message });
  }
}

export async function getEndorsementsHandler(req: Request, res: Response) {
  try {
    const treeId = String(req.query.treeId || '');
    const memberId = req.query.memberId ? String(req.query.memberId) : undefined;
    if (!treeId) return res.status(400).json({ error: 'treeId query param is required' });
    const result = await getEndorsementsForTree(treeId, memberId, req.user!.id);
    return res.json(result);
  } catch (err: any) {
    return res.status(400).json({ error: err.message });
  }
}

export async function getEndorsementBoostHandler(req: Request, res: Response) {
  try {
    const treeId = String(req.query.treeId || '');
    if (!treeId) return res.status(400).json({ error: 'treeId query param is required' });
    const result = await getEndorsementBoostStatus(req.user!.id, treeId);
    return res.json(result);
  } catch (err: any) {
    return res.status(400).json({ error: err.message });
  }
}
