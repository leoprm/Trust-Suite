import cron from 'node-cron';
import { prisma } from '../index';
import { redistributeTreeBudget } from '../utils/economicEngine';
import Holidays from 'date-holidays';

/**
 * ============================================================
 *  OXIDACIÓN DE XP — Cron Job Semanal
 * ============================================================
 *
 * Ejecutado cada domingo a medianoche (UTC).
 * Aplica decaimiento de XP a todos los miembros de todos los
 * árboles, actualiza niveles y SÓLO redistribuye el presupuesto
 * de los árboles donde el conteo de usuarios nivel >= 3 cambió.
 *
 * Fórmulas:
 *   tasa = 0.05 + (level * 0.003)            → 5% base + 0.3% por nivel
 *   pérdida = Math.floor(xp * tasa)           → siempre número entero
 *   nuevo_xp = Math.max(0, xp - pérdida)      → nunca negativo
 *   umbral_nivel_N = (N - 1) * 50             → nivel baja si xp < umbral
 *
 * Optimización de redistribución:
 *   Sólo llama a redistributeTreeBudget(treeId) si el número de
 *   miembros con level >= 3 en ese árbol cambió efectivamente.
 */

const BATCH_SIZE = 100; // Procesar en lotes para no saturar el servidor

/** Calcula el nivel correcto dado un XP entero (umbral: 50 XP por nivel) */
function calculateLevel(xp: number): number {
  // Nivel mínimo: 1. Nivel N requiere (N-1)*50 XP.
  // Nivel 1 → 0 XP, Nivel 2 → 50, Nivel 3 → 100, Nivel 4 → 150 ...
  return Math.max(1, Math.floor(xp / 50) + 1);
}

