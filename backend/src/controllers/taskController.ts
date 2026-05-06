import { Request, Response } from 'express';
import { prisma } from '../index';
import { calculateTotalBranchPoints } from '../utils/scoring';
import { 
  calculateXpFromDifficulty, 
  redistributeTreeBudget,
  resolveBranchTreeId 
} from '../utils/economicEngine';
import { canAssumeTask } from '../utils/eliteCalculator';
import { useGoldenTicket, evaluateGoldenStreak } from '../utils/goldenTicketEngine';
import { canViewUserPrivacyLevel, redactTaskEvidenceFields, withDefaultPrivacySettings } from '../utils/privacy';
import { getRequestContext, getRequestMetadata, logEvent } from '../services/eventLogService';

// ─── HELPERS ──────────────────────────────────────────────────────────

const CIVIC_AUDIT_PROBABILITY = 0.20;
const CIVIC_BONUS_XP = 2;

/**
 * Find a random completed task from the last 30 days
 * that was NOT created or assigned to the given userId.
 */
async function findAuditCandidate(userId: string): Promise<{ id: string; description: string; tags: string[] } | null> {
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const candidates = await prisma.task.findMany({
    where: {
      status: 'COMPLETED',
      completedAt: { gte: thirtyDaysAgo },
      assignedTo: { not: userId },
      creatorId: { not: userId },
    },
    select: { id: true, description: true, tags: { select: { skillName: true } } },
  });
  if (candidates.length === 0) return null;
  const pick = candidates[Math.floor(Math.random() * candidates.length)];
  return { id: pick.id, description: pick.description, tags: pick.tags.map((t: any) => t.skillName) };
}

export const calculateConsensusDifficulty = async (taskId: string) => {
  console.log(`[calculateConsensusDifficulty] Processing taskId: ${taskId}`);
  const votes = await (prisma as any).difficultyVote.findMany({
    where: { taskId },
    include: {
      _count: {
        select: { likes: true }
      }
    }
  });

  if (votes.length === 0) return 0;
  
  // Basic average if few votes
  if (votes.length < 3) {
    const sum = votes.reduce((acc: number, v: any) => acc + (v.value || 0), 0);
    return sum / votes.length;
  }

  // IQR Outlier Detection
  const sortedVotes = [...votes].sort((a, b) => a.value - b.value);
  const scores = sortedVotes.map(v => v.value);
  
  const getPercentile = (data: number[], percentile: number) => {
    const index = (percentile / 100) * (data.length - 1);
    const lower = Math.floor(index);
    const upper = Math.ceil(index);
    if (lower === upper) return data[lower];
    const weight = index - lower;
    return data[lower] * (1 - weight) + data[upper] * weight;
  };

  const q1 = getPercentile(scores, 25);
  const q3 = getPercentile(scores, 75);
  const iqr = q3 - q1;
  const lowerBound = q1 - 1.5 * iqr;
  const upperBound = q3 + 1.5 * iqr;

  const totalVoters = votes.length;
  const rescuedVotes: any[] = [];
  const normalVotes: any[] = [];

  votes.forEach((vote: any) => {
    const isOutlier = vote.value < lowerBound || vote.value > upperBound;
    if (isOutlier) {
      // Social Rescue Rule
      const likesCount = vote._count.likes;
      const hasComment = !!vote.comment && vote.comment.trim().length > 0;
      // Rule: At least 20% of total voters or minimum 2 likes
      const minLikesForRescue = Math.max(2, Math.ceil(totalVoters * 0.2));
      
      if (hasComment && likesCount >= minLikesForRescue) {
        rescuedVotes.push(vote);
      }
    } else {
      normalVotes.push(vote);
    }
  });

  const finalVotes = [...normalVotes, ...rescuedVotes];
  if (finalVotes.length === 0) {
     const sum = votes.reduce((acc: number, v: any) => acc + v.value, 0);
     return sum / votes.length;
  }

  const finalSum = finalVotes.reduce((acc: number, v: any) => acc + v.value, 0);
  return finalSum / finalVotes.length;
};

const redactTaskEvidence = async (task: any, userId: string, memberships: any[], userRole?: string) => {
  // 1. Authors always see their own evidence
  if (task.assignedTo === userId) return task;

  if (task.assignedTo) {
    const owner = await (prisma as any).user.findUnique({
      where: { id: task.assignedTo },
      select: { privacySettings: true },
    });
    const privacy = withDefaultPrivacySettings(task.assignedTo, owner?.privacySettings);
    const allowedByOwner = await canViewUserPrivacyLevel({
      level: privacy.evidenceVisibility,
      ownerId: task.assignedTo,
      viewerId: userId,
      viewerRole: userRole,
    });
    if (!allowedByOwner) {
      return redactTaskEvidenceFields({
        ...task,
        completionComment: null,
      });
    }
  }

  // 2. Determine target treeId
  const treeId = task.branch?.treeId || (task.branch?.idea?.need?.treeLinks?.[0]?.treeId);
  if (!treeId) return task;

  // 3. Tree Creator check
  const isTreeCreator = task.branch?.tree?.creatorId === userId || 
                       task.branch?.idea?.need?.treeLinks?.some((tl: any) => tl.tree?.creatorId === userId);

  // 4. Level check (Level 3+)
  const membership = memberships.find(m => m.treeId === treeId);
  const isHighLevel = membership && membership.level >= 3;

  if (!isTreeCreator && !isHighLevel) {
    return redactTaskEvidenceFields({
      ...task,
      completionComment: null,
      isRedacted: true,
    });
  }

  return task;
};

// ─── CONTROLLERS ──────────────────────────────────────────────────────

