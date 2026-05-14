import { prisma } from '../index';

/**
 * Sincroniza XP hacia una skill específica del User (cross-tree).
 * Acumula xpGained en User.skills[skillTag] y recalcula totalXp.
 * Se llama después de completar/verificar una tarea.
 */
export async function syncSkillsToUser(
  userId: string,
  skillTag: string,
  xpGained: number,
): Promise<void> {
  // 1. Leer skills actuales del usuario
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

  // 2. Acumular XP en la skill
  skills[skillTag] = (skills[skillTag] || 0) + xpGained;

  // 3. Recalcular totalXp desde las skills
  const totalXp = Object.values(skills).reduce((sum, v) => sum + v, 0);

  // 4. Guardar
  await prisma.user.update({
    where: { id: userId },
    data: {
      skills: JSON.stringify(skills),
      totalXp,
    },
  });
}

/**
 * Al verificar una tarea, sincroniza las skills explícitas de la tarea
 * hacia User.skills (cross-tree).
 *
 * La task tiene un campo `skills` (JSON array: ["design","frontend"]).
 * Se distribuye el XP equitativamente entre todas las skills.
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

  // Distribuir XP equitativamente entre las skills
  const xpPerSkill = Math.floor(xpAwarded / skillTags.length);
  const remainder = xpAwarded - xpPerSkill * skillTags.length;

  const synced: string[] = [];

  for (let i = 0; i < skillTags.length; i++) {
    const tag = skillTags[i].toLowerCase().trim();
    if (!tag) continue;

    // La primera skill recibe el remainder
    const xp = i === 0 ? xpPerSkill + remainder : xpPerSkill;
    await syncSkillsToUser(assigneeId, tag, xp);
    synced.push(tag);
  }

  console.log(
    `[skillSyncService] Task ${taskId}: synced ${xpAwarded} XP across [${synced.join(', ')}] → User ${assigneeId}`,
  );

  return synced;
}
