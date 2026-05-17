import { Request, Response } from 'express';
import { prisma } from '../index';
import { logEvent, getRequestContext } from '../services/eventLogService';

// ── Lazy bot access (avoids circular dependency at module load time) ────
let _cachedBot: any = null;
function getBot(): any | null {
  if (_cachedBot !== null) return _cachedBot;
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const idx = require('../index');
    _cachedBot = idx.telegramBot ?? null;
  } catch {
    _cachedBot = undefined;
  }
  return _cachedBot ?? null;
}

// ── Helpers ──────────────────────────────────────────────────────────────

function computeAvgDifficulty(tasks: { title: string; difficulty: number }[]): number {
  if (!tasks || tasks.length === 0) return 0;
  const sum = tasks.reduce((acc, t) => acc + (t.difficulty || 1), 0);
  return Math.round((sum / tasks.length) * 10) / 10;
}

async function getExchangeRate(): Promise<number> {
  try {
    const rate = await (prisma as any).exchangeRate.findUnique({
      where: { id: 'USD_CLP' },
      select: { rate: true },
    });
    if (rate?.rate) return rate.rate;
  } catch {
    // fallback
  }
  // Fallback: fetch live
  try {
    const res = await fetch('https://api.exchangerate-api.com/v4/latest/USD');
    if (res.ok) {
      const data = (await res.json()) as { rates: { CLP: number } };
      if (data.rates?.CLP) return data.rates.CLP;
    }
  } catch {
    // fallback
  }
  return 950; // default fallback ~950 CLP/USD
}

function formatProposalDM(tasks: { title: string; difficulty: number }[], estimatedCostCLP: number, treeName: string): string {
  const diffCounts: Record<number, number> = {};
  for (const t of tasks) {
    const d = t.difficulty || 1;
    diffCounts[d] = (diffCounts[d] || 0) + 1;
  }
  const diffSummary = Object.entries(diffCounts)
    .sort(([a], [b]) => Number(a) - Number(b))
    .map(([d, c]) => `${c}x dif.${d}`)
    .join(', ');

  return [
    `📋 Propuesta Kanban — ${treeName}`,
    `Tareas: ${tasks.length} (${diffSummary})`,
    `Costo estimado: ~${estimatedCostCLP.toLocaleString('es-CL')} CLP`,
    `¿Apruebas derivar a Kanban?`,
  ].join('\n');
}

// ── 1. POST /api/trees/:treeId/kanban/propose ──────────────────────────

export const proposeKanban = async (req: Request, res: Response) => {
  try {
    const { treeId } = req.params;
    const { tasks, estimatedCostCLP, chatId } = req.body;

    // Validate
    if (!treeId) return res.status(400).json({ error: 'treeId es requerido' });
    if (!tasks || !Array.isArray(tasks) || tasks.length === 0) {
      return res.status(400).json({ error: 'tasks debe ser un array no vacío' });
    }
    for (const t of tasks) {
      if (!t.title || typeof t.title !== 'string') {
        return res.status(400).json({ error: 'Cada task debe tener title (string)' });
      }
      if (typeof t.difficulty !== 'number' || t.difficulty < 1 || t.difficulty > 10) {
        return res.status(400).json({ error: 'Cada task debe tener difficulty (1-10)' });
      }
    }
    if (estimatedCostCLP == null || typeof estimatedCostCLP !== 'number' || estimatedCostCLP <= 0) {
      return res.status(400).json({ error: 'estimatedCostCLP debe ser un número positivo' });
    }

    // Verify tree exists & get name
    const tree = await (prisma as any).tree.findUnique({
      where: { id: treeId },
      select: { id: true, name: true },
    });
    if (!tree) return res.status(404).json({ error: 'Árbol no encontrado' });

    const difficultyAvg = computeAvgDifficulty(tasks);
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

    // Create proposal
    const proposal = await (prisma as any).kanbanProposal.create({
      data: {
        treeId,
        creatorId: req.user!.id,
        tasks: tasks,
        difficultyAvg,
        estimatedCostCLP,
        chatId: BigInt(chatId || 0),
        messageId: BigInt(0), // DM-based proposals don't have a single group message
        expiresAt,
        dmMessageIds: {},
      },
    });

    // Find active members with Telegram linked (dmActivated = has telegramUserId)
    const members = await (prisma as any).treeMember.findMany({
      where: { treeId, status: 'ACTIVE' },
      include: {
        user: { select: { id: true, telegramUserId: true, language: true } },
      },
    });

    const dmMembers = members.filter(
      (m: any) => m.user.telegramUserId != null,
    );

    // Send DMs with inline keyboard
    const bot = getBot();
    const dmMessageIds: Record<string, string> = {};
    let dmCount = 0;

    if (bot && dmMembers.length > 0) {
      const messageText = formatProposalDM(tasks, estimatedCostCLP, tree.name);

      for (const m of dmMembers) {
        try {
          const keyboard = {
            inline_keyboard: [
              [
                { text: '✅ Sí', callback_data: `kanban_vote:${proposal.id}:yes` },
                { text: '❌ No', callback_data: `kanban_vote:${proposal.id}:no` },
              ],
            ],
          };

          const sent = await bot.api.sendMessage(
            Number(m.user.telegramUserId),
            messageText,
            { reply_markup: keyboard },
          );

          dmMessageIds[m.userId] = String(sent.message_id);
          dmCount++;
        } catch (dmErr: any) {
          console.error(
            `[kanban:propose] Failed to send DM to user ${m.userId}:`,
            dmErr.message,
          );
          // Continue with other members — don't fail the whole proposal
        }
      }

      // Update proposal with dmMessageIds
      if (dmCount > 0) {
        await (prisma as any).kanbanProposal.update({
          where: { id: proposal.id },
          data: { dmMessageIds },
        });
      }
    }

    void logEvent({
      ...getRequestContext(req),
      treeId,
      actorId: req.user!.id,
      action: 'KANBAN_PROPOSAL_CREATED',
      entityType: 'KanbanProposal',
      entityId: proposal.id,
      metadataJson: {
        taskCount: tasks.length,
        difficultyAvg,
        estimatedCostCLP,
        dmCount,
        expiresAt: expiresAt.toISOString(),
      },
    });

    res.status(201).json({
      proposalId: proposal.id,
      dmCount,
    });
  } catch (error: any) {
    console.error('[kanban:propose] Error:', error.message);
    res.status(500).json({ error: 'Error al crear propuesta kanban' });
  }
};