export const createExpressTask = async (req: any, res: Response) => {
  try {
    const { branchId, name, description, treeId, assignToMe } = req.body;

    const branch = await (prisma as any).branch.findUnique({ where: { id: branchId } });
    if (!branch) return res.status(404).json({ error: 'Hashtag branch not found' });
    if (!branch.isHashtag) return res.status(400).json({ error: 'Esta rama no es un hashtag.' });

    const membership = await prisma.treeMember.findUnique({
      where: { userId_treeId: { userId: req.user.id, treeId } },
      include: { tree: true }
    });
    if (!membership) return res.status(403).json({ error: 'Access denied' });

    const task = await prisma.task.create({
      data: {
        branchId,
        name: name || 'Express Task',
        description,
        creatorId: req.user.id,
        assignedTo: assignToMe ? req.user.id : null,
        status: assignToMe ? 'IN_PROGRESS' : 'OPEN',
        phase: 'DEVELOPMENT'
      }
    });

    void logEvent({
      ...getRequestContext(req),
      treeId: treeId ?? branch.treeId ?? null,
      action: 'TASK_CREATED',
      entityType: 'Task',
      entityId: task.id,
      afterJson: { id: task.id, branchId, name: task.name, status: task.status, assignedTo: task.assignedTo },
      metadataJson: getRequestMetadata(req, { express: true, result: 'success' }),
      source: 'USER',
    });

    res.status(201).json(task);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error interno' });
  }
};

export const createTask = async (req: any, res: Response) => {
  try {
    const { branchId, name, description, tags, phase, requiredHours, difficulty, startPhotoUrl, startPhotoUrls } = req.body;
    // startPhotoUrls: string[] takes priority over legacy startPhotoUrl
    const resolvedStartPhotoUrl = startPhotoUrls !== undefined
      ? (Array.isArray(startPhotoUrls) && startPhotoUrls.length > 0 ? JSON.stringify(startPhotoUrls) : null)
      : (startPhotoUrl || null);

    // ── Permission Check ──────────────────────────────────────────────
    const branch = await (prisma as any).branch.findUnique({
      where: { id: branchId },
      include: { tree: true }
    });
    if (!branch) return res.status(404).json({ error: 'Rama no encontrada' });

    // Hashtag branches are open to all tree members
    // Normal branches require BranchMember
    if (branch.isHashtag) {
      // Must be a member of the tree
      const treeId = branch.treeId;
      if (treeId) {
        const treeMember = await prisma.treeMember.findUnique({
          where: { userId_treeId: { userId: req.user.id, treeId } }
        });
        if (!treeMember) return res.status(403).json({ error: 'Debes ser miembro del árbol para crear tareas en ramas hashtag' });
      }
    } else {
      // Normal branch — must be a BranchMember or tree creator
      const treeId = await resolveBranchTreeId(branchId);
      const isCreator = branch.tree?.creatorId === req.user.id;
      if (!isCreator) {
        const branchMember = await (prisma as any).branchMember.findUnique({
          where: { userId_branchId: { userId: req.user.id, branchId } }
        });
        if (!branchMember) return res.status(403).json({ error: 'Debes ser miembro de esta rama para crear tareas' });
      }
    }

    const task = await prisma.task.create({
      data: {
        branchId,
        name: name || 'Task',
        description,
        phase: phase || 'INVESTIGATION',
        creatorId: req.user.id,
        requiredHours: requiredHours || null,
        difficulty,
        startPhotoUrl: resolvedStartPhotoUrl,
        tags: { create: (tags || []).map((t: string) => ({ skillName: t })) }
      }
    });
    void logEvent({
      ...getRequestContext(req),
      treeId: branch.treeId ?? null,
      action: 'TASK_CREATED',
      entityType: 'Task',
      entityId: task.id,
      afterJson: { id: task.id, branchId, name: task.name, status: task.status, phase: task.phase },
      metadataJson: getRequestMetadata(req, {
        tags: tags || [],
        hasStartEvidence: Boolean(resolvedStartPhotoUrl),
        result: 'success',
      }),
      source: 'USER',
    });
    res.status(201).json(task);
  } catch (error) {
    console.error('[createTask] error:', error);
    res.status(500).json({ error: 'Error al crear tarea' });
  }
};

