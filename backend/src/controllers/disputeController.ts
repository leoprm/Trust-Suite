import { Request, Response } from 'express';
import {
  freezeFunds,
  resolveDispute,
  getActiveDisputes,
} from '../services/disputeService';
import { getSigners } from '../services/signerService';

// ── POST /api/payments/:id/dispute ──────────────────────────────────────

export async function openDisputeHandler(req: Request, res: Response) {
  try {
    const paymentId = String(req.params.id);
    const { reason } = req.body;

    if (!reason || typeof reason !== 'string' || reason.trim().length === 0) {
      return res.status(400).json({ error: 'reason is required' });
    }

    const payment = await freezeFunds(paymentId, reason.trim(), req.user!.id);

    return res.status(201).json(payment);
  } catch (err: any) {
    return res.status(400).json({ error: err.message });
  }
}

// ── GET /api/trees/:id/disputes ─────────────────────────────────────────

export async function listDisputesHandler(req: Request, res: Response) {
  try {
    const treeId = String(req.params.id);

    // Only signers can see disputes
    const signers = await getSigners(treeId);
    const isSigner = signers.some((s) => s.userId === req.user!.id);

    if (!isSigner) {
      return res.status(403).json({ error: 'Only signers can view disputes' });
    }

    const disputes = await getActiveDisputes(treeId);
    return res.json(disputes);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
}

// ── POST /api/disputes/:paymentId/resolve ───────────────────────────────

export async function resolveDisputeHandler(req: Request, res: Response) {
  try {
    const paymentId = String(req.params.paymentId);
    const { action, splitPct } = req.body;

    if (!action || !['release', 'refund', 'split'].includes(action)) {
      return res
        .status(400)
        .json({ error: 'action must be one of: release, refund, split' });
    }

    if (action === 'split' && (splitPct === undefined || typeof splitPct !== 'number')) {
      return res
        .status(400)
        .json({ error: 'splitPct (number) is required for split action' });
    }

    const updated = await resolveDispute(
      paymentId,
      { action, splitPct },
      req.user!.id,
    );

    return res.json(updated);
  } catch (err: any) {
    return res.status(400).json({ error: err.message });
  }
}