// ── 2. POST /api/trees/:treeId/kanban/vote/:proposalId ─────────────────

export const voteKanban = async (req: Request, res: Response) => {
  try {
    const { treeId, proposalId } = req.params;
    const { vote, userId } = req.body;

    // Validate
    if (!vote || !['yes', 'no'].includes(vote)) {
      return res.status(400).json({ error: 'vote debe ser "yes" o "no"' });
    }
    if (!userId) {
      return res.status(400).json({ error: 'userId es requerido' });
    }

    // Verify proposal exists and is OPEN
    const proposal = await (prisma as any).kanbanProposal.findUnique({
      where: { id: proposalId },
    });
    if (!proposal) {
      return res.status(404).json({ error: 'Propuesta no encontrada' });
    }
    if (proposal.treeId !== treeId) {
      return res.status(400).json({ error: 'La propuesta no pertenece a este árbol' });
    }
    if (proposal.status !== 'OPEN') {
      return res.status(400).json({ error: `La propuesta ya está ${proposal.status}` });
    }
    if (new Date() > new Date(proposal.expiresAt)) {
      return res.status(400).json({ error: 'La propuesta ha expirado' });
    }

    // Verify userId is active member of the tree
    const member = await (prisma as any).treeMember.findUnique({
      where: { userId_treeId: { userId, treeId } },
    });
    if (!member || member.status !== 'ACTIVE') {
      return res.status(403).json({ error: 'El usuario no es miembro activo de este árbol' });
    }

    // Check for double vote (unique constraint on proposalId+userId)
    const existingVote = await (prisma as any).kanbanVote.findUnique({
      where: { proposalId_userId: { proposalId, userId } },
    });
    if (existingVote) {
      return res.status(409).json({ error: 'El usuario ya votó en esta propuesta' });
    }

    // Record the vote
    await (prisma as any).kanbanVote.create({
      data: { proposalId, userId, vote },
    });

    // Increment counter
    const updateData =
      vote === 'yes'
        ? { votesYes: { increment: 1 } }
        : { votesNo: { increment: 1 } };

    const updated = await (prisma as any).kanbanProposal.update({
      where: { id: proposalId },
      data: updateData,
    });

    // Edit the user's DM to show their vote and remove buttons
    const bot = getBot();
    if (bot) {
      try {
        const dmMessageIds = proposal.dmMessageIds || {};
        const messageId = dmMessageIds[userId];

        if (messageId) {
          // Find user's telegramUserId
          const user = await (prisma as any).user.findUnique({
            where: { id: userId },
            select: { telegramUserId: true },
          });

          if (user?.telegramUserId) {
            const voteLabel = vote === 'yes' ? 'Sí' : 'No';
            const emoji = vote === 'yes' ? '✅' : '❌';

            // Get original message text
            const originalText = formatProposalDM(
              proposal.tasks,
              proposal.estimatedCostCLP,
              '', // tree name not needed for edit
            );

            await bot.api.editMessageText(
              Number(user.telegramUserId),
              Number(messageId),
              `${originalText}\n\n${emoji} Tu voto: ${voteLabel}`,
              { reply_markup: undefined },
            );
          }
        }
      } catch (editErr: any) {
        console.warn(
          `[kanban:vote] Could not edit DM for user ${userId}:`,
          editErr.message,
        );
        // Non-fatal — vote is already recorded
      }
    }

    void logEvent({
      ...getRequestContext(req),
      treeId,
      actorId: userId,
      action: 'KANBAN_PROPOSAL_VOTED',
      entityType: 'KanbanProposal',
      entityId: proposalId,
      metadataJson: { vote },
    });

    res.json({
      proposalId,
      vote,
      votesYes: updated.votesYes,
      votesNo: updated.votesNo,
      totalVotes: updated.votesYes + updated.votesNo,
    });
  } catch (error: any) {
    // Prisma unique constraint violation → double vote
    if (error?.code === 'P2002') {
      return res.status(409).json({ error: 'El usuario ya votó en esta propuesta' });
    }
    console.error('[kanban:vote] Error:', error.message);
    res.status(500).json({ error: 'Error al registrar voto' });
  }
};

