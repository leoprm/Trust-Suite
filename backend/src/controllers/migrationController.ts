import { Request, Response } from 'express';
import { prisma } from '../index';
import { createNotification } from './notificationController';
import { getRequestContext, getRequestMetadata, logEvent } from '../services/eventLogService';

const TRIAL_TASKS_REQUIRED = 3;
const TREATY_WINDOW        = 7;   // max attempts in rolling window
const TREATY_THRESHOLD     = 6;   // successes needed to activate treaty
const CORRUPTION_FAIL_RATE = 0.20; // 20% high-level failure → revoke

// ═══════════════════════════════════════════════════════════════════════════════
// POST /migration/initiate
// Body: { hashtag, sourceTreeId, targetTreeId }
// Initiates a skill migration — either auto-approves via treaty or creates trial
// ═══════════════════════════════════════════════════════════════════════════════
export const initiateMigration = async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const { hashtag, sourceTreeId, targetTreeId } = req.body;

    if (!hashtag || !sourceTreeId || !targetTreeId) {
      return res.status(400).json({ error: 'hashtag, sourceTreeId, targetTreeId requeridos' });
    }
    if (sourceTreeId === targetTreeId) {
      return res.status(400).json({ error: 'Origen y destino no pueden ser iguales' });
    }

    // Verify user is a member of both trees
    const [sourceMember, targetMember] = await Promise.all([
      (prisma as any).treeMember.findUnique({
        where: { userId_treeId: { userId, treeId: sourceTreeId } },
      }),
      (prisma as any).treeMember.findUnique({
        where: { userId_treeId: { userId, treeId: targetTreeId } },
      }),
    ]);

    if (!sourceMember) return res.status(403).json({ error: 'No eres miembro del Árbol Origen' });
    if (!targetMember) return res.status(403).json({ error: 'No eres miembro del Árbol Destino' });

    // Verify user has the skill in the source tree
    const sourceSkills: string[] = JSON.parse(sourceMember.skills || '[]');
    const normalizedHashtag = hashtag.startsWith('#') ? hashtag : `#${hashtag}`;
    if (!sourceSkills.some((s: string) => s.toLowerCase() === normalizedHashtag.toLowerCase())) {
      return res.status(400).json({ error: 'No tienes esa habilidad certificada en el Árbol Origen' });
    }

    // Check if already migrated
    const existing = await (prisma as any).skillMigration.findUnique({
      where: {
        userId_hashtag_sourceTreeId_targetTreeId: {
          userId, hashtag: normalizedHashtag, sourceTreeId, targetTreeId,
        },
      },
    });
    if (existing) {
      return res.status(409).json({ error: 'Migración ya existe', migration: existing });
    }

    // Check if there's an active trust treaty → auto-approve
    const treaty = await (prisma as any).trustTreaty.findUnique({
      where: {
        sourceTreeId_targetTreeId_hashtag: {
          sourceTreeId, targetTreeId, hashtag: normalizedHashtag,
        },
      },
    });

    if (treaty?.activo) {
      // Auto-approve via treaty
      const migration = await (prisma as any).skillMigration.create({
        data: {
          userId,
          hashtag: normalizedHashtag,
          sourceTreeId,
          targetTreeId,
          status: 'APROBADO',
          tasksCompleted: TRIAL_TASKS_REQUIRED,
          autoApproved: true,
        },
      });

      // Add skill to target tree member
      const targetSkills: string[] = JSON.parse(targetMember.skills || '[]');
      if (!targetSkills.includes(normalizedHashtag)) {
        targetSkills.push(normalizedHashtag);
        await (prisma as any).treeMember.update({
          where: { id: targetMember.id },
          data: { skills: JSON.stringify(targetSkills) },
        });
      }

      await createNotification({
        userId,
        type: 'SKILL_UNLOCK',
        category: 'MERITO',
        title: 'Habilidad importada automáticamente',
        body: `Tu habilidad ${normalizedHashtag} fue aceptada automáticamente gracias a un Tratado de Confianza.`,
        entityType: 'arbol',
        entityAction: 'medir',
        entityId: targetTreeId,
      });

      return res.status(201).json({ migration, treatyApproved: true });

      void logEvent({
        ...getRequestContext(req),
        treeId: targetTreeId,
        actorId: userId,
        action: 'SKILL_MIGRATION_INITIATED',
        entityType: 'SkillMigration',
        entityId: migration.id,
        metadataJson: getRequestMetadata(req, {
          hashtag: normalizedHashtag,
          sourceTreeId,
          targetTreeId,
          treatyApproved: true,
        }),
        source: 'USER',
      });
    }

    // No treaty → create trial migration
    const migration = await (prisma as any).skillMigration.create({
      data: {
        userId,
        hashtag: normalizedHashtag,
        sourceTreeId,
        targetTreeId,
        status: 'EN_PRUEBA',
      },
    });

    await createNotification({
      userId,
      type: 'TASK_ASSIGNED',
      category: 'FLUJO',
      title: 'Migración de habilidad iniciada',
      body: `Debes completar ${TRIAL_TASKS_REQUIRED} tareas (Nivel 3-7) en el Árbol Destino para validar ${normalizedHashtag}.`,
      entityType: 'arbol',
      entityAction: 'hacer',
      entityId: targetTreeId,
    });

    res.status(201).json({ migration, treatyApproved: false });

    void logEvent({
      ...getRequestContext(req),
      treeId: targetTreeId,
      actorId: userId,
      action: 'SKILL_MIGRATION_INITIATED',
      entityType: 'SkillMigration',
      entityId: migration.id,
      metadataJson: getRequestMetadata(req, {
        hashtag: normalizedHashtag,
        sourceTreeId,
        targetTreeId,
        treatyApproved: false,
      }),
      source: 'USER',
    });
  } catch (e: any) {
    console.error('[initiateMigration]', e);
    res.status(500).json({ error: e.message });
  }
};

