import cron from 'node-cron';
import { prisma } from '../index';
import { calculateTaskXpReward, redistributeTreeBudget } from '../utils/economicEngine';
import { recalculateBonusPercentages } from '../controllers/bonusController';
import { addBerryReward, applyMonthlyBerryFlowForTree, getCurrentCycleKey, getOrCreateBerryConfig, getFederationMemberCount } from '../services/berryFlowService';

export const startMonthlyJob = () => {
  // Monthly Job: On the 1st of every month at midnight UTC
  cron.schedule('0 0 1 * *', async () => {
    console.log('Running Monthly Economy Loop...');
    try {
      const now = new Date();
      const cycleKey = getCurrentCycleKey(now);
      const dayOfWeek = now.getUTCDay();
      const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;

      // 0. Aplicar reducción mensual de Berries (10% del saldo inicial) — PRIMERO, al inicio del ciclo
      //    El 10% se destruye. No se redistribuye a nadie.
      const allTreeIds = await prisma.tree.findMany({ select: { id: true } });
      for (const { id: treeId } of allTreeIds) {
        try {
          await applyMonthlyBerryFlowForTree(treeId, cycleKey);
        } catch (berryErr) {
          console.error(`[BerryFlow] Error applying monthly flow for tree ${treeId}:`, berryErr);
        }
      }
      console.log(`[BerryFlow] Reducción mensual de Berries aplicada para ${allTreeIds.length} Trees (ciclo ${cycleKey}).`);

      // 0.5. Population threshold gate — la federación debe alcanzar minMembersForBerries
      //      Staged Ignition Protocol: la economía de Berries no se activa hasta
      //      que la federación de árboles alcanza densidad poblacional suficiente.
      const treesBelowThreshold = new Set<string>();
      for (const { id: treeId } of allTreeIds) {
        const berryCfg = await getOrCreateBerryConfig(treeId);
        const { totalMembers, federatedTreeIds, localMembers } = await getFederationMemberCount(treeId);
        if (totalMembers < berryCfg.minMembersForBerries) {
          treesBelowThreshold.add(treeId);
          console.log(`[BerryFlow] Federación del Tree ${treeId}: ${totalMembers} miembros totales (${localMembers} locales, ${federatedTreeIds.length} árboles) < ${berryCfg.minMembersForBerries} mínimo. Se omite el caudal mensual de Berries.`);
        }
      }

      // 1. Distribuir XP usando la nueva fórmula del motor económico
      const branches = await prisma.branch.findMany({
        include: {
          tasks: { include: { votes: true, difficultyVotes: true } },
          members: true,
          idea: { include: { need: { include: { treeLinks: true } } } }
        }
      });

      let totalXpGainThisMonth = 0;
      let usersGainedXp = new Set<string>();

      for (const branch of branches) {
        if (branch.tasks.length === 0) continue;

        const completedTasks = branch.tasks.filter((t: any) => t.status === 'COMPLETED');
        if (completedTasks.length === 0) continue;

        // Si la rama es un "Deseo" (xpPool = 0), no hay recompensa
        if (branch.isDesire || branch.xpPool <= 0) continue;

        let totalEffort = 0;
        const userEffortMap: Record<string, number> = {};

        for (const task of completedTasks) {
          // Calcular XP real de la tarea usando el motor económico
          const taskXp = await calculateTaskXpReward(task.id);
          if (taskXp <= 0) continue;

          if (task.assignedTo) {
            totalEffort += taskXp;
            userEffortMap[task.assignedTo] = (userEffortMap[task.assignedTo] || 0) + taskXp;
          }
        }

        if (totalEffort > 0) {
          // Aplicar multiplicador Golden Ratio por tamaño de grupo
          const usersInBranchCount = branch.members.length || 1;
          let groupMultiplier = 0;
          for (let i = 1; i <= usersInBranchCount; i++) {
            groupMultiplier += Math.pow(0.618, i - 1);
          }

          for (const [userId, effort] of Object.entries(userEffortMap)) {
            const share = effort / totalEffort;
            const xpEarned = branch.xpPool * groupMultiplier * share;
            const treeId = (branch as any).treeId ||
                           (branch as any).idea?.need?.treeLinks?.[0]?.treeId;

            if (treeId) {
              await prisma.treeMember.updateMany({
                where: { userId, treeId },
                data: { xp: { increment: xpEarned } }
              });
            }

            totalXpGainThisMonth += xpEarned;
            usersGainedXp.add(userId);
          }

          // Vaciar xpPool de la rama (consumido en el ciclo mensual)
          await prisma.branch.update({
            where: { id: branch.id },
            data: { xpPool: 0 }
          });
        }
      }

      // 2. Decaimiento de XP y actualización de niveles (por TreeMember)
      const activeUsersCount = Math.max(1, usersGainedXp.size);
      const avgXpGain = totalXpGainThisMonth / activeUsersCount;
      const baseDecay = 0.08333 * avgXpGain;
      const bayaSalaryPerTree = 100;

      // Parsear decayMode de cada árbol una sola vez
      const allTrees = await prisma.tree.findMany({ select: { id: true, settings: true } });
      const treeDecayMode = new Map<string, 'CONTINUOUS' | 'WORKDAY'>();
      for (const tree of allTrees) {
        let mode: 'CONTINUOUS' | 'WORKDAY' = 'CONTINUOUS';
        if (tree.settings) {
          try {
            const parsed = JSON.parse(tree.settings);
            if (parsed?.governance?.decayMode === 'WORKDAY') mode = 'WORKDAY';
          } catch {}
        }
        treeDecayMode.set(tree.id, mode);
      }

      // Procesar cada TreeMember — detectar cruce de umbral de nivel 3
      const treesNeedingRedistribution = new Set<string>();
      const allMembers = await prisma.treeMember.findMany();

      for (const member of allMembers) {
        // ── Population threshold gate per-member ──
        if (treesBelowThreshold.has(member.treeId)) {
          continue; // Skip berry salary for trees below minMembersForBerries
        }

        const mode = treeDecayMode.get(member.treeId) ?? 'CONTINUOUS';

        if (mode === 'WORKDAY' && isWeekend) {
          // Weekend mode: give Berry salary, skip XP decay
          await addBerryReward({
            userId: member.userId,
            treeId: member.treeId,
            amount: 100,
            type: 'LEVEL_REWARD',
            description: 'Caudal mensual de Berries (modo fin de semana)',
          }).catch(() => {});
          continue;
        }

        const previousLevel = member.level;
        const threshold = avgXpGain * member.level * 1.5;
        let newLevel = member.level;
        if (member.xp >= threshold && avgXpGain > 0) {
          newLevel++;
        }

        const fullDecayAmount = baseDecay * Math.pow(1.3, newLevel - 1);
        const newXp = Math.max(0, member.xp - fullDecayAmount);

        // CRÍTICO: Detectar cruce del umbral de nivel 3 (sube a 3 o baja de 3)
        const crossedLevel3Threshold =
          (previousLevel < 3 && newLevel >= 3) ||
          (previousLevel >= 3 && newLevel < 3);

        if (crossedLevel3Threshold) {
          treesNeedingRedistribution.add(member.treeId);
        }

        await prisma.treeMember.update({
          where: { id: member.id },
          data: { xp: newXp, level: newLevel }
        });

        // Berry salary: give monthly reward via berryFlowService (creates audit trail)
        await addBerryReward({
          userId: member.userId,
          treeId: member.treeId,
          amount: 100,
          type: 'LEVEL_REWARD',
          description: `Caudal mensual de Berries (nivel ${newLevel})`,
        }).catch(() => {});
      }

      // 3. TRIGGER CRÍTICO: Redistribuir árboles donde alguien cruzó el nivel 3
      for (const treeId of treesNeedingRedistribution) {
        console.log(`[EconomicEngine] Cruce de nivel 3 detectado en árbol ${treeId}. Redistribuyendo...`);
        await redistributeTreeBudget(treeId);
      }

      // 4. Recalcular porcentajes de Bonos Éticos de todos los árboles
      //    A principio de mes, los votos acumulados determinan la "tarta" del 100%.
      const allTreesForBonus = await prisma.tree.findMany({ select: { id: true } });
      for (const tree of allTreesForBonus) {
        await recalculateBonusPercentages(tree.id);
      }
      console.log(`[BonusPool] Porcentajes de bonos recalculados para ${allTreesForBonus.length} árboles.`);

      console.log('Monthly Economy Loop Finished.');
    } catch (err) {
      console.error('Error running monthly loop:', err);
    }
  });
};
