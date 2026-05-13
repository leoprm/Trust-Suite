import { Response } from 'express';

// ── memberPayment model was deleted (TM1-TM6 cleanup) ────────────────────
// These endpoints are no-op stubs to avoid breaking imports.

export const uploadReceipt = async (_req: any, res: Response) => {
  return res.status(410).json({ error: 'Payment receipts are no longer supported' });
};

export const getPayment = async (_req: any, res: Response) => {
  return res.status(410).json({ error: 'Payment tracking is no longer supported' });
};

export const getReceipt = async (_req: any, res: Response) => {
  return res.status(410).json({ error: 'Receipt retrieval is no longer supported' });
};
