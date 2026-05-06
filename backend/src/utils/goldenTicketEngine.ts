import { prisma } from '../index';
import { createNotification } from '../controllers/notificationController';

/**
 * Golden Ticket data structure stored as JSON in TreeMember.goldenTickets.
 *
 * Shape: {
 *   "#Diseño": {
 *     tickets: 3,           // remaining tickets
 *     usedOnCritical: [],    // taskIds where tickets were spent (max 3 before eval)
 *     streakTaskIds: [],     // taskIds from the qualifying streak (diff 6-8, >=80%)
 *   },
 *   ...
 * }
 */

interface SkillTicketData {
  tickets: number;
  usedOnCritical: string[];
  streakTaskIds: string[];
}
type GoldenTicketMap = Record<string, SkillTicketData>;

// ── Helpers ────────────────────────────────────────────────────────────────────

function parseTickets(raw: string | null | undefined): GoldenTicketMap {
  try { return JSON.parse(raw || '{}'); } catch { return {}; }
}

function getSkillData(map: GoldenTicketMap, skill: string): SkillTicketData {
  return map[skill] || { tickets: 0, usedOnCritical: [], streakTaskIds: [] };
}

// ── 1. Evaluate quality streak after audit consensus ───────────────────────────
// Called after finalizeAuditConsensus for the task's assignee.
// Checks if the user has built a streak of 7 audited tasks (diff 6-8, nota >= 8/10)
// for each tag/skill on the task.
export async function evaluateGoldenStreak(
  userId: string,
  treeId: string,
  taskId: string,
  finalDifficulty: number,
  avgAuditNote: number,
  taskTagSkills: string[]
): Promise<void> {
  if (taskTagSkills.length === 0) return;

  const membership = await (prisma as any).treeMember.findUnique({
    where: { userId_treeId: { userId, treeId } },
  });
  if (!membership) return;

  const ticketMap = parseTickets(membership.goldenTickets);

  for (const skill of taskTagSkills) {
    const data = getSkillData(ticketMap, skill);

    // ─── CASE A: User used a ticket on this critical task (diff 9-10) ───
    if (finalDifficulty >= 9 && data.usedOnCritical.includes(taskId)) {
      if (avgAuditNote < 8) {
        // FALL: satisfaction < 80% on a golden-ticket task → lose everything
        ticketMap[skill] = { tickets: 0, usedOnCritical: [], streakTaskIds: [] };
        await saveTickets(membership.id, ticketMap);
        await createNotification({
          userId, type: 'ALERTA', category: 'ARBOL',
          title: 'Golden Ticket — Racha Rota',
          body: `Tu nota de auditoría (${avgAuditNote}/10) fue inferior al 80% requerido en ${skill}. Tus Golden Tickets han sido revocados. Completa 7 nuevas tareas (dif. 6-8) con ≥80% para volver a ganarlos.`,
          entityType: 'TREE', entityAction: 'UPDATE', entityId: treeId,
        });
      } else {
        // Good performance on this critical task — check if all 3 tickets used
        if (data.usedOnCritical.length >= 3 && data.tickets === 0) {
          // RENEWAL: all 3 tickets used and all with good performance
          // Verify all 3 critical tasks have audit nota >= 8
          const allGood = await verifyAllCriticalTasksPass(data.usedOnCritical, 8);
          if (allGood) {
            ticketMap[skill] = { tickets: 3, usedOnCritical: [], streakTaskIds: [] };
            await saveTickets(membership.id, ticketMap);
            await createNotification({
              userId, type: 'LOGRO', category: 'ARBOL',
              title: 'Golden Tickets Renovados ✨',
              body: `Calidad Élite mantenida (>80%). Tus 3 Golden Tickets para ${skill} han sido renovados.`,
              entityType: 'TREE', entityAction: 'UPDATE', entityId: treeId,
            });
          }
        }
      }
      continue; // processed this skill for this case
    }

    // ─── CASE B: Regular audited task (diff 6-8) → track streak ────────
    if (finalDifficulty >= 6 && finalDifficulty <= 8) {
      if (avgAuditNote >= 8) {
        // Add to streak if not already there
        if (!data.streakTaskIds.includes(taskId)) {
          data.streakTaskIds.push(taskId);
        }
        // Check if streak reached 7
        if (data.streakTaskIds.length >= 7 && data.tickets === 0) {
          // AWARD: qualify for 3 golden tickets!
          ticketMap[skill] = { tickets: 3, usedOnCritical: [], streakTaskIds: [] };
          await saveTickets(membership.id, ticketMap);
          await createNotification({
            userId, type: 'LOGRO', category: 'ARBOL',
            title: '¡Racha de Excelencia! 🎫',
            body: `¡Has ganado 3 Golden Tickets para tareas de Misión Crítica en ${skill}!`,
            entityType: 'TREE', entityAction: 'UPDATE', entityId: treeId,
          });
          continue;
        }
      } else {
        // Failed quality threshold → reset streak for this skill
        data.streakTaskIds = [];
      }
      ticketMap[skill] = data;
    }
  }

  await saveTickets(membership.id, ticketMap);
}

// ── 2. Use a ticket when assuming a critical task ──────────────────────────────
// Returns true if user had a ticket and it was consumed.
export async function useGoldenTicket(
  userId: string,
  treeId: string,
  taskId: string,
  taskTagSkills: string[]
): Promise<{ used: boolean; skill?: string; remaining?: number }> {
  const membership = await (prisma as any).treeMember.findUnique({
    where: { userId_treeId: { userId, treeId } },
  });
  if (!membership) return { used: false };

  const ticketMap = parseTickets(membership.goldenTickets);

  // Find the first skill that has tickets
  for (const skill of taskTagSkills) {
    const data = getSkillData(ticketMap, skill);
    if (data.tickets > 0) {
      data.tickets -= 1;
      data.usedOnCritical.push(taskId);
      ticketMap[skill] = data;
      await saveTickets(membership.id, ticketMap);
      return { used: true, skill, remaining: data.tickets };
    }
  }

  return { used: false };
}

// ── 3. Query ticket status for a user+skill ────────────────────────────────────
export async function getTicketStatus(
  userId: string,
  treeId: string,
  skill: string
): Promise<{ tickets: number; streakProgress: number }> {
  const membership = await (prisma as any).treeMember.findUnique({
    where: { userId_treeId: { userId, treeId } },
    select: { goldenTickets: true },
  });
  if (!membership) return { tickets: 0, streakProgress: 0 };

  const ticketMap = parseTickets(membership.goldenTickets);
  const data = getSkillData(ticketMap, skill);
  return { tickets: data.tickets, streakProgress: data.streakTaskIds.length };
}

// ── 4. Get all ticket data for a membership ────────────────────────────────────
export function parseTicketMap(raw: string | null | undefined): GoldenTicketMap {
  return parseTickets(raw);
}

// ── Internal ───────────────────────────────────────────────────────────────────

async function saveTickets(membershipId: string, ticketMap: GoldenTicketMap) {
  await (prisma as any).treeMember.update({
    where: { id: membershipId },
    data: { goldenTickets: JSON.stringify(ticketMap) },
  });
}

async function verifyAllCriticalTasksPass(taskIds: string[], minNote: number): Promise<boolean> {
  for (const tid of taskIds) {
    const audits = await (prisma as any).auditoria.findMany({ where: { taskId: tid } });
    if (audits.length === 0) return false;
    const avg = audits.reduce((s: number, a: any) => s + a.notaSugerida, 0) / audits.length;
    if (avg < minNote) return false;
  }
  return true;
}
