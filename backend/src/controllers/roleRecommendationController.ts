import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/**
 * POST /api/roles/recommend
 * Body: { groupType, memberCount, description? }
 * Returns recommended roles based on similar groups.
 */
export const recommendRoles = async (req: any, res: Response) => {
  try {
    const { groupType, memberCount, description } = req.body;

    if (!groupType || !memberCount || memberCount < 1) {
      return res.status(400).json({
        error: 'groupType (string) y memberCount (int >= 1) son requeridos',
      });
    }

    const normalizedType = groupType.toLowerCase().trim();
    let roles = await prisma.groupRole.findMany({
      where: { groupType: normalizedType },
      orderBy: { occurrences: 'desc' },
    });

    // Fuzzy fallback: if no exact match, find the closest groupType by word overlap
    let matchedType = normalizedType;
    if (roles.length === 0) {
      const keywords = normalizedType.split(/\s+/).filter(w => w.length > 1);

      const allTypes = await prisma.groupRole.findMany({
        select: { groupType: true },
        distinct: ['groupType'],
      });

      let bestType = '';
      let bestScore = 0;

      for (const t of allTypes) {
        const words = t.groupType.toLowerCase().split(/\s+/);
        if (words.length === 0) continue;
        const common = keywords.filter(k =>
          words.some(w => w.includes(k) || k.includes(w))
        );
        const score = common.length / Math.max(keywords.length, words.length);
        if (score > bestScore) {
          bestScore = score;
          bestType = t.groupType;
        }
      }

      if (bestType && bestScore >= 0.3) {
        roles = await prisma.groupRole.findMany({
          where: { groupType: bestType },
          orderBy: { occurrences: 'desc' },
        });
        matchedType = bestType;
      }
    }

    // Build recommendations
    const recommendedRoles = roles.map(r => {
      const parsedSkills: string[] = (() => {
        try {
          return r.requiredSkills ? JSON.parse(r.requiredSkills) : [];
        } catch {
          return [];
        }
      })();

      // Estimate count: use ratio * memberCount if available, else typicalCount
      const estimatedCount = r.ratioToMembers
        ? Math.max(1, Math.round(r.ratioToMembers * memberCount))
        : r.typicalCount;

      return {
        name: r.roleName,
        count: estimatedCount,
        skills: parsedSkills,
        avgLoad: r.avgLoad,
        rationale:
          r.source === 'organic'
            ? `${r.occurrences} grupos reales confirmaron este rol`
            : `Basado en patrones de ${r.occurrences} grupos similares`,
      };
    });

    // Cap total staff to at most 2x memberCount to avoid unreasonable totals
    const total = recommendedRoles.reduce((sum, r) => sum + r.count, 0);
    const maxTotal = memberCount * 2;
    if (total > maxTotal && recommendedRoles.length > 0) {
      const scale = maxTotal / total;
      for (const r of recommendedRoles) {
        r.count = Math.max(1, Math.round(r.count * scale));
      }
    }

    res.json({
      groupType: matchedType,
      recommendedRoles,
      totalRecommended: recommendedRoles.reduce((s, r) => s + r.count, 0),
      memberCount,
    });
  } catch (error: any) {
    console.error('[recommendRoles] ERROR:', error?.message || error);
    res.status(500).json({
      error: 'Error generando recomendaciones',
      detail: error?.message || String(error),
    });
  }
};

/**
 * POST /api/roles/feedback
 * Body: { treeId, roles: [{ name, adopted, adjustedCount? }] }
 * Records which roles a group adopted or adjusted, updating GroupRole stats.
 */
export const feedbackRoles = async (req: any, res: Response) => {
  try {
    const { treeId, roles } = req.body;

    if (!treeId || !Array.isArray(roles) || roles.length === 0) {
      return res.status(400).json({
        error: 'treeId (string) y roles (array de {name, adopted}) son requeridos',
      });
    }

    const tree = await prisma.tree.findUnique({ where: { id: treeId } });
    if (!tree) {
      return res.status(404).json({ error: 'Árbol no encontrado' });
    }

    // groupType from tree.objectives (first comma-separated chunk)
    const groupType = tree.objectives?.split(',')[0]?.trim().toLowerCase() || 'general';

    const updates: Array<{ name: string; action: string; beforeCount?: number; afterCount?: number }> = [];

    for (const r of roles) {
      if (!r.name) continue;

      const existing = await prisma.groupRole.findUnique({
        where: { groupType_roleName: { groupType, roleName: r.name } },
      });

      if (existing) {
        const newOccurrences = r.adopted ? existing.occurrences + 1 : existing.occurrences;
        const newTypicalCount =
          r.adjustedCount && r.adjustedCount > 0
            ? Math.round(
                (existing.typicalCount * existing.occurrences + r.adjustedCount) /
                  (existing.occurrences + 1)
              )
            : existing.typicalCount;

        await prisma.groupRole.update({
          where: { id: existing.id },
          data: {
            occurrences: newOccurrences,
            typicalCount: newTypicalCount,
            source: r.adopted && existing.source === 'seed' ? 'organic' : existing.source,
            lastConfirmedAt: r.adopted ? new Date() : existing.lastConfirmedAt,
          },
        });

        updates.push({
          name: r.name,
          action: r.adopted ? 'confirmed' : 'skipped',
          beforeCount: existing.typicalCount,
          afterCount: newTypicalCount,
        });
      } else if (r.adopted) {
        // New role discovered — add to GroupRole for this groupType
        await prisma.groupRole.create({
          data: {
            groupType,
            roleName: r.name,
            typicalCount: r.adjustedCount || 1,
            source: 'organic',
            occurrences: 1,
            lastConfirmedAt: new Date(),
          },
        });

        updates.push({
          name: r.name,
          action: 'discovered',
          afterCount: r.adjustedCount || 1,
        });
      }
    }

    res.json({ ok: true, groupType, updates });
  } catch (error: any) {
    console.error('[feedbackRoles] ERROR:', error?.message || error);
    res.status(500).json({
      error: 'Error registrando feedback',
      detail: error?.message || String(error),
    });
  }
};