// ── 3. GET /api/trees/:treeId/kanban/cost-stats ────────────────────────

export const getCostStats = async (req: Request, res: Response) => {
  try {
    const { treeId } = req.params;

    // Verify tree exists
    const tree = await (prisma as any).tree.findUnique({
      where: { id: treeId },
      select: { id: true },
    });
    if (!tree) return res.status(404).json({ error: 'Árbol no encontrado' });

    // Last 30 days
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const logs = await (prisma as any).kanbanCostLog.findMany({
      where: {
        treeId,
        createdAt: { gte: thirtyDaysAgo },
      },
    });

    // Group by difficulty (1, 2, 3)
    const averages: Record<string, { avgUSD: number; avgCLP: number; count: number }> = {};

    for (const difficulty of [1, 2, 3]) {
      const items = logs.filter((l: any) => l.difficulty === difficulty);
      if (items.length > 0) {
        const sumUSD = items.reduce((s: number, l: any) => s + l.costUSD, 0);
        const sumCLP = items.reduce((s: number, l: any) => s + l.costCLP, 0);
        averages[String(difficulty)] = {
          avgUSD: Math.round((sumUSD / items.length) * 100) / 100,
          avgCLP: Math.round((sumCLP / items.length) * 100) / 100,
          count: items.length,
        };
      }
    }

    res.json({ averages });
  } catch (error: any) {
    console.error('[kanban:cost-stats] Error:', error.message);
    res.status(500).json({ error: 'Error al obtener estadísticas de costos' });
  }
};

// ── 4. POST /api/trees/:treeId/kanban/cost-log ─────────────────────────

export const logCost = async (req: Request, res: Response) => {
  try {
    const { treeId } = req.params;
    const {
      externalTaskId,
      difficulty,
      costUSD,
      promptTokens,
      completionTokens,
      proposalId,
    } = req.body;

    // Validate
    if (!externalTaskId || typeof externalTaskId !== 'string') {
      return res.status(400).json({ error: 'externalTaskId es requerido (string)' });
    }
    if (typeof difficulty !== 'number' || difficulty < 1 || difficulty > 3) {
      return res.status(400).json({ error: 'difficulty debe ser 1, 2 o 3' });
    }
    if (typeof costUSD !== 'number' || costUSD < 0) {
      return res.status(400).json({ error: 'costUSD debe ser un número no negativo' });
    }

    // Verify tree exists
    const tree = await (prisma as any).tree.findUnique({
      where: { id: treeId },
      select: { id: true },
    });
    if (!tree) return res.status(404).json({ error: 'Árbol no encontrado' });

    // Get exchange rate
    const exchangeRate = await getExchangeRate();
    const costCLP = Math.round(costUSD * exchangeRate * 100) / 100;

    const log = await (prisma as any).kanbanCostLog.create({
      data: {
        treeId,
        proposalId: proposalId || null,
        externalTaskId,
        difficulty,
        promptTokens: promptTokens || 0,
        completionTokens: completionTokens || 0,
        costUSD,
        costCLP,
        exchangeRate,
      },
    });

    void logEvent({
      ...getRequestContext(req),
      treeId,
      actorId: req.user!.id,
      action: 'KANBAN_COST_LOGGED',
      entityType: 'KanbanCostLog',
      entityId: log.id,
      metadataJson: {
        externalTaskId,
        difficulty,
        costUSD,
        costCLP,
        exchangeRate,
      },
    });

    res.status(201).json({
      id: log.id,
      costUSD,
      costCLP,
      exchangeRate,
      difficulty,
      externalTaskId,
    });
  } catch (error: any) {
    console.error('[kanban:cost-log] Error:', error.message);
    res.status(500).json({ error: 'Error al registrar costo' });
  }
};