// ═══════════════════════════════════════════════════════════════════════════════
// POST /migration/:id/record-task
// Body: { success: boolean, taskDifficulty: number }
// Called when a foreign specialist completes (or fails) a trial task
// ═══════════════════════════════════════════════════════════════════════════════
export const recordTrialTask = async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const { id } = req.params;
    const { success, taskDifficulty } = req.body;

    const migration = await (prisma as any).skillMigration.findUnique({ where: { id } });
    if (!migration) return res.status(404).json({ error: 'Migración no encontrada' });
    if (migration.userId !== userId) return res.status(403).json({ error: 'No autorizado' });
    if (migration.status !== 'EN_PRUEBA') {
      return res.status(400).json({ error: 'Esta migración ya fue resuelta' });
    }

    // Validate task difficulty is between 3-7
    const diff = Number(taskDifficulty) || 0;
    if (diff < 3 || diff > 7) {
      return res.status(400).json({ error: 'La tarea debe ser de dificultad 3-7 para contar como prueba' });
    }

    const updateData: any = {};
    if (success) {
      updateData.tasksCompleted = migration.tasksCompleted + 1;
    } else {
      updateData.tasksFailed = migration.tasksFailed + 1;
    }

    // Check if trial is passed (3 successes)
    const newCompleted = updateData.tasksCompleted ?? migration.tasksCompleted;
    const newFailed = updateData.tasksFailed ?? migration.tasksFailed;

    if (newCompleted >= TRIAL_TASKS_REQUIRED) {
      updateData.status = 'APROBADO';

      // Add skill to target tree member
      const targetMember = await (prisma as any).treeMember.findUnique({
        where: { userId_treeId: { userId, treeId: migration.targetTreeId } },
      });
      if (targetMember) {
        const skills: string[] = JSON.parse(targetMember.skills || '[]');
        if (!skills.includes(migration.hashtag)) {
          skills.push(migration.hashtag);
          await (prisma as any).treeMember.update({
            where: { id: targetMember.id },
            data: { skills: JSON.stringify(skills) },
          });
        }
      }

      // Update trust treaty counters
      await updateTreatyCounters(migration.sourceTreeId, migration.targetTreeId, migration.hashtag, true);

      await createNotification({
        userId,
        type: 'SKILL_UNLOCK',
        category: 'MERITO',
        title: 'Habilidad validada en nuevo Árbol',
        body: `Completaste las ${TRIAL_TASKS_REQUIRED} tareas de prueba. Tu habilidad ${migration.hashtag} ahora es reconocida localmente.`,
        entityType: 'arbol',
        entityAction: 'medir',
        entityId: migration.targetTreeId,
      });
    } else if (newFailed >= TRIAL_TASKS_REQUIRED) {
      // Too many failures — mark as failed
      updateData.status = 'REPROBADO';

      await updateTreatyCounters(migration.sourceTreeId, migration.targetTreeId, migration.hashtag, false);

      await createNotification({
        userId,
        type: 'AVAL_RISK',
        category: 'URGENTE',
        title: 'Migración de habilidad fallida',
        body: `No lograste completar las tareas de prueba para ${migration.hashtag} en el Árbol Destino.`,
        entityType: 'arbol',
        entityAction: 'medir',
        entityId: migration.targetTreeId,
      });
    }

    const updated = await (prisma as any).skillMigration.update({
      where: { id },
      data: updateData,
    });

    res.json(updated);
  } catch (e: any) {
    console.error('[recordTrialTask]', e);
    res.status(500).json({ error: e.message });
  }
};