export const completeTask = async (req: any, res: Response) => {
  try {
    const { id } = req.params;
    const { evidenceUrl, difficulty, comment, photoUrl, photoUrls } = req.body;
    // photoUrls: string[] takes priority over legacy photoUrl (single URL)
    const resolvedPhotoUrl = photoUrls !== undefined
      ? (Array.isArray(photoUrls) && photoUrls.length > 0 ? JSON.stringify(photoUrls) : null)
      : photoUrl;

    const task = await prisma.task.findUnique({
      where: { id },
      include: {
        branch: {
          include: {
            idea: { include: { need: { include: { treeLinks: true } } } },
            tree: true
          }
        }
      }
    });
    if (!task) return res.status(404).json({ error: 'Task not found' });

    // 24h Edit Logic
    const currentTask = task as any;
    const isAuthor = currentTask.assignedTo === req.user.id;
    if (currentTask.status === 'COMPLETED' && isAuthor) {
      const hoursSinceCompletion = (Date.now() - new Date(currentTask.completedAt!).getTime()) / (1000 * 60 * 60);
      if (hoursSinceCompletion > 24) return res.status(403).json({ error: 'Ventana de 24h expirada' });
      if (currentTask.auditada) return res.status(403).json({ error: 'Tarea ya auditada' });
    }

    const treeIds = (currentTask.branch as any).treeId ? [(currentTask.branch as any).treeId] : (currentTask.branch.idea?.need.treeLinks.map((tl: any) => tl.treeId) || []);
    const memberships = await prisma.treeMember.findMany({ where: { userId: req.user.id, treeId: { in: treeIds } } });
    const isUnverified = memberships.some((m: any) => m.status === 'UNVERIFIED');

    const { calculateTaskXpReward, calculateXpFromDifficulty } = await import('../utils/economicEngine');
    
    // Calculate OLD XP (if already completed)
    let oldXp = 0;
    if (currentTask.status === 'COMPLETED' && currentTask.difficulty) {
      oldXp = Math.floor(calculateXpFromDifficulty(task.branch.xpPool, currentTask.difficulty));
    }

    console.log(`[completeTask] Body:`, req.body);

    if (difficulty && difficulty >= 1 && difficulty <= 10) {
      console.log(`[completeTask] Upserting vote: user=${req.user.id} task=${id} val=${difficulty}`);
      await (prisma as any).difficultyVote.upsert({
        where: { user_task_unique: { userId: req.user.id, taskId: id } },
        update: { value: difficulty, comment: comment || null, status: 'valido' },
        create: { userId: req.user.id, taskId: id, value: difficulty, comment: comment || null, status: 'valido' }
      });
      
      const newDifficulty = await calculateConsensusDifficulty(id);
      console.log(`[completeTask] New consensus difficulty: ${newDifficulty}`);
      
      // Merge updates: difficulty + status/evidence
      const updatedTask = await prisma.task.update({
        where: { id },
        data: {
          difficulty: newDifficulty,
          status: (isUnverified && evidenceUrl) ? 'IN_PROGRESS' : 'COMPLETED',
          evidenceUrl: evidenceUrl || currentTask.evidenceUrl,
          completionComment: comment !== undefined ? comment : currentTask.completionComment,
          completionPhotoUrl: (photoUrls !== undefined || photoUrl !== undefined) ? resolvedPhotoUrl : currentTask.completionPhotoUrl,
          completedAt: currentTask.completedAt || new Date()
        }
      });

      console.log(`[completeTask] Task updated: diff=${updatedTask.difficulty} comment=${updatedTask.completionComment}`);

      const rawXp = await calculateTaskXpReward(id);
      const xpToAward = Math.floor(rawXp);
      let deltaXp = (currentTask.status === 'COMPLETED') ? (xpToAward - oldXp) : xpToAward;
      
      console.log(`[completeTask] XP delta: ${deltaXp} (rawTotal: ${rawXp})`);

      if (updatedTask.status === 'COMPLETED' && currentTask.assignedTo && deltaXp !== 0) {
        for (const treeId of treeIds) {
          const member = await prisma.treeMember.findUnique({ where: { userId_treeId: { userId: currentTask.assignedTo, treeId } } }) as any;
          if (!member) continue;

          // Expert Endorsement boost: +5% per active endorsement, max +15%
          let bonusApplied = false;
          try {
            const { getEndorsementBoostStatus } = await import('../services/expertEndorsementService');
            const boost = await getEndorsementBoostStatus(currentTask.assignedTo, treeId);
            if (boost.boostPct > 0) {
              deltaXp = Math.floor(deltaXp * (1 + boost.boostPct / 100));
              bonusApplied = true;
            }
          } catch { /* boost lookup is best-effort; skip if service fails */ }
          
          const oldLevel = member.level;
          const newXp = Math.max(0, (member.xp || 0) + deltaXp);
          const newLevel = Math.max(1, Math.floor(newXp / 50) + 1);
          await prisma.treeMember.update({ where: { id: member.id }, data: { xp: newXp, level: newLevel } });
          void logEvent({
            ...getRequestContext(req),
            treeId,
            actorId: currentTask.assignedTo,
            action: 'XP_GRANTED',
            entityType: 'TreeMember',
            entityId: member.id,
            beforeJson: { xp: member.xp, level: oldLevel },
            afterJson: { xp: newXp, level: newLevel },
            metadataJson: getRequestMetadata(req, { taskId: id, deltaXp }),
            source: 'SYSTEM',
          });
          
          if (oldLevel !== newLevel) {
            const { redistributeTreeBudget } = await import('../utils/economicEngine');
            await redistributeTreeBudget(treeId);
            void logEvent({
              ...getRequestContext(req),
              treeId,
              actorId: currentTask.assignedTo,
              action: 'LEVEL_UPDATED',
              entityType: 'TreeMember',
              entityId: member.id,
              beforeJson: { level: oldLevel },
              afterJson: { level: newLevel },
              metadataJson: getRequestMetadata(req, { taskId: id }),
              source: 'SYSTEM',
            });
          }

          if (bonusApplied) {
            console.log(`[completeTask] Mentorship +5% XP bonus applied for user ${currentTask.assignedTo} in tree ${treeId}`);
          }
        }
      }

      // ── Genesis trial auto-recording ──────────────────────
      // If user has EN_PRUEBA skill proposals matching any task tag, auto-record trial
      if (updatedTask.status === 'COMPLETED' && currentTask.assignedTo) {
        try {
          const taskWithTags = await (prisma as any).task.findUnique({
            where: { id },
            include: { tags: true, branch: { select: { treeId: true } } },
          });
          const taskDifficulty = taskWithTags?.difficulty || 0;
          const taskTreeId = taskWithTags?.branch?.treeId;
          const tagNames: string[] = (taskWithTags?.tags || []).map((t: any) => t.skillName);

          if (taskTreeId && tagNames.length > 0 && taskDifficulty >= 1 && taskDifficulty <= 3) {
            const activeProposals = await (prisma as any).skillProposal.findMany({
              where: {
                userId: currentTask.assignedTo,
                treeId: taskTreeId,
                status: 'EN_PRUEBA',
                hashtag: { in: tagNames },
              },
            });
            for (const proposal of activeProposals) {
              const newCompleted = proposal.tasksCompleted + 1;
              if (newCompleted >= 7) {
                // PASSED — grant skill
                await (prisma as any).skillProposal.update({
                  where: { id: proposal.id },
                  data: { tasksCompleted: newCompleted, status: 'APROBADO' },
                });
                const membership = await (prisma as any).treeMember.findUnique({
                  where: { userId_treeId: { userId: currentTask.assignedTo, treeId: taskTreeId } },
                });
                if (membership) {
                  const skills: string[] = JSON.parse(membership.skills || '[]');
                  if (!skills.some((s: string) => s.toLowerCase() === proposal.hashtag.toLowerCase())) {
                    skills.push(proposal.hashtag);
                    await (prisma as any).treeMember.update({
                      where: { id: membership.id },
                      data: { skills: JSON.stringify(skills) },
                    });
                  }
                }
                const { createNotification } = await import('./notificationController');
                await createNotification({
                  userId: currentTask.assignedTo, type: 'SKILL_UNLOCK', category: 'MERITO',
                  title: '¡Nueva Especialidad Certificada!',
                  body: `Has completado 7 tareas de prueba y ahora eres Especialista en ${proposal.hashtag}.`,
                  entityType: 'TREE', entityAction: 'UPDATE', entityId: taskTreeId,
                });

                // ── Check for GENESIS → MADUREZ transition ───────────
                const { countSpecialists, MIN_ESPECIALISTAS_PARETO } = await import('../utils/genesisPhase');
                const newSpecCount = await countSpecialists(taskTreeId, proposal.hashtag);
                if (newSpecCount === MIN_ESPECIALISTAS_PARETO) {
                  console.log(`[Genesis→Madurez] ${proposal.hashtag} reached ${MIN_ESPECIALISTAS_PARETO} specialists in tree ${taskTreeId}`);
                  // Global notification to every member of this tree
                  const treeMembers = await (prisma as any).treeMember.findMany({
                    where: { treeId: taskTreeId },
                    select: { userId: true },
                  });
                  for (const tm of treeMembers) {
                    await createNotification({
                      userId: tm.userId, type: 'SYSTEM', category: 'ARBOL',
                      title: `¡El gremio de ${proposal.hashtag} ha madurado!`,
                      body: `${proposal.hashtag} ya cuenta con ${MIN_ESPECIALISTAS_PARETO} especialistas. Se activa la Ley de Pareto: los 2 mejores son ahora Élite Dorada y los contratos de nivel crítico están desbloqueados.`,
                      entityType: 'TREE', entityAction: 'UPDATE', entityId: taskTreeId,
                    });
                  }
                }
              } else {
                await (prisma as any).skillProposal.update({
                  where: { id: proposal.id },
                  data: { tasksCompleted: newCompleted },
                });
              }
            }
          }
        } catch (trialErr) {
          console.error('[completeTask] trial recording error:', trialErr);
        }

        // ── Migration trial auto-recording ────────────────────
        // If user has EN_PRUEBA SkillMigrations for this target tree, auto-record
        try {
          const taskWithTagsMig = await (prisma as any).task.findUnique({
            where: { id },
            include: { tags: true, branch: { select: { treeId: true } } },
          });
          const migDifficulty = taskWithTagsMig?.difficulty || 0;
          const migTreeId = taskWithTagsMig?.branch?.treeId;
          const migTagNames: string[] = (taskWithTagsMig?.tags || []).map((t: any) => t.skillName);

          if (migTreeId && migTagNames.length > 0 && migDifficulty >= 3 && migDifficulty <= 7) {
            const activeMigrations = await (prisma as any).skillMigration.findMany({
              where: {
                userId: currentTask.assignedTo,
                targetTreeId: migTreeId,
                status: 'EN_PRUEBA',
                hashtag: { in: migTagNames },
              },
            });

            for (const mig of activeMigrations) {
              const newCompleted = mig.tasksCompleted + 1;
              if (newCompleted >= 3) {
                // PASSED — grant skill in target tree
                await (prisma as any).skillMigration.update({
                  where: { id: mig.id },
                  data: { tasksCompleted: newCompleted, status: 'APROBADO' },
                });
                const targetMember = await (prisma as any).treeMember.findUnique({
                  where: { userId_treeId: { userId: currentTask.assignedTo, treeId: migTreeId } },
                });
                if (targetMember) {
                  const skills: string[] = JSON.parse(targetMember.skills || '[]');
                  if (!skills.some((s: string) => s.toLowerCase() === mig.hashtag.toLowerCase())) {
                    skills.push(mig.hashtag);
                    await (prisma as any).treeMember.update({
                      where: { id: targetMember.id },
                      data: { skills: JSON.stringify(skills) },
                    });
                  }
                }
                // Update treaty counters directly
                let treaty = await (prisma as any).trustTreaty.findUnique({
                  where: { sourceTreeId_targetTreeId_hashtag: { sourceTreeId: mig.sourceTreeId, targetTreeId: migTreeId, hashtag: mig.hashtag } },
                });
                if (!treaty) {
                  treaty = await (prisma as any).trustTreaty.create({
                    data: { sourceTreeId: mig.sourceTreeId, targetTreeId: migTreeId, hashtag: mig.hashtag },
                  });
                }
                const newExitosos = treaty.exitosos + 1;
                const newTotal = treaty.totalIntentos + 1;
                let finalExitosos = newExitosos;
                let finalTotal = newTotal;
                if (finalTotal > 7) {
                  const ratio = 7 / finalTotal;
                  finalExitosos = Math.round(finalExitosos * ratio);
                  finalTotal = 7;
                }
                await (prisma as any).trustTreaty.update({
                  where: { id: treaty.id },
                  data: { exitosos: finalExitosos, totalIntentos: finalTotal, activo: finalExitosos >= 6, revocadoPorCorrupcion: false },
                });

                const { createNotification: notifyMig } = await import('./notificationController');
                await notifyMig({
                  userId: currentTask.assignedTo, type: 'SKILL_UNLOCK', category: 'MERITO',
                  title: 'Habilidad migrada exitosamente',
                  body: `Completaste 3 tareas de prueba. Tu habilidad ${mig.hashtag} ahora es reconocida en este Árbol.`,
                  entityType: 'TREE', entityAction: 'UPDATE', entityId: migTreeId,
                });
              } else {
                await (prisma as any).skillMigration.update({
                  where: { id: mig.id },
                  data: { tasksCompleted: newCompleted },
                });
              }
            }
          }
        } catch (migErr) {
          console.error('[completeTask] migration trial error:', migErr);
        }
      }

      // ── Civic Audit Dice (20%) ──────────────────────────────────
      let auditRequired = false;
      let auditTask: { id: string; description: string; tags: string[] } | null = null;
      if (updatedTask.status === 'COMPLETED' && currentTask.status !== 'COMPLETED') {
        // Only roll the dice on first completion (not 24h edits)
        if (Math.random() < CIVIC_AUDIT_PROBABILITY) {
          auditTask = await findAuditCandidate(req.user.id);
          if (auditTask) auditRequired = true;
        }
      }

      void logEvent({
        ...getRequestContext(req),
        treeId: treeIds[0] ?? null,
        action: 'TASK_COMPLETED',
        entityType: 'Task',
        entityId: id,
        beforeJson: { status: currentTask.status, difficulty: currentTask.difficulty },
        afterJson: { status: updatedTask.status, difficulty: updatedTask.difficulty, completedAt: updatedTask.completedAt },
        metadataJson: getRequestMetadata(req, { xpAwarded: deltaXp, result: 'success' }),
        source: 'USER',
      });

      if (evidenceUrl || photoUrl || (Array.isArray(photoUrls) && photoUrls.length > 0)) {
        void logEvent({
          ...getRequestContext(req),
          treeId: treeIds[0] ?? null,
          action: 'TASK_EVIDENCE_UPLOADED',
          entityType: 'Task',
          entityId: id,
          metadataJson: getRequestMetadata(req, {
            evidenceKinds: {
              evidenceUrl: Boolean(evidenceUrl),
              photoUrl: Boolean(photoUrl),
              photoUrlsCount: Array.isArray(photoUrls) ? photoUrls.length : 0,
            },
          }),
          source: 'USER',
        });
      }

      return res.json({
        ...updatedTask,
        xpAwarded: deltaXp,
        bonusXp: 0,
        auditRequired,
        auditTask,
      });
    }

    // Path if no difficulty provided (rare now)
    const updatedTask = await prisma.task.update({
      where: { id },
      data: {
        status: (isUnverified && evidenceUrl) ? 'IN_PROGRESS' : 'COMPLETED',
        evidenceUrl: evidenceUrl || currentTask.evidenceUrl,
        completionComment: comment !== undefined ? comment : currentTask.completionComment,
        completionPhotoUrl: (photoUrls !== undefined || photoUrl !== undefined) ? resolvedPhotoUrl : currentTask.completionPhotoUrl,
        completedAt: currentTask.completedAt || new Date()
      }
    });

    // ── Civic Audit Dice (20%) — no-difficulty path ──────────
    let auditRequired2 = false;
    let auditTask2: { id: string; description: string; tags: string[] } | null = null;
    if (updatedTask.status === 'COMPLETED' && currentTask.status !== 'COMPLETED') {
      if (Math.random() < CIVIC_AUDIT_PROBABILITY) {
        auditTask2 = await findAuditCandidate(req.user.id);
        if (auditTask2) auditRequired2 = true;
      }
    }

    void logEvent({
      ...getRequestContext(req),
      treeId: treeIds[0] ?? null,
      action: 'TASK_COMPLETED',
      entityType: 'Task',
      entityId: id,
      beforeJson: { status: currentTask.status, difficulty: currentTask.difficulty },
      afterJson: { status: updatedTask.status, difficulty: updatedTask.difficulty, completedAt: updatedTask.completedAt },
      metadataJson: getRequestMetadata(req, { xpAwarded: 0, result: 'success' }),
      source: 'USER',
    });

    if (evidenceUrl || photoUrl || (Array.isArray(photoUrls) && photoUrls.length > 0)) {
      void logEvent({
        ...getRequestContext(req),
        treeId: treeIds[0] ?? null,
        action: 'TASK_EVIDENCE_UPLOADED',
        entityType: 'Task',
        entityId: id,
        metadataJson: getRequestMetadata(req, {
          evidenceKinds: {
            evidenceUrl: Boolean(evidenceUrl),
            photoUrl: Boolean(photoUrl),
            photoUrlsCount: Array.isArray(photoUrls) ? photoUrls.length : 0,
          },
        }),
        source: 'USER',
      });
    }

    res.json({
      ...updatedTask,
      xpAwarded: 0,
      bonusXp: 0,
      auditRequired: auditRequired2,
      auditTask: auditTask2,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error' });
  }
};

export const getPendingTasks = async (req: any, res: Response) => {
  try {
    const userId = req.user.id;
    const memberships = await prisma.treeMember.findMany({ where: { userId } });
    const userTreeIds = memberships.map(m => m.treeId);

    const tasks = await prisma.task.findMany({
      where: {
        status: { in: ['OPEN', 'IN_PROGRESS', 'COMPLETED'] },
        OR: [
          { branch: { idea: { need: { treeLinks: { some: { treeId: { in: userTreeIds } } } } } } },
          { branch: { treeId: { in: userTreeIds } } }
        ]
      },
      include: {
        branch: { include: { tree: true, idea: { include: { need: { include: { treeLinks: { include: { tree: true } } } } } } } },
        tags: true
      },
      orderBy: { createdAt: 'desc' }
    });

    const results = await Promise.all(tasks.map(async (task) => {
      const branchPoints = await calculateTotalBranchPoints(task.branchId);
      const t = { ...task, branch: { ...task.branch, totalPoints: branchPoints } };
      const redacted = await redactTaskEvidence(t, userId, memberships, req.user?.role);

      // Enrich completed tasks with foreign migration status for auditors
      if ((task as any).status === 'COMPLETED' && (task as any).assignedTo) {
        const treeId = (task as any).branch?.treeId;
        if (treeId) {
          const foreignMigrations = await (prisma as any).skillMigration.findMany({
            where: {
              userId: (task as any).assignedTo,
              targetTreeId: treeId,
              status: 'EN_PRUEBA',
            },
            include: {
              sourceTree: { select: { name: true, icono: true } },
            },
          });
          if (foreignMigrations.length > 0) {
            (redacted as any).foreignStatus = {
              isForeign: true,
              migrations: foreignMigrations.map((m: any) => ({
                hashtag: m.hashtag,
                sourceTreeName: m.sourceTree?.name,
                sourceTreeIcon: m.sourceTree?.icono,
                tasksCompleted: m.tasksCompleted,
                tasksRequired: 3,
              })),
            };
          }
        }
      }

      return redacted;
    }));

    res.json(results);
  } catch (error) {
    res.status(500).json({ error: 'Error' });
  }
};

export const submitDifficultyVote = async (req: any, res: Response) => {
  try {
    const { id } = req.params;
    const { value, comment } = req.body;
    await (prisma as any).difficultyVote.upsert({
      where: { user_task_unique: { userId: req.user.id, taskId: id } },
      update: { value, comment, status: 'valido' },
      create: { userId: req.user.id, taskId: id, value, comment, status: 'valido' }
    });
    const newDifficulty = await calculateConsensusDifficulty(id);
    await prisma.task.update({ where: { id }, data: { difficulty: newDifficulty } });
    const taskForLog = await (prisma as any).task.findUnique({
      where: { id },
      select: { branch: { select: { treeId: true } } },
    });
    void logEvent({
      ...getRequestContext(req),
      treeId: taskForLog?.branch?.treeId ?? null,
      action: 'TASK_DIFFICULTY_DECLARED',
      entityType: 'Task',
      entityId: id,
      afterJson: { difficulty: newDifficulty },
      metadataJson: getRequestMetadata(req, { value, hasComment: Boolean(comment), result: 'success' }),
      source: 'USER',
    });
    res.json({ newDifficulty });
  } catch (error) {
    res.status(500).json({ error: 'Error' });
  }
};

export const assignTask = async (req: any, res: Response) => {
  try {
    const { id } = req.params;
    const task = await prisma.task.findUnique({ where: { id } }) as any;
    if (!task) return res.status(404).json({ error: 'Task not found' });
    if (task.status !== 'OPEN') return res.status(400).json({ error: 'Solo se pueden asumir tareas abiertas' });

    // Auto-release expired tasks before checking
    if (task.assignedTo && task.deadlineAt && new Date() > new Date(task.deadlineAt)) {
      await (prisma as any).task.update({ where: { id }, data: { assignedTo: null, status: 'OPEN', deadlineAt: null } });
    } else if (task.assignedTo) {
      return res.status(400).json({ error: 'Esta tarea ya está asignada a otro usuario' });
    }

    // Elite gate: difficulty 9-10 requires ELITE_DORADO or Golden Ticket
    const eliteCheck = await canAssumeTask(req.user.id, id);
    if (!eliteCheck.allowed) {
      return res.status(403).json({
        error: eliteCheck.reason,
        code: eliteCheck.phase === 'GENESIS' ? 'GENESIS_BLOCKED' : 'ELITE_REQUIRED',
        phase: eliteCheck.phase,
        specialistCount: eliteCheck.specialistCount,
        hashtag: eliteCheck.hashtag,
      });
    }

    // If allowed via Golden Ticket, consume one ticket
    if (eliteCheck.tier === 'GOLDEN_TICKET') {
      const taskWithTags = await (prisma as any).task.findUnique({
        where: { id },
        include: { tags: true, branch: { select: { treeId: true } } },
      });
      const treeId = taskWithTags?.branch?.treeId;
      const tagSkills = (taskWithTags?.tags || []).map((t: any) => t.skillName);
      if (treeId && tagSkills.length > 0) {
        const ticket = await useGoldenTicket(req.user.id, treeId, id, tagSkills);
        if (ticket.used) {
          console.log(`[assignTask] Golden Ticket used for ${ticket.skill}, ${ticket.remaining} remaining`);
        }
      }
    }

    // Calculate deadline: 1.3x requiredHours (default 24h if not set)
    const hours = (task.requiredHours || 24) * 1.3;
    const deadlineAt = new Date(Date.now() + hours * 60 * 60 * 1000);

    // Optional start photo ("before" evidence)
    const { startPhotoUrl } = req.body || {};

    const updated = await (prisma as any).task.update({
      where: { id },
      data: {
        assignedTo: req.user.id,
        status: 'IN_PROGRESS',
        deadlineAt,
        ...(startPhotoUrl ? { startPhotoUrl } : {}),
      }
    });
    const treeId = await resolveBranchTreeId(task.branchId);
    void logEvent({
      ...getRequestContext(req),
      treeId,
      action: 'TASK_ASSIGNED',
      entityType: 'Task',
      entityId: id,
      beforeJson: { assignedTo: task.assignedTo, status: task.status },
      afterJson: { assignedTo: updated.assignedTo, status: updated.status, deadlineAt: updated.deadlineAt },
      metadataJson: getRequestMetadata(req, { hasStartEvidence: Boolean(startPhotoUrl), result: 'success' }),
      source: 'USER',
    });

    if (startPhotoUrl) {
      void logEvent({
        ...getRequestContext(req),
        treeId,
        action: 'TASK_EVIDENCE_UPLOADED',
        entityType: 'Task',
        entityId: id,
        metadataJson: getRequestMetadata(req, { evidenceKinds: { startPhotoUrl: true } }),
        source: 'USER',
      });
    }
    res.json(updated);
  } catch (error) {
    console.error('[assignTask] error:', error);
    res.status(500).json({ error: 'Error' });
  }
};

// Check if a user can assume a specific task (elite gate pre-check)
export const checkEliteForTask = async (req: any, res: Response) => {
  try {
    const result = await canAssumeTask(req.user.id, req.params.id);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: 'Error' });
  }
};

