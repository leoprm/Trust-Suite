import { Request, Response } from 'express';
import { prisma } from '../index';

/**
 * ============================================================
 *  BONUS POOL CONTROLLER — Bolsa de Valores Éticos
 * ============================================================
 *
 * MAX_TOTAL_BONUS = 1.0 (100% extra XP máximo).
 * Cada bono obtiene un porcentaje proporcional a sus votos
 * respecto del total de puntos de todos los bonos del árbol.
 *
 * porcentaje_bono_i = (puntos_bono_i / suma_total_puntos) * 1.0
 */

const MAX_TOTAL_BONUS = 1.0;
const BONUS_PREFIX = '%';

function stripLegacyBonusPrefix(tag: string): string {
  return tag.trim().replace(/^[#%]/, '').trim();
}

function normalizeBonusTag(tag: string): string {
  return `${BONUS_PREFIX}${stripLegacyBonusPrefix(tag)}`;
}

async function refreshBonusPointsFromVotes(treeId: string): Promise<void> {
  const bonuses = await (prisma as any).bonusPool.findMany({
    where: { treeId },
    include: { votes: { select: { score: true } } },
  });

  await Promise.all(
    bonuses.map((bonus: any) => {
      const total = (bonus.votes || []).reduce((sum: number, v: any) => sum + Number(v.score || 0), 0);
      return (prisma as any).bonusPool.update({
        where: { id: bonus.id },
        data: { puntosImportanciaTotal: total },
      });
    })
  );
}

async function migrateLegacyBonusTags(treeId: string): Promise<void> {
  const legacyBonuses = await (prisma as any).bonusPool.findMany({
    where: { treeId, hashtag: { startsWith: '#' } },
    include: { votes: true },
  });

  if (legacyBonuses.length === 0) return;

  for (const legacy of legacyBonuses) {
    const targetTag = normalizeBonusTag(legacy.hashtag);

    const existing = await (prisma as any).bonusPool.findUnique({
      where: { treeId_hashtag: { treeId, hashtag: targetTag } },
      include: { votes: true },
    });

    if (!existing) {
      await (prisma as any).bonusPool.update({
        where: { id: legacy.id },
        data: { hashtag: targetTag },
      });
      continue;
    }

    // Merge legacy votes into existing target tag, preserving one vote per user.
    const existingUserIds = new Set((existing.votes || []).map((v: any) => v.userId));
    for (const vote of legacy.votes || []) {
      if (existingUserIds.has(vote.userId)) continue;
      await (prisma as any).bonusVote.create({
        data: {
          bonusPoolId: existing.id,
          userId: vote.userId,
          score: vote.score,
        },
      });
    }

    await (prisma as any).bonusPool.delete({ where: { id: legacy.id } });
  }

  await refreshBonusPointsFromVotes(treeId);
  await recalculateBonusPercentages(treeId);
}

// ─── Recalcular porcentajes de todos los bonos de un árbol ──

export async function recalculateBonusPercentages(treeId: string): Promise<void> {
  const bonuses = await (prisma as any).bonusPool.findMany({
    where: { treeId },
  });

  if (bonuses.length === 0) return;

  const sumaTotalPuntos: number = bonuses.reduce(
    (sum: number, b: any) => sum + Number(b.puntosImportanciaTotal || 0),
    0
  );

  for (const bonus of bonuses) {
    const puntos = Number(bonus.puntosImportanciaTotal || 0);
    const porcentaje =
      sumaTotalPuntos > 0
        ? (puntos / sumaTotalPuntos) * MAX_TOTAL_BONUS
        : 0;

    await (prisma as any).bonusPool.update({
      where: { id: bonus.id },
      data: { porcentajeActual: porcentaje },
    });
  }

  console.log(
    `[BonusPool] Árbol ${treeId}: ${bonuses.length} bonos redistribuidos. Suma total = ${sumaTotalPuntos.toFixed(1)} pts.`
  );
}

// ─── GET /api/bonus?treeId=xxx ──────────────────────────────

export const getBonuses = async (req: Request, res: Response) => {
  try {
    const { treeId } = req.query;
    if (!treeId) return res.status(400).json({ error: 'treeId requerido' });

    await migrateLegacyBonusTags(treeId as string);

    const bonuses = await (prisma as any).bonusPool.findMany({
      where: { treeId: treeId as string },
      include: {
        votes: {
          select: { userId: true, score: true },
        },
      },
      orderBy: { porcentajeActual: 'desc' },
    });

    res.json(bonuses);
  } catch (error: any) {
    console.error('[BonusPool] getBonuses error:', error);
    res.status(500).json({ error: 'Error al obtener bonos' });
  }
};

// ─── POST /api/bonus — Crear bono (cualquier miembro) ───────

export const createBonus = async (req: any, res: Response) => {
  try {
    const { treeId, hashtag } = req.body;
    if (!treeId || !hashtag) {
      return res.status(400).json({ error: 'treeId y hashtag son requeridos' });
    }

    // Normalize bonus tag to always use % prefix.
    const normalizedTag = normalizeBonusTag(hashtag);

    // Keep legacy rows migrated before checking uniqueness.
    await migrateLegacyBonusTags(treeId);

    // Verificar que el usuario pertenece al árbol
    const userId = req.user?.id;
    const membership = await prisma.treeMember.findUnique({
      where: { userId_treeId: { userId, treeId } },
    });
    if (!membership) {
      return res.status(403).json({ error: 'Debes ser miembro del árbol para crear bonos' });
    }

    // Verificar unicidad
    const existing = await (prisma as any).bonusPool.findUnique({
      where: { treeId_hashtag: { treeId, hashtag: normalizedTag } },
    });
    if (existing) {
      return res.status(409).json({ error: `El bono "${normalizedTag}" ya existe en este árbol` });
    }

    const bonus = await (prisma as any).bonusPool.create({
      data: {
        treeId,
        hashtag: normalizedTag,
        puntosImportanciaTotal: 0,
        porcentajeActual: 0,
      },
    });

    // Recalcular porcentajes (el nuevo entra con 0 puntos, no cambia distribución
    // pero mantiene coherencia)
    await recalculateBonusPercentages(treeId);

    res.status(201).json(bonus);
  } catch (error: any) {
    console.error('[BonusPool] createBonus error:', error);
    res.status(500).json({ error: 'Error al crear bono' });
  }
};

// ─── POST /api/bonus/:id/vote — Votar importancia (nivel 3+) ─

export const voteBonus = async (req: any, res: Response) => {
  try {
    const { id } = req.params; // bonusPoolId
    const { score } = req.body; // 1–10

    const numScore = Number(score);
    if (!numScore || numScore < 1 || numScore > 10) {
      return res.status(400).json({ error: 'score debe ser un entero entre 1 y 10' });
    }

    const userId = req.user?.id;

    // Buscar el bono
    const bonus = await (prisma as any).bonusPool.findUnique({
      where: { id },
    });
    if (!bonus) return res.status(404).json({ error: 'Bono no encontrado' });

    // Gate: el usuario debe tener nivel >= 3 en el árbol (creador del árbol exento)
    const tree = await prisma.tree.findUnique({ where: { id: bonus.treeId } });
    const isTreeCreator = tree?.creatorId === userId;

    const membership = await prisma.treeMember.findUnique({
      where: { userId_treeId: { userId, treeId: bonus.treeId } },
    });
    if (!membership) {
      return res.status(403).json({ error: 'Debes ser miembro del árbol' });
    }
    if (membership.level < 3 && !isTreeCreator) {
      return res.status(403).json({ error: 'Requiere Nivel 3+ para votar importancia de bonos' });
    }

    // Upsert vote
    const existingVote = await (prisma as any).bonusVote.findUnique({
      where: { bonusPoolId_userId: { bonusPoolId: id, userId } },
    });

    let oldScore = 0;
    if (existingVote) {
      oldScore = existingVote.score;
      await (prisma as any).bonusVote.update({
        where: { id: existingVote.id },
        data: { score: numScore },
      });
    } else {
      await (prisma as any).bonusVote.create({
        data: {
          bonusPoolId: id,
          userId,
          score: numScore,
        },
      });
    }

    // Update puntosImportanciaTotal (suma delta)
    const delta = numScore - oldScore;
    await (prisma as any).bonusPool.update({
      where: { id },
      data: { puntosImportanciaTotal: { increment: delta } },
    });

    // Recalcular porcentajes de todo el árbol
    await recalculateBonusPercentages(bonus.treeId);

    // Return updated bonus
    const updated = await (prisma as any).bonusPool.findUnique({
      where: { id },
      include: { votes: { select: { userId: true, score: true } } },
    });

    res.json(updated);
  } catch (error: any) {
    console.error('[BonusPool] voteBonus error:', error);
    res.status(500).json({ error: 'Error al votar' });
  }
};

// ─── DELETE /api/bonus/:id — Eliminar bono (admin only) ─────

export const deleteBonus = async (req: any, res: Response) => {
  try {
    const { id } = req.params;
    const userId = req.user?.id;

    const bonus = await (prisma as any).bonusPool.findUnique({ where: { id } });
    if (!bonus) return res.status(404).json({ error: 'Bono no encontrado' });

    // Verify admin
    const membership = await prisma.treeMember.findUnique({
      where: { userId_treeId: { userId, treeId: bonus.treeId } },
    });
    if (!membership || membership.role !== 'ADMIN') {
      // Also check if user is tree creator
      const tree = await prisma.tree.findUnique({ where: { id: bonus.treeId } });
      if (!tree || tree.creatorId !== userId) {
        return res.status(403).json({ error: 'Solo administradores pueden eliminar bonos' });
      }
    }

    await (prisma as any).bonusPool.delete({ where: { id } });

    // Recalculate remaining bonuses
    await recalculateBonusPercentages(bonus.treeId);

    res.json({ message: 'Bono eliminado' });
  } catch (error: any) {
    console.error('[BonusPool] deleteBonus error:', error);
    res.status(500).json({ error: 'Error al eliminar bono' });
  }
};

// ─── Utility: Get bonus multiplier for a set of tags ─────────
/**
 * Given a treeId and an array of tag strings (e.g. ["diseño", "ecologia"]),
 * returns the total bonus multiplier by matching against BonusPool hashtags.
 *
 * Multiplicador_Total = 1 + Σ(porcentaje de bonos que aplican)
 *
 * E.g. if %Sostenible = 0.25 and %Social = 0.15, and the task has both:
 *   multiplier = 1 + 0.25 + 0.15 = 1.40  →  40% extra XP
 */
export async function getBonusMultiplierForTags(
  treeId: string,
  taskTags: string[]
): Promise<number> {
  if (!taskTags.length) return 1;

  const bonuses = await (prisma as any).bonusPool.findMany({
    where: { treeId },
    select: { hashtag: true, porcentajeActual: true },
  });

  if (bonuses.length === 0) return 1;

  // Normalize task tags to lowercase without legacy prefix.
  const normalizedTaskTags = taskTags.map(t =>
    t.toLowerCase().replace(/^[#%]/, '').trim()
  );

  let bonusSum = 0;
  for (const bonus of bonuses) {
    const bonusTag = bonus.hashtag.toLowerCase().replace(/^[#%]/, '').trim();
    if (normalizedTaskTags.includes(bonusTag)) {
      bonusSum += Number(bonus.porcentajeActual || 0);
    }
  }

  return 1 + bonusSum;
}