// ═══════════════════════════════════════════════════════════════════════════════
// GET /migration/my
// Query: ?targetTreeId=xxx&status=EN_PRUEBA
// Get user's own skill migrations
// ═══════════════════════════════════════════════════════════════════════════════
export const getMyMigrations = async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const { targetTreeId, status } = req.query;

    const where: any = { userId };
    if (targetTreeId) where.targetTreeId = targetTreeId;
    if (status) where.status = status;

    const migrations = await (prisma as any).skillMigration.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        sourceTree: { select: { id: true, name: true, icono: true } },
        targetTree: { select: { id: true, name: true, icono: true } },
      },
    });

    res.json(migrations);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
};

// ═══════════════════════════════════════════════════════════════════════════════
// GET /migration/foreign-status/:userId
// Query: ?targetTreeId=xxx
// Check if a user is a foreign specialist in a tree (used by auditors in RamaMedir)
// ═══════════════════════════════════════════════════════════════════════════════
export const getForeignStatus = async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;
    const { targetTreeId } = req.query;
    if (!targetTreeId) return res.status(400).json({ error: 'targetTreeId requerido' });

    const migrations = await (prisma as any).skillMigration.findMany({
      where: {
        userId,
        targetTreeId: targetTreeId as string,
        status: 'EN_PRUEBA',
      },
      include: {
        sourceTree: { select: { id: true, name: true, icono: true } },
      },
    });

    res.json({
      isForeign: migrations.length > 0,
      migrations,
    });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
};