export const approveTaskEvidence = async (req: any, res: Response) => {
  try {
    const updated = await prisma.task.update({ where: { id: req.params.id }, data: { status: 'COMPLETED' } });
    const treeId = await resolveBranchTreeId(updated.branchId);
    void logEvent({
      ...getRequestContext(req),
      treeId,
      action: 'TASK_COMPLETED',
      entityType: 'Task',
      entityId: req.params.id,
      afterJson: { status: updated.status },
      metadataJson: getRequestMetadata(req, { via: 'approve_evidence', result: 'success' }),
      source: 'USER',
    });
    res.json(updated);
  } catch (error) {
    res.status(500).json({ error: 'Error' });
  }
};

export const toggleDifficultyVoteLike = async (req: any, res: Response) => {
  try {
    const { voteId } = req.params;
    const userId = req.user.id;
    const existing = await (prisma as any).difficultyVoteLike.findUnique({ where: { userId_voteId: { userId, voteId } } });
    if (existing) {
      await (prisma as any).difficultyVoteLike.delete({ where: { id: existing.id } });
      res.json({ liked: false });
    } else {
      await (prisma as any).difficultyVoteLike.create({ data: { userId, voteId } });
      res.json({ liked: true });
    }
  } catch (error) {
    res.status(500).json({ error: 'Error' });
  }
};

