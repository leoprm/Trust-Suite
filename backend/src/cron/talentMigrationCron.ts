/**
 * cron/talentMigrationCron.ts
 *
 * T22: Auto-regulación de talento entre subárboles.
 *
 * Diario: analiza diferencias de rates entre subárboles hermanos
 * y genera sugerencias de migración cuando un hermano paga 20%+ más
 * por la misma skill.
 *
 * Lógica:
 *   1. Encontrar árboles con childTrees (parentTreeId = null)
 *   2. Para cada par de hermanos, comparar skillPricing
 *   3. Si hermano B paga 20%+ más que hermano A, sugerir migración
 *      a los miembros de A que tengan esa skill (nivel > 10)
 *   4. Guardar sugerencias en TalentMigrationSuggestion
 */

import { PrismaClient } from "@prisma/client";
import type { Bot } from "grammy";
import type { BotContext } from "../bot/types";

export interface TalentMigrationResult {
  suggestions: number;
  treesAnalyzed: number;
}

/**
 * Ejecuta el análisis de migración de talento.
 */
export async function runTalentMigration(
  prisma: PrismaClient,
  _bot: Bot<BotContext> | null
): Promise<TalentMigrationResult> {
  let totalSuggestions = 0;
  let treesAnalyzed = 0;

  // 1. Encontrar árboles con parentTreeId = null (padres con subárboles)
  const parentTrees = await (prisma as any).tree.findMany({
    where: { parentTreeId: null },
    include: {
      childTrees: {
        include: {
          skillPricing: true,
          members: {
            include: { user: { select: { username: true, skills: true } } },
          },
        },
      },
    },
  });

  for (const parent of parentTrees) {
    const children = parent.childTrees;
    if (!children || children.length < 2) continue;
    treesAnalyzed++;

    // 2. Comparar rates entre hermanos
    for (const child of children) {
      for (const pricing of child.skillPricing || []) {
        // Buscar hermanos que paguen 20%+ más por la misma skill
        const betterPaying = children.filter(
          (c: any) =>
            c.id !== child.id &&
            (c.skillPricing || []).some(
              (sp: any) =>
                sp.skillTag === pricing.skillTag &&
                sp.ratePerHour > pricing.ratePerHour * 1.2
            )
        );

        if (betterPaying.length === 0) continue;

        // 3. Encontrar miembros con esa skill que podrían migrar
        const candidates = (child.members || []).filter((m: any) => {
          let skills: Record<string, number> = {};
          try {
            skills = m.user?.skills
              ? JSON.parse(m.user.skills as string)
              : {};
          } catch {
            /* ignore parse errors */
          }
          return skills[pricing.skillTag] && skills[pricing.skillTag] > 10;
        });

        // 4. Guardar sugerencias de migración (top 3 candidatos)
        for (const candidate of candidates.slice(0, 3)) {
          const betterTree = betterPaying[0];
          const betterRate = (betterTree.skillPricing || []).find(
            (sp: any) => sp.skillTag === pricing.skillTag
          );

          console.log(
            `[talentMigration] ${candidate.user?.username || candidate.id}: ` +
              `${pricing.skillTag} $${pricing.ratePerHour}/hr ` +
              `(${child.name}) → ` +
              `$${betterRate?.ratePerHour}/hr (${betterTree.name})`
          );

          await (prisma as any).talentMigrationSuggestion.create({
            data: {
              memberId: candidate.id,
              fromTreeId: child.id,
              toTreeId: betterTree.id,
              skillTag: pricing.skillTag,
              currentRate: pricing.ratePerHour,
              betterRate: betterRate?.ratePerHour || 0,
            },
          });

          totalSuggestions++;
        }
      }
    }
  }

  return { suggestions: totalSuggestions, treesAnalyzed };
}