export const startXpDecayCron = () => {
  // Cada domingo a las 00:30 UTC (30 min después del weekly resolution)
  cron.schedule('30 0 * * 0', async () => {
    console.log('[XpDecay] ── Iniciando Oxidación de XP ──');
    const startTime = Date.now();

    try {
      // ── PASO 1: Snapshot previo de usuarios nivel >= 3 por árbol ──────────
      // Para detectar cambios reales en el presupuesto dinámico al final.
      const activeCountBefore = await prisma.treeMember.groupBy({
        by: ['treeId'],
        where: { level: { gte: 3 } },
        _count: { _all: true },
      });

      const activeCountMapBefore = new Map<string, number>(
        activeCountBefore.map((r: any) => [r.treeId, r._count._all])
      );

      // ── PASO 2: Obtener todos los árboles para conocer sus IDs y config ────────────
      const allTrees = await (prisma as any).tree.findMany({ select: { id: true, country: true, settings: true } });
      const treeConfigs = new Map<string, { country: string, isWorkdayDecay: boolean }>();
      
      const hd = new Holidays(); // Base instance
      const today = new Date();
      const isWeekend = today.getUTCDay() === 0 || today.getUTCDay() === 6; // Sunday or Saturday (cron runs Sunday 00:30 UTC for Saturday effectively, we check if today is Sunday, so it's a weekend)

      for (const tree of allTrees) {
        if (!activeCountMapBefore.has(tree.id)) activeCountMapBefore.set(tree.id, 0);

        let isWorkdayDecay = false;
        if (tree.settings) {
          try {
             const parsed = typeof tree.settings === 'string' ? JSON.parse(tree.settings) : tree.settings;
             if (parsed.governance?.decayMode === 'WORKDAY') isWorkdayDecay = true;
          } catch(e) {}
        }
        treeConfigs.set(tree.id, { country: tree.country || 'CL', isWorkdayDecay });
      }

      // ── PASO 3: Procesar decaimiento en batches ───────────────────────────
      let totalProcessed = 0;
      let totalDecayed = 0;
      let offset = 0;

      while (true) {
        const batch = await prisma.treeMember.findMany({
          skip: offset,
          take: BATCH_SIZE,
          select: { id: true, userId: true, treeId: true, xp: true, level: true },
          orderBy: { id: 'asc' }, // orden estable para paginación
        });

        if (batch.length === 0) break;

        // Preparar actualizaciones para este lote
        const updates: Array<{ id: string; newXp: number; newLevel: number }> = [];

        for (const member of batch) {
          // XP como entero (truncar cualquier decimal residual del Float)
          const currentXp = Math.floor(Number(member.xp));
          if (currentXp <= 0) {
            // Aún así verificar si el nivel es correcto
            const correctLevel = calculateLevel(0);
            if (member.level !== correctLevel) {
              updates.push({ id: member.id, newXp: 0, newLevel: correctLevel });
            }
            continue;
          }

          // ── PROTECCIÓN DE FERIADOS Y FINES DE SEMANA ──
          const config = treeConfigs.get(member.treeId);
          if (config && config.isWorkdayDecay) {
              // Chequeo 1: Es fin de semana?
              if (isWeekend) continue; // Salto la oxidación para este miembro (protegido)

              // Chequeo 2: Es Feriado en el país del árbol?
              try {
                  hd.init(config.country); // Inicializamos el motor del país de origen
                  const isHoliday = hd.isHoliday(today);
                  if (isHoliday && isHoliday.length > 0) {
                      continue; // Salto la oxidación porque cayó feriado 🛡️
                  }
              } catch (err) {
                 // País inválido o fallido, ignorar y proceder con oxidación regular
              }
          }

          // Calcular tasa y pérdida (siempre entero)
          const decayRate = 0.05 + member.level * 0.003;
          const decayAmount = Math.floor(currentXp * decayRate);

          const newXp = Math.max(0, currentXp - decayAmount);
          const newLevel = calculateLevel(newXp);

          // Solo actualizar si algo cambió
          if (newXp !== currentXp || newLevel !== member.level) {
            updates.push({ id: member.id, newXp, newLevel });
            totalDecayed++;
          }
        }

        // Persistir actualizaciones del lote con transacción
        if (updates.length > 0) {
          await prisma.$transaction(
            updates.map(({ id, newXp, newLevel }) =>
              prisma.treeMember.update({
                where: { id },
                data: { xp: newXp, level: newLevel },
              })
            )
          );
        }

        totalProcessed += batch.length;
        offset += BATCH_SIZE;

        console.log(
          `[XpDecay] Lote procesado: ${totalProcessed} miembros (${totalDecayed} con decaimiento)`
        );
      }

      // ── PASO 4: Snapshot posterior de usuarios nivel >= 3 por árbol ───────
      const activeCountAfter = await prisma.treeMember.groupBy({
        by: ['treeId'],
        where: { level: { gte: 3 } },
        _count: { _all: true },
      });

      const activeCountMapAfter = new Map<string, number>(
        activeCountAfter.map((r: any) => [r.treeId, r._count._all])
      );
      // Árboles que ahora tienen 0 usuarios nivel 3 no aparecen en el groupBy
      for (const tree of allTrees) {
        if (!activeCountMapAfter.has(tree.id)) activeCountMapAfter.set(tree.id, 0);
      }

      // ── PASO 5: Redistribuir SOLO árboles con cambio real en nivel 3 ──────
      const treesNeedingRedistribution: string[] = [];

      const affectedTrees = new Set<string>();
      for (const tree of allTrees) {
        if (!affectedTrees.has(tree.id)) affectedTrees.add(tree.id);
      }

      console.log(`[XpDecay] Recalculando presupuestos para ${affectedTrees.size} árboles afectados...`);
      let redistributedCount = 0;
      for (const treeId of affectedTrees) {
        if (activeCountMapBefore.get(treeId) !== activeCountMapAfter.get(treeId)) {
           await redistributeTreeBudget(treeId);
           redistributedCount++;
        }
      }

      const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
      console.log(
        `[XpDecay] ── Oxidación completada en ${elapsed}s ──`,
        `| Total: ${totalProcessed} miembros | Decaídos: ${totalDecayed} | Árboles redistribuidos: ${treesNeedingRedistribution.length}`
      );
    } catch (err) {
      console.error('[XpDecay] Error en el cron de Oxidación de XP:', err);
    }
  });

  console.log('[XpDecay] Cron de Oxidación de XP registrado (cada domingo 00:30 UTC).');
};