export const submitAudit = async (req: any, res: Response) => {
  try {
    const { id } = req.params; // taskId
    const { notaSugerida } = req.body;
    const userId = req.user.id;

    if (!notaSugerida || notaSugerida < 1 || notaSugerida > 10) {
      return res.status(400).json({ error: 'Nota sugerida debe estar entre 1 y 10' });
    }

    const task = await prisma.task.findUnique({
      where: { id },
      include: { 
        branch: { 
          include: { 
            tree: true,
            idea: { include: { need: { include: { treeLinks: true } } } }
          } 
        },
        auditorias: true
      }
    }) as any;

    if (!task) return res.status(404).json({ error: 'Task not found' });
    if (task.status !== 'COMPLETED') return res.status(400).json({ error: 'Only completed tasks can be audited' });
    if (task.assignedTo === userId) return res.status(400).json({ error: 'Authors cannot audit their own tasks' });
    if (task.auditada) return res.status(400).json({ error: 'This task has already been audited and closed' });

    // 1. Check Permissions
    const treeId = await resolveBranchTreeId(task.branchId);
    if (!treeId) return res.status(500).json({ error: 'Could not resolve tree for task' });

    const membership = await prisma.treeMember.findUnique({
      where: { userId_treeId: { userId, treeId } }
    });

    const isTreeCreator = task.branch.tree?.creatorId === userId || 
                         task.branch.idea?.need.treeLinks.some((tl: any) => tl.treeId === treeId && tl.tree?.creatorId === userId);
    
    if (!isTreeCreator && (!membership || membership.level < 3)) {
      return res.status(403).json({ error: 'Solo miembros Nivel 3+ o el Creador pueden auditar' });
    }

    // 2. Register Audit
    await (prisma as any).auditoria.create({
      data: {
        taskId: id,
        usuarioId: userId,
        notaSugerida
      }
    });

    void logEvent({
      ...getRequestContext(req),
      treeId,
      action: 'AUDIT_SUBMITTED',
      entityType: 'Task',
      entityId: id,
      metadataJson: getRequestMetadata(req, { notaSugerida, result: 'success' }),
      source: 'USER',
    });

    // 3. Check for Consensus Trigger
    const auditoresCount = task.auditorias.length + 1;
    const level3Count = await prisma.treeMember.count({
      where: { treeId, level: { gte: 3 } }
    });

    const triggerCount = 5;
    const triggerPercent = Math.max(1, Math.ceil(level3Count * 0.33));

    if (auditoresCount >= triggerCount || auditoresCount >= triggerPercent) {
      await finalizeAuditConsensus(id, treeId);
      return res.json({ message: 'Audit submitted and consensus reached!', closed: true });
    }

    res.json({ message: 'Audit submitted successfully', closed: false });
  } catch (error) {
    console.error('[submitAudit] error:', error);
    res.status(500).json({ error: 'Failed to submit audit' });
  }
};

