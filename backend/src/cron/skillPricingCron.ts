/**
 * Skill Pricing Cron — actualiza precios por skill dentro de cada árbol
 * basado en oferta (# miembros con la skill) y demanda (# tareas abiertas).
 *
 * Corre cada hora.
 */

import { PrismaClient } from "@prisma/client";

// Tareas cuyo presupuesto aún no se ha consumido = demanda activa
const OPEN_TASK_STATUSES = ["PENDING", "ASSIGNED"];

export async function updateSkillPricing(prisma: PrismaClient): Promise<void> {
  const trees = await prisma.tree.findMany({
    include: {
      members: {
        where: { status: "ACTIVE" },
        include: {
          user: { select: { skills: true } },
        },
      },
    },
  });

  let totalPriced = 0;

  for (const tree of trees) {
    // 1. Oferta: cuántos miembros tienen cada skill
    const supplyBySkill: Record<string, number> = {};
    for (const member of tree.members) {
      let skills: Record<string, number> = {};
      try {
        skills = member.user?.skills
          ? JSON.parse(member.user.skills)
          : {};
      } catch {
        // skills field may be malformed JSON
      }
      for (const skill of Object.keys(skills)) {
        supplyBySkill[skill] = (supplyBySkill[skill] || 0) + 1;
      }
    }

    // 2. Demanda: tareas abiertas que requieren cada skill
    const openTasks = await prisma.task.findMany({
      where: {
        treeId: tree.id,
        status: { in: OPEN_TASK_STATUSES as any },
      },
      select: { skills: true },
    });

    const demandBySkill: Record<string, number> = {};
    for (const task of openTasks) {
      let taskSkills: string[] = [];
      try {
        taskSkills = task.skills ? JSON.parse(task.skills) : [];
      } catch {
        // skills field may be malformed JSON
      }
      for (const skill of taskSkills) {
        demandBySkill[skill] = (demandBySkill[skill] || 0) + 1;
      }
    }

    // 3. Calcular precio por skill (oferta/demanda)
    const allSkills = new Set([
      ...Object.keys(supplyBySkill),
      ...Object.keys(demandBySkill),
    ]);

    if (allSkills.size === 0) continue; // sin skills en este árbol

    const baseRate = 15; // USD/hora base

    for (const skill of allSkills) {
      const supply = supplyBySkill[skill] || 1; // evita división por cero
      const demand = demandBySkill[skill] || 0;
      const ratio = demand / supply;
      const rate = baseRate * (0.5 + ratio * 0.5); // Mín 50% base, sube con demanda
      const demandLevel = Math.min(10, Math.round(ratio * 5));

      await prisma.skillPricing.upsert({
        where: {
          treeId_skillTag: { treeId: tree.id, skillTag: skill },
        },
        create: {
          treeId: tree.id,
          skillTag: skill,
          ratePerHour: Math.round(rate),
          demandLevel,
          supplyCount: supply,
        },
        update: {
          ratePerHour: Math.round(rate),
          demandLevel,
          supplyCount: supply,
        },
      });

      totalPriced++;
    }
  }

  console.log(
    `[skillPricing] Pricing actualizado: ${totalPriced} skills en ${trees.length} árboles.`
  );
}
