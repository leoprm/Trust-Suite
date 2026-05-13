import { Request, Response } from 'express';
import { processConcierge, processConciergeChat } from '../services/conciergeService';

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

export const handleConciergeChat = async (req: any, res: Response) => {
  try {
    const { message, treeId } = req.body;
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ error: 'Autenticación requerida para el chat con herramientas.' });
    }

    if (!message || typeof message !== 'string' || message.trim().length === 0) {
      return res.status(400).json({
        error: 'Se requiere un mensaje en lenguaje natural (campo "message").',
      });
    }

    console.log(`[concierge:chat] userId=${userId.slice(0,8)} msg="${message.slice(0,40)}" treeId=${treeId || 'none'}`);
    const result = await processConciergeChat(message.trim(), userId, treeId);

    return res.json(result);
  } catch (err: any) {
    console.error('[concierge] chat error:', err.message, err.stack?.slice(0, 300));
    return res.status(500).json({ error: 'Error interno al procesar la solicitud.' });
  }
};