// ═══════════════════════════════════════════════════════════════════════════════
// GET /migration/treaties
// Query: ?targetTreeId=xxx OR ?sourceTreeId=xxx
// Get trust treaties for a tree
// ═══════════════════════════════════════════════════════════════════════════════
export const getTreaties = async (req: Request, res: Response) => {
  try {
    const { targetTreeId, sourceTreeId } = req.query;
    const where: any = {};
    if (targetTreeId) where.targetTreeId = targetTreeId;
    if (sourceTreeId) where.sourceTreeId = sourceTreeId;

    const treaties = await (prisma as any).trustTreaty.findMany({
      where,
      include: {
        sourceTree: { select: { id: true, name: true, icono: true } },
        targetTree: { select: { id: true, name: true, icono: true } },
      },
      orderBy: { updatedAt: 'desc' },
    });

    res.json(treaties);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
};

// ═══════════════════════════════════════════════════════════════════════════════
// GET /migration/pretext/:migrationId
// Returns human-readable status text for UI display
// ═══════════════════════════════════════════════════════════════════════════════
export const getPretext = async (req: Request, res: Response) => {
  try {
    const { migrationId } = req.params;

    const migration = await (prisma as any).skillMigration.findUnique({
      where: { id: migrationId },
      include: {
        sourceTree: { select: { name: true, icono: true } },
        targetTree: { select: { name: true, icono: true } },
      },
    });

    if (!migration) return res.status(404).json({ error: 'Migración no encontrada' });

    let pretext = '';
    if (migration.autoApproved) {
      pretext = `Este usuario proviene de ${migration.sourceTree.icono} ${migration.sourceTree.name} con Tratado de Confianza. Su habilidad ${migration.hashtag} es aceptada automáticamente.`;
    } else if (migration.status === 'EN_PRUEBA') {
      pretext = `Especialista Extranjero en Prueba de ${migration.sourceTree.icono} ${migration.sourceTree.name}. Progreso: ${migration.tasksCompleted}/${TRIAL_TASKS_REQUIRED} tareas completadas. Requiere auditoría estricta.`;
    } else if (migration.status === 'APROBADO') {
      pretext = `Habilidad ${migration.hashtag} validada exitosamente. Originalmente certificada en ${migration.sourceTree.icono} ${migration.sourceTree.name}.`;
    } else {
      pretext = `Migración de ${migration.hashtag} desde ${migration.sourceTree.icono} ${migration.sourceTree.name} fue reprobada.`;
    }

    res.json({ pretext, migration });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
};

// ═══════════════════════════════════════════════════════════════════════════════
// INTERNAL: Update trust treaty counters after a migration resolves
// ═══════════════════════════════════════════════════════════════════════════════
async function updateTreatyCounters(
  sourceTreeId: string,
  targetTreeId: string,
  hashtag: string,
  success: boolean
) {
  try {
    // Upsert treaty record
    let treaty = await (prisma as any).trustTreaty.findUnique({
      where: {
        sourceTreeId_targetTreeId_hashtag: { sourceTreeId, targetTreeId, hashtag },
      },
    });

    if (!treaty) {
      treaty = await (prisma as any).trustTreaty.create({
        data: { sourceTreeId, targetTreeId, hashtag },
      });
    }

    const newExitosos = success ? treaty.exitosos + 1 : treaty.exitosos;
    const newTotal = treaty.totalIntentos + 1;

    // If window is full (7), slide it
    let finalExitosos = newExitosos;
    let finalTotal = newTotal;
    if (finalTotal > TREATY_WINDOW) {
      // Proportionally scale down to keep a rolling window of 7
      const ratio = TREATY_WINDOW / finalTotal;
      finalExitosos = Math.round(finalExitosos * ratio);
      finalTotal = TREATY_WINDOW;
    }

    const activo = finalExitosos >= TREATY_THRESHOLD;

    await (prisma as any).trustTreaty.update({
      where: { id: treaty.id },
      data: {
        exitosos: finalExitosos,
        totalIntentos: finalTotal,
        activo,
        revocadoPorCorrupcion: false,
      },
    });
  } catch (e) {
    console.error('[updateTreatyCounters]', e);
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// CRON / INTERNAL: Corruption check — revoke treaties where >20% high-level failures
// Called periodically or after each high-level task failure
// ═══════════════════════════════════════════════════════════════════════════════
export const checkCorruption = async () => {
  try {
    const activeTreaties = await (prisma as any).trustTreaty.findMany({
      where: { activo: true },
    });

    for (const treaty of activeTreaties) {
      // Count recent high-level (difficulty > 6) task failures from source tree users
      // in the target tree, for this hashtag
      const migrations = await (prisma as any).skillMigration.findMany({
        where: {
          sourceTreeId: treaty.sourceTreeId,
          targetTreeId: treaty.targetTreeId,
          hashtag: treaty.hashtag,
          autoApproved: true,
        },
        select: { userId: true },
      });

      if (migrations.length === 0) continue;

      const userIds = migrations.map((m: any) => m.userId);

      // Find tasks in target tree assigned to these users
      const [totalHighLevel, failedHighLevel] = await Promise.all([
        (prisma as any).task.count({
          where: {
            assignedTo: { in: userIds },
            branch: { treeId: treaty.targetTreeId },
            difficulty: { gt: 6 },
            status: 'COMPLETED',
          },
        }),
        (prisma as any).task.count({
          where: {
            assignedTo: { in: userIds },
            branch: { treeId: treaty.targetTreeId },
            difficulty: { gt: 6 },
            evidenceStatus: 'REJECTED',
          },
        }),
      ]);

      if (totalHighLevel >= 5 && failedHighLevel / totalHighLevel > CORRUPTION_FAIL_RATE) {
        // Revoke treaty
        await (prisma as any).trustTreaty.update({
          where: { id: treaty.id },
          data: {
            activo: false,
            revocadoPorCorrupcion: true,
            exitosos: 0,
            totalIntentos: 0,
          },
        });

        console.log(`[checkCorruption] Treaty revoked: ${treaty.sourceTreeId} → ${treaty.targetTreeId} for ${treaty.hashtag}`);
      }
    }
  } catch (e) {
    console.error('[checkCorruption]', e);
  }
};