const finalizeAuditConsensus = async (taskId: string, treeId: string) => {
  const task = await (prisma.task.findUnique({
    where: { id: taskId },
    include: { 
      auditorias: true,
      branch: { select: { xpPool: true } },
      tags: true
    }
  }) as any);

  if (!task || !task.assignedTo || !task.difficulty) return;

  const audits = task.auditorias;
  if (!audits || audits.length === 0) return;

  // 1. Calculate Average Auditor Note
  const avgAuditorNote = audits.reduce((sum: number, a: any) => sum + a.notaSugerida, 0) / audits.length;

  // 2. Find closest actual auditor note
  const closestNote = audits.reduce((prev: any, curr: any) => {
    return Math.abs(curr.notaSugerida - avgAuditorNote) < Math.abs(prev.notaSugerida - avgAuditorNote) ? curr : prev;
  }).notaSugerida;

  const newOfficialDifficulty = closestNote;

  // 3. Calculate XP Adjustment
  const oldXpAllocated = calculateXpFromDifficulty(task.branch.xpPool, task.difficulty);
  const newXpAllocated = calculateXpFromDifficulty(task.branch.xpPool, newOfficialDifficulty);

  const xpDiff = Math.floor(newXpAllocated) - Math.floor(oldXpAllocated);

  // 4. Update Task
  await prisma.task.update({
    where: { id: taskId },
    data: { 
      difficulty: newOfficialDifficulty,
      auditada: true
    }
  });

  void logEvent({
    treeId,
    actorId: null,
    action: 'AUDIT_RESOLVED',
    entityType: 'Task',
    entityId: taskId,
    beforeJson: { difficulty: task.difficulty, auditada: task.auditada },
    afterJson: { difficulty: newOfficialDifficulty, auditada: true },
    metadataJson: { avgAuditorNote, auditsCount: audits.length },
    source: 'SYSTEM',
  });

  // Fiat containment: XP allocation is reputation, not a fiat ledger expense.
  void logEvent({
    treeId,
    actorId: task.assignedTo,
    action: 'FIAT_REPUTATION_EFFECT_BLOCKED',
    entityType: 'Task',
    entityId: taskId,
    metadataJson: {
      reason: 'approved_task_xp_is_not_fiat_expense',
      rule: 'xp_comes_from_verified_task_difficulty_and_audit_not_money',
      newXpAllocated,
    },
    severity: 'INFO',
    source: 'SYSTEM',
  });

  // 5. Update Author balance and level
  if (xpDiff !== 0) {
    const authorMembership = await prisma.treeMember.findUnique({
      where: { userId_treeId: { userId: task.assignedTo, treeId } }
    });

    if (authorMembership) {
      const oldLevel = authorMembership.level;
      const newXp = Math.max(0, (authorMembership.xp || 0) + xpDiff);
      const newLevel = Math.max(1, Math.floor(newXp / 50) + 1);

      await prisma.treeMember.update({
        where: { id: authorMembership.id },
        data: { xp: newXp, level: newLevel }
      });

      if (newLevel !== oldLevel) {
        await redistributeTreeBudget(treeId);
      }
    }
  }

  // 7. Evaluate Golden Ticket streak for the task author
  const taskTagSkills = (task.tags || []).map((t: any) => t.skillName);
  if (taskTagSkills.length > 0) {
    await evaluateGoldenStreak(
      task.assignedTo,
      treeId,
      taskId,
      newOfficialDifficulty,
      avgAuditorNote,
      taskTagSkills
    );

    // 7b. Accumulate Skill XP: add difficulty points for each skill tag
    const diffPoints = Math.round(newOfficialDifficulty);
    for (const skillTag of taskTagSkills) {
      await (prisma as any).userSkillXP.upsert({
        where: { userId_skillTag_treeId: { userId: task.assignedTo, skillTag, treeId } },
        create: { userId: task.assignedTo, skillTag, treeId, accumulatedPoints: diffPoints, completedTasks: 1 },
        update: { accumulatedPoints: { increment: diffPoints }, completedTasks: { increment: 1 } },
      });
    }
  }

  // 8. Slashing: if audit average < 5, check if author has EN_PRUEBA proposals → penalize
  if (avgAuditorNote < 5 && taskTagSkills.length > 0) {
    try {
      const failedProposals = await (prisma as any).skillProposal.findMany({
        where: {
          userId: task.assignedTo,
          treeId,
          status: 'EN_PRUEBA',
          hashtag: { in: taskTagSkills },
        },
        include: { endorsements: true },
      });

      for (const proposal of failedProposals) {
        // Increment tasksFailed
        await (prisma as any).skillProposal.update({
          where: { id: proposal.id },
          data: { tasksFailed: proposal.tasksFailed + 1 },
        });

        // If proposal has endorsements, slash one random endorser
        if (proposal.endorsements.length > 0) {
          const randomIdx = Math.floor(Math.random() * proposal.endorsements.length);
          const slashedEndorsement = proposal.endorsements[randomIdx];

          // Delete the endorsement
          await (prisma as any).skillEndorsement.delete({
            where: { id: slashedEndorsement.id },
          });

          // Penalize the endorser: 6-month ban + lose mentorship bonus
          const banUntil = new Date();
          banUntil.setMonth(banUntil.getMonth() + 6);
          const endorserMembership = await (prisma as any).treeMember.findUnique({
            where: { userId_treeId: { userId: slashedEndorsement.endorserId, treeId } },
          });
          if (endorserMembership) {
            await (prisma as any).treeMember.update({
              where: { id: endorserMembership.id },
              data: { avalBanHasta: banUntil, bonoMentoriaActivo: false, bonoMentoriaExpira: null },
            });
          }

          // Notify endorser of slashing
          const { createNotification: notify } = await import('./notificationController');
          await notify({
            userId: slashedEndorsement.endorserId, type: 'SYSTEM', category: 'MERITO',
            title: 'Penalización por apadrinamiento fallido',
            body: `Un candidato que avalaste en ${proposal.hashtag} falló una tarea de prueba. Tu derecho a avalar ha sido suspendido por 6 meses y tu bono de mentoría ha sido revocado.`,
            entityType: 'TREE', entityAction: 'UPDATE', entityId: treeId,
          });

          // Revert proposal to PENDIENTE_AVALES (needs to regain the lost endorsement)
          const remainingEndorsements = proposal.endorsements.length - 1;
          if (remainingEndorsements < 3) {
            await (prisma as any).skillProposal.update({
              where: { id: proposal.id },
              data: { status: 'PENDIENTE_AVALES' },
            });

            // Notify candidate
            await notify({
              userId: proposal.userId, type: 'SYSTEM', category: 'ARBOL',
              title: 'Aval perdido — Prueba congelada',
              body: `Has fallado una tarea de prueba en ${proposal.hashtag}. Perdiste 1 aval y tu progreso queda congelado hasta conseguir un nuevo aval (${remainingEndorsements}/3).`,
              entityType: 'TREE', entityAction: 'UPDATE', entityId: treeId,
            });
          }

          console.log(`[Slashing] Endorser ${slashedEndorsement.endorserId} banned until ${banUntil.toISOString()} for failed trial in ${proposal.hashtag}`);
        }
      }
    } catch (slashErr) {
      console.error('[finalizeAuditConsensus] slashing error:', slashErr);
    }
  }
};

