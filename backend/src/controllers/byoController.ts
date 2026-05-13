import { Request, Response } from 'express';
import * as crypto from 'crypto';
import { prisma } from '../index';
import {
  estimateInternalCost,
  computeSavings,
  MONTHLY_SUBSCRIPTION_COST,
  isEligibleForPayout,
  computePayoutAmount,
} from '../services/savingsCalculator';

/**
 * POST /api/byo/register
 * Registra una IA externa del usuario. Hashea la API key con SHA-256.
 */
export const registerAI = async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const { name, provider, apiKey, endpoint } = req.body;

    if (!name || !provider || !apiKey) {
      return res.status(400).json({ error: 'name, provider, and apiKey are required' });
    }

    const validProviders = ['OPENAI', 'DEEPSEEK', 'ANTHROPIC', 'CUSTOM'];
    if (!validProviders.includes(provider)) {
      return res.status(400).json({ error: `Invalid provider. Must be one of: ${validProviders.join(', ')}` });
    }

    if (provider === 'CUSTOM' && !endpoint) {
      return res.status(400).json({ error: 'endpoint is required for CUSTOM provider' });
    }

    const apiKeyHash = crypto.createHash('sha256').update(apiKey).digest('hex');

    const ai = await prisma.userAI.create({
      data: {
        userId,
        name,
        provider,
        apiKeyHash,
        endpoint: endpoint || null,
      },
      select: {
        id: true,
        name: true,
        provider: true,
        status: true,
        endpoint: true,
        monthlySavings: true,
        totalPayout: true,
        createdAt: true,
      },
    });

    res.status(201).json(ai);
  } catch (error: any) {
    console.error('[byo] registerAI error:', error);
    res.status(500).json({ error: 'Failed to register AI', detail: error.message });
  }
};

/**
 * GET /api/byo/my-ais
 * Lista las IAs registradas por el usuario autenticado. NUNCA expone apiKeyHash.
 */
export const listMyAIs = async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;

    const ais = await prisma.userAI.findMany({
      where: { userId },
      select: {
        id: true,
        name: true,
        provider: true,
        status: true,
        endpoint: true,
        monthlySavings: true,
        totalPayout: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    res.json({ ais, total: ais.length });
  } catch (error: any) {
    console.error('[byo] listMyAIs error:', error);
    res.status(500).json({ error: 'Failed to list AIs', detail: error.message });
  }
};

/**
 * DELETE /api/byo/:id
 * Elimina una IA registrada. Solo el dueño puede eliminarla.
 */
export const deleteAI = async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const aiId = req.params.id as string;

    const ai = await prisma.userAI.findUnique({ where: { id: aiId } });
    if (!ai) {
      return res.status(404).json({ error: 'AI not found' });
    }
    if (ai.userId !== userId) {
      return res.status(403).json({ error: 'Not your AI' });
    }

    await prisma.userAI.delete({ where: { id: aiId } });
    res.json({ success: true, deleted: aiId });
  } catch (error: any) {
    console.error('[byo] deleteAI error:', error);
    res.status(500).json({ error: 'Failed to delete AI', detail: error.message });
  }
};

/**
 * GET /api/byo/savings
 * Ahorros del mes actual + historial mensual + elegibilidad de payout.
 *
 * El "mes actual" se deriva de updatedAt (última actualización del registro).
 * Si no hay registros actualizados este mes, devuelve 0.
 */
export const getSavings = async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;

    const now = new Date();
    const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

    // Sumar monthlySavings de todas las IAs activas del usuario
    const ais = await prisma.userAI.findMany({
      where: { userId, status: 'ACTIVE' },
      select: { monthlySavings: true, totalPayout: true, name: true, provider: true },
    });

    const totalMonthlySavings = ais.reduce((sum, ai) => sum + ai.monthlySavings, 0);
    const totalAllTimePayout = ais.reduce((sum, ai) => sum + ai.totalPayout, 0);
    const eligible = isEligibleForPayout(totalMonthlySavings);
    const payoutAmount = eligible ? computePayoutAmount(totalMonthlySavings) : 0;

    // Estimar ahorro basado en tokens (placeholder — en producción se leería de AiExecution)
    const estimatedSavings = ais.reduce((sum, ai) => {
      // Asumimos ~100K tokens por mes como estimación base
      const internalCost = estimateInternalCost(ai.provider, 100_000);
      const userCost = 0; // El usuario asume el costo de su propia API key
      return sum + computeSavings(internalCost, userCost);
    }, 0);

    res.json({
      month: monthKey,
      monthlySavings: totalMonthlySavings,
      estimatedSavings,
      allTimePayout: totalAllTimePayout,
      subscriptionCost: MONTHLY_SUBSCRIPTION_COST,
      payoutEligible: eligible,
      payoutAmount,
      ais: ais.map(a => ({
        name: a.name,
        provider: a.provider,
        monthlySavings: a.monthlySavings,
      })),
    });
  } catch (error: any) {
    console.error('[byo] getSavings error:', error);
    res.status(500).json({ error: 'Failed to get savings', detail: error.message });
  }
};
