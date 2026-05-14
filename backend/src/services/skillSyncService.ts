import { prisma } from '../index';

/**
 * Sincroniza XP hacia una skill específica del User (cross-tree).
 * Acumula xpGained en User.skills[skillTag].
 * No modifica totalXp — el caller (verifyTask) ya lo incrementa.
 */
async function syncSkillsToUser(
  userId: string,
  skillTag: string,
  xpGained: number,
): Promise<void> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { skills: true },
  });

  let skills: Record<string, number> = {};
  try {
    skills = user?.skills ? JSON.parse(user.skills as string) : {};
  } catch {
    skills = {};
  }

  skills[skillTag] = (skills[skillTag] || 0) + xpGained;

  await prisma.user.update({
    where: { id: userId },
    data: { skills: JSON.stringify(skills) },
  });
}

/**
 * Al verificar una tarea, sincroniza las skills explícitas de la tarea
 * (campo `skills`: JSON array ["design","frontend"]) hacia User.skills.
 *
 * Distribuye el XP total equitativamente entre todas las skills de la tarea.
 * Es complementario a matchAndAwardXp (keyword matching): este usa los tags
 * explícitos que el creador asignó a la tarea.
 */
export async function onTaskVerified(
  taskId: string,
  assigneeId: string,
  xpAwarded: number,
): Promise<string[]> {
  const task = await prisma.task.findUnique({
    where: { id: taskId },
    select: { skills: true },
  });

  if (!task?.skills) return [];

  let skillTags: string[] = [];
  try {
    skillTags = JSON.parse(task.skills);
  } catch {
    return [];
  }

  if (!Array.isArray(skillTags) || skillTags.length === 0) return [];

  const xpPerSkill = Math.floor(xpAwarded / skillTags.length);
  const remainder = xpAwarded - xpPerSkill * skillTags.length;

  const synced: string[] = [];

  for (let i = 0; i < skillTags.length; i++) {
    const tag = skillTags[i].toLowerCase().trim();
    if (!tag) continue;

    const xp = i === 0 ? xpPerSkill + remainder : xpPerSkill;
    await syncSkillsToUser(assigneeId, tag, xp);
    synced.push(tag);
  }

  console.log(
    `[skillSyncService] Task ${taskId}: synced ${xpAwarded} XP across [${synced.join(', ')}] → User ${assigneeId}`,
  );

  return synced;
}
