import { Request, Response } from 'express';
import { processConcierge } from '../services/conciergeService';

export const handleConcierge = async (req: any, res: Response) => {
  try {
    const { message, sessionId, mode, contextId, tutorialPhase } = req.body;
    const userId = req.user?.id; // from JWT auth middleware (undefined for guests)

    if (!message || typeof message !== 'string' || message.trim().length === 0) {
      return res.status(400).json({
        error: 'Se requiere un mensaje en lenguaje natural (campo "message").',
      });
    }

    const result = await processConcierge(message.trim(), sessionId, userId, mode, contextId, tutorialPhase);

    return res.json(result);
  } catch (err: any) {
    console.error('[concierge] error:', err);
    return res.status(500).json({ error: 'Error interno al procesar la solicitud.' });
  }
};
