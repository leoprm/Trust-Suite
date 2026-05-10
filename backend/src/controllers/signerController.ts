import { Request, Response } from 'express';
import {
  getSigners,
  addSigner,
  removeSigner,
} from '../services/signerService';

// ── GET /api/trees/:id/signers ─────────────────────────────────────────

export async function listSignersHandler(req: Request, res: Response) {
  try {
    const treeId = String(req.params.id);
    const signers = await getSigners(treeId);
    return res.json(signers);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
}

// ── POST /api/trees/:id/signers ────────────────────────────────────────

export async function createSignerHandler(req: Request, res: Response) {
  try {
    const treeId = String(req.params.id);
    const { userId } = req.body;

    if (!userId) {
      return res.status(400).json({ error: 'userId is required' });
    }

    const result = await addSigner(treeId, userId, req.user!.id);

    return res.status(201).json(result);
  } catch (err: any) {
    return res.status(400).json({ error: err.message });
  }
}

// ── DELETE /api/trees/:id/signers/:userId ──────────────────────────────

export async function deleteSignerHandler(req: Request, res: Response) {
  try {
    const treeId = String(req.params.id);
    const targetUserId = String(req.params.userId);

    if (!targetUserId) {
      return res.status(400).json({ error: 'userId is required' });
    }

    const result = await removeSigner(treeId, targetUserId, req.user!.id);

    return res.json(result);
  } catch (err: any) {
    return res.status(400).json({ error: err.message });
  }
}
