import { prisma } from '../index';
import { getBonusMultiplierForTags } from '../controllers/bonusController';

/**
 * ============================================================
 *  MOTOR ECONÓMICO DINÁMICO — Trust Lite
 * ============================================================
 *
 * Presupuesto dinámico por árbol basado en usuarios activos
 * (nivel >= 3). Distribuye xpPool entre ramas proporcionalmente
 * a su valorOficial. Ramas con 0 puntos se marcan como "Deseo".
 *
 * Fórmula del presupuesto:
 *   budget = 100 + (usuarios_activos_nivel3+ * 50)
 *
 * Distribución proporcional:
 *   xpPool_rama = floor((valorOficial_rama / suma_total) * budget)
 *   Si xpPool < 1 → isDesire = true, xpPool = 0
 */

// ─── BUDGET & REDISTRIBUTION ────────────────────────────────

/**
 * Recalcula y persiste el xpPool de todas las ramas de un árbol.
 * Debe llamarse en cada evento que altere el presupuesto dinámico.
 */
export async function redistributeTreeBudget(treeId: string): Promise<void> {
  try {
    // 1. Presupuesto fijo de 1000 puntos
    const budget = 1000;

    // Actualizar el presupuesto total en el Árbol
    await prisma.tree.update({
      where: { id: treeId },
      data: { presupuestoTotal: budget }
    });

    // 2. Obtener todas las ramas del árbol con su creador
    //    Incluimos ramas hashtag (treeId directo) y ramas de ideas via NeedTree
    const branches = await (prisma as any).branch.findMany({
      where: {
        OR: [
          { treeId },
          {
            idea: {
              need: {
                treeLinks: { some: { treeId } },
              },
            },
          },
        ],
      },
      select: { id: true, valorOficial: true, createdById: true },
    });

    if (branches.length === 0) return;

    // 3. Obtener niveles de los creadores
    const creatorIds = [...new Set(branches.map((b: any) => b.createdById).filter(Boolean))] as string[];
    const members = creatorIds.length > 0
      ? await prisma.treeMember.findMany({
          where: { treeId, userId: { in: creatorIds } },
          select: { userId: true, level: true },
        })
      : [];
    const levelMap = new Map<string, number>();
    for (const m of members) {
      levelMap.set(m.userId, m.level);
    }

    // 4. Calcular peso ponderado: valorOficial × (nivelCreador / 10)
    const weightedBranches = branches.map((b: any) => {
      const valor = Number(b.valorOficial || 0);
      const level = b.createdById ? (levelMap.get(b.createdById) || 1) : 1;
      const weight = valor * (level / 10);
      return { ...b, valor, level, weight };
    });

    // 5. Suma total de pesos
    const totalWeight: number = weightedBranches.reduce(
      (sum: number, b: any) => sum + b.weight,
      0
    );

    // 6. Distribuir proporcionalmente al peso y actualizar cada rama
    for (const branch of weightedBranches) {
      let xpPool = 0;
      let isDesire = false;

      if (totalWeight > 0 && branch.weight > 0) {
        xpPool = Math.floor((branch.weight / totalWeight) * budget);
      }

      if (xpPool < 1) {
        xpPool = 0;
        isDesire = true;
      }

      await (prisma as any).branch.update({
        where: { id: branch.id },
        data: { xpPool, isDesire },
      });
    }

    console.log(
      `[EconomicEngine] Árbol ${treeId}: budget=1000 fijo, ${branches.length} ramas redistribuidas por nivel relativo.`
    );
  } catch (err) {
    console.error('[EconomicEngine] Error en redistributeTreeBudget:', err);
  }
}

/**
 * Calcula la recompensa XP basada en el presupuesto de la rama y la dificultad en base 1-10.
 * Fórmula: xpPool * (0.20 + (dificultad 1-10 - 1) * 0.11)
 */
export function calculateXpFromDifficulty(xpPool: number, difficulty10: number): number {
  const reward = xpPool * (0.20 + (difficulty10 - 1) * 0.11);
  return Math.max(0, reward);
}

/**
 * Calcula la recompensa XP de completar una tarea.
 *
 * - dificultad: promedio de DifficultyVote.value (escala 1–10).
 * - Si la rama es "Deseo" (xpPool = 0) → devuelve 0.
 * - Aplica el multiplicador de Bonos Éticos según los tags de la tarea.
 *
 * XP_Final = XP_Base * Multiplicador_Bonus
 *   donde Multiplicador_Bonus = 1 + Σ(porcentaje de bonos que aplican)
 */
export async function calculateTaskXpReward(taskId: string): Promise<number> {
  try {
    const task = await prisma.task.findUnique({
      where: { id: taskId },
      include: {
        branch: {
          select: { id: true, xpPool: true, isDesire: true, treeId: true },
        },
        difficultyVotes: { select: { value: true } },
        tags: { select: { skillName: true } },
      },
    });

    if (!task || !task.branch) return 0;
    if (task.branch.isDesire || task.branch.xpPool <= 0) return 0;

    const votes = task.difficultyVotes;
    let avg10 = 1;

    if (votes.length > 0) {
      const sum = votes.reduce((s, v) => s + v.value, 0);
      avg10 = sum / votes.length;
    }

    const xpBase = calculateXpFromDifficulty(task.branch.xpPool, avg10);

    // ── Bonus multiplier from Bolsa de Valores Éticos ──
    let bonusMultiplier = 1;
    const treeId = task.branch.treeId;
    if (treeId && task.tags && task.tags.length > 0) {
      const tagNames = task.tags.map((t: any) => t.skillName);
      bonusMultiplier = await getBonusMultiplierForTags(treeId, tagNames);
    }

    const xpFinal = xpBase * bonusMultiplier;

    return Math.max(0, xpFinal);
  } catch (err) {
    console.error('[EconomicEngine] Error en calculateTaskXpReward:', err);
    return 0;
  }
}

// ─── HELPER: obtener treeId de una rama ─────────────────────

/**
 * Resuelve el treeId de una rama (que puede ser hashtag con treeId
 * directo, o venir de una idea → need → treeLinks).
 */
export async function resolveBranchTreeId(branchId: string): Promise<string | null> {
  const branch = await (prisma as any).branch.findUnique({
    where: { id: branchId },
    select: {
      treeId: true,
      idea: { select: { need: { select: { treeLinks: { select: { treeId: true } } } } } },
    },
  });

  if (!branch) return null;
  return branch.treeId || branch.idea?.need?.treeLinks?.[0]?.treeId || null;
}