// ─── CIVIC AUDIT (random 20% audit on task completion) ──────────────

export const submitCivicAudit = async (req: any, res: Response) => {
  try {
    const userId = req.user.id;
    const { auditedTaskId, difficultyVote } = req.body;

    if (!auditedTaskId || !difficultyVote || difficultyVote < 1 || difficultyVote > 10) {
      return res.status(400).json({ error: 'auditedTaskId y difficultyVote (1-10) son requeridos' });
    }

    const auditedTask = await prisma.task.findUnique({
      where: { id: auditedTaskId },
      include: { branch: { select: { treeId: true, xpPool: true } } },
    });

    if (!auditedTask) return res.status(404).json({ error: 'Tarea auditada no encontrada' });
    if (auditedTask.assignedTo === userId || auditedTask.creatorId === userId) {
      return res.status(403).json({ error: 'No puedes auditar tu propia tarea' });
    }

    // Register difficulty vote on the audited task
    await (prisma as any).difficultyVote.upsert({
      where: { user_task_unique: { userId, taskId: auditedTaskId } },
      update: { value: difficultyVote, comment: 'Auditoría cívica', status: 'valido' },
      create: { userId, taskId: auditedTaskId, value: difficultyVote, comment: 'Auditoría cívica', status: 'valido' },
    });

    // Recalculate consensus difficulty
    const newDifficulty = await calculateConsensusDifficulty(auditedTaskId);
    await prisma.task.update({
      where: { id: auditedTaskId },
      data: { difficulty: newDifficulty },
    });

    // Award civic bonus XP (+2) to auditor in the audited task's tree
    const treeId = auditedTask.branch?.treeId;
    if (treeId) {
      const member = await prisma.treeMember.findUnique({
        where: { userId_treeId: { userId, treeId } },
      });
      if (member) {
        let civicXp = CIVIC_BONUS_XP;
        try {
          const { getEndorsementBoostStatus } = await import('../services/expertEndorsementService');
          const boost = await getEndorsementBoostStatus(userId, treeId);
          if (boost.boostPct > 0) civicXp = Math.floor(civicXp * (1 + boost.boostPct / 100));
        } catch { /* best-effort */ }
        const newXp = Math.max(0, (member.xp || 0) + civicXp);
        const newLevel = Math.max(1, Math.floor(newXp / 50) + 1);
        await prisma.treeMember.update({
          where: { id: member.id },
          data: { xp: newXp, level: newLevel },
        });
      }
    }

    console.log(`[CivicAudit] User ${userId} audited task ${auditedTaskId} with vote ${difficultyVote}, +${CIVIC_BONUS_XP} XP cívico`);
    res.json({ success: true, civicBonusXp: CIVIC_BONUS_XP });
  } catch (error) {
    console.error('[submitCivicAudit] error:', error);
    res.status(500).json({ error: 'Error al procesar auditoría cívica' });
  }
};
