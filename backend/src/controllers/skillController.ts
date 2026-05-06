import { Response } from 'express';
import { prisma } from '../index';
import { createNotification } from './notificationController';
import { getHashtagPhase, getRequiredEndorsements } from '../utils/genesisPhase';
import { getRequestContext, getRequestMetadata, logEvent } from '../services/eventLogService';

// ═══════════════════════════════════════════════════════════════════════════════
// POST /skills/propose — Propose a new skill within a tree
// Body: { treeId, hashtag }
// Genesis: direct EN_PRUEBA | Maturity: PENDIENTE_AVALES (needs 3 endorsements)
// ═══════════════════════════════════════════════════════════════════════════════
export const proposeSkill = async (req: any, res: Response) => {
  try {
    const userId = req.user.id;
    const { treeId, hashtag } = req.body;

    if (!treeId || !hashtag) {
      return res.status(400).json({ error: 'treeId y hashtag son requeridos' });
    }

    const normalizedHashtag = hashtag.startsWith('#') ? hashtag : `#${hashtag}`;

    // Verify membership
    const membership = await (prisma as any).treeMember.findUnique({
      where: { userId_treeId: { userId, treeId } },
    });
    if (!membership) return res.status(403).json({ error: 'No eres miembro de este Árbol' });

    // Check if already has the skill
    const existingSkills: string[] = JSON.parse(membership.skills || '[]');
    if (existingSkills.some((s: string) => s.toLowerCase() === normalizedHashtag.toLowerCase())) {
      return res.status(400).json({ error: 'Ya posees esta habilidad en este Árbol' });
    }

    // Check for existing proposal
    const existing = await (prisma as any).skillProposal.findUnique({
      where: { userId_treeId_hashtag: { userId, treeId, hashtag: normalizedHashtag } },
    });
    if (existing && (existing.status === 'PENDIENTE_AVALES' || existing.status === 'EN_PRUEBA')) {
      return res.status(409).json({ error: 'Ya tienes una propuesta activa para esta habilidad', proposal: existing });
    }

    // Determine phase
    const phaseInfo = await getHashtagPhase(treeId, normalizedHashtag);
    const requiredEndorsements = getRequiredEndorsements(phaseInfo.phase);

    // Genesis: skip endorsements → direct EN_PRUEBA
    // Maturity: needs 3 endorsements → PENDIENTE_AVALES
    const status = requiredEndorsements === 0 ? 'EN_PRUEBA' : 'PENDIENTE_AVALES';

    const proposal = await (prisma as any).skillProposal.upsert({
      where: { userId_treeId_hashtag: { userId, treeId, hashtag: normalizedHashtag } },
      update: { status, tasksCompleted: 0, tasksFailed: 0 },
      create: { userId, treeId, hashtag: normalizedHashtag, status },
    });

    if (status === 'EN_PRUEBA') {
      await createNotification({
        userId, type: 'SKILL_UNLOCK', category: 'ARBOL',
        title: 'Fase Génesis — Prueba Iniciada',
        body: `Completa 7 tareas de dificultad 1-3 con ${normalizedHashtag} para convertirte en Especialista.`,
        entityType: 'TREE', entityAction: 'UPDATE', entityId: treeId,
      });
    }

    res.status(201).json({ proposal, phase: phaseInfo });

    void logEvent({
      ...getRequestContext(req),
      treeId,
      actorId: userId,
      action: 'SKILL_PROPOSED',
      entityType: 'SkillProposal',
      entityId: proposal.id,
      metadataJson: getRequestMetadata(req, { hashtag: normalizedHashtag, status }),
      source: 'USER',
    });
  } catch (error) {
    console.error('[proposeSkill] error:', error);
    res.status(500).json({ error: 'Error al proponer habilidad' });
  }
};

// ═══════════════════════════════════════════════════════════════════════════════
// POST /skills/endorse — Endorse a peer's skill proposal (Maturity Phase)
// Body: { proposalId }
// ═══════════════════════════════════════════════════════════════════════════════
export const endorseSkillProposal = async (req: any, res: Response) => {
  try {
    const endorserId = req.user.id;
    const { proposalId } = req.body;

    if (!proposalId) return res.status(400).json({ error: 'proposalId es requerido' });

    const proposal = await (prisma as any).skillProposal.findUnique({
      where: { id: proposalId },
      include: { endorsements: true },
    });
    if (!proposal) return res.status(404).json({ error: 'Propuesta no encontrada' });
    if (proposal.status !== 'PENDIENTE_AVALES') {
      return res.status(400).json({ error: 'Esta propuesta ya no requiere avales' });
    }
    if (proposal.userId === endorserId) {
      return res.status(400).json({ error: 'No puedes avalar tu propia propuesta' });
    }

    // Verify endorser is ESPECIALISTA in this skill in this tree
    const endorserMembership = await (prisma as any).treeMember.findUnique({
      where: { userId_treeId: { userId: endorserId, treeId: proposal.treeId } },
    });
    if (!endorserMembership) return res.status(403).json({ error: 'No eres miembro de este Árbol' });

    // Check endorser ban (slashing cooldown)
    if (endorserMembership.avalBanHasta && new Date(endorserMembership.avalBanHasta) > new Date()) {
      const banDate = new Date(endorserMembership.avalBanHasta).toLocaleDateString('es-ES');
      return res.status(403).json({
        error: `Tu derecho a avalar está suspendido hasta ${banDate} por apadrinamiento fallido.`,
        code: 'ENDORSEMENT_BANNED',
        avalBanHasta: endorserMembership.avalBanHasta,
      });
    }

    const endorserSkills: string[] = JSON.parse(endorserMembership.skills || '[]');
    if (!endorserSkills.some((s: string) => s.toLowerCase() === proposal.hashtag.toLowerCase())) {
      return res.status(403).json({ error: 'Debes ser Especialista en esta habilidad para avalar' });
    }

    // Check for duplicate endorsement
    const existingEndorsement = proposal.endorsements.find((e: any) => e.endorserId === endorserId);
    if (existingEndorsement) {
      return res.status(400).json({ error: 'Ya has avalado esta propuesta' });
    }

    // Create endorsement
    await (prisma as any).skillEndorsement.create({
      data: { proposalId, endorserId },
    });

    // Activate mentorship bonus: +5% XP for 3 months
    const bonoExpira = new Date();
    bonoExpira.setMonth(bonoExpira.getMonth() + 3);
    await (prisma as any).treeMember.update({
      where: { id: endorserMembership.id },
      data: { bonoMentoriaActivo: true, bonoMentoriaExpira: bonoExpira },
    });

    const newCount = proposal.endorsements.length + 1;

    // Check if 3 endorsements reached → promote to EN_PRUEBA
    if (newCount >= 3) {
      await (prisma as any).skillProposal.update({
        where: { id: proposalId },
        data: { status: 'EN_PRUEBA' },
      });

      await createNotification({
        userId: proposal.userId, type: 'SKILL_UNLOCK', category: 'ARBOL',
        title: '¡Avales completados!',
        body: `3 especialistas han avalado tu candidatura en ${proposal.hashtag}. Completa 7 tareas de dificultad 1-3 para ser Especialista.`,
        entityType: 'TREE', entityAction: 'UPDATE', entityId: proposal.treeId,
      });
    }

    res.json({ endorsementCount: newCount, promoted: newCount >= 3 });

    void logEvent({
      ...getRequestContext(req),
      treeId: proposal.treeId,
      actorId: endorserId,
      action: newCount >= 3 ? 'SKILL_ENDORSEMENT_PROMOTED' : 'SKILL_ENDORSED',
      entityType: 'SkillProposal',
      entityId: proposalId,
      metadataJson: getRequestMetadata(req, {
        endorserId,
        candidateId: proposal.userId,
        hashtag: proposal.hashtag,
        endorsementCount: newCount,
        promoted: newCount >= 3,
      }),
      source: 'USER',
    });
  } catch (error) {
    console.error('[endorseSkillProposal] error:', error);
    res.status(500).json({ error: 'Error al avalar' });
  }
};

// ═══════════════════════════════════════════════════════════════════════════════
// POST /skills/record-trial — Record a trial task completion for a skill proposal
// Body: { proposalId, taskId, passed }
// Called when a user completes a task tagged with their EN_PRUEBA skill
// ═══════════════════════════════════════════════════════════════════════════════
export const recordTrialTask = async (req: any, res: Response) => {
  try {
    const { proposalId, taskId, passed } = req.body;

    const proposal = await (prisma as any).skillProposal.findUnique({ where: { id: proposalId } });
    if (!proposal) return res.status(404).json({ error: 'Propuesta no encontrada' });
    if (proposal.status !== 'EN_PRUEBA') {
      return res.status(400).json({ error: 'La propuesta no está en fase de prueba' });
    }

    // Verify task exists and is completed by the proposal user
    const task = await (prisma as any).task.findUnique({
      where: { id: taskId },
      include: { tags: true, branch: { select: { treeId: true } } },
    });
    if (!task || task.assignedTo !== proposal.userId) {
      return res.status(400).json({ error: 'Tarea no válida' });
    }
    if (task.status !== 'COMPLETED') {
      return res.status(400).json({ error: 'Tarea no completada' });
    }

    // Verify task is in the right tree and has the right tag
    if (task.branch.treeId !== proposal.treeId) {
      return res.status(400).json({ error: 'Tarea no pertenece al Árbol correcto' });
    }
    const hasTag = task.tags.some((t: any) => t.skillName.toLowerCase() === proposal.hashtag.toLowerCase());
    if (!hasTag) {
      return res.status(400).json({ error: 'Tarea no tiene el hashtag correcto' });
    }

    if (passed) {
      proposal.tasksCompleted += 1;
    } else {
      proposal.tasksFailed += 1;
    }

    // Check if trial completed (7 tasks)
    if (proposal.tasksCompleted >= 7) {
      // PASSED — grant skill
      await (prisma as any).skillProposal.update({
        where: { id: proposalId },
        data: { tasksCompleted: proposal.tasksCompleted, tasksFailed: proposal.tasksFailed, status: 'APROBADO' },
      });

      // Add skill to member
      const membership = await (prisma as any).treeMember.findUnique({
        where: { userId_treeId: { userId: proposal.userId, treeId: proposal.treeId } },
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

      await createNotification({
        userId: proposal.userId, type: 'SKILL_UNLOCK', category: 'MERITO',
        title: '¡Nueva Especialidad Certificada!',
        body: `Has completado la prueba y ahora eres Especialista en ${proposal.hashtag}.`,
        entityType: 'TREE', entityAction: 'UPDATE', entityId: proposal.treeId,
      });

      return res.json({ status: 'APROBADO', tasksCompleted: proposal.tasksCompleted });
    }

    void logEvent({
      ...getRequestContext(req),
      treeId: proposal.treeId,
      actorId: req.user!.id,
      action: proposal.tasksCompleted >= 7 ? 'SKILL_TRIAL_PASSED' : 'SKILL_TRIAL_PROGRESS',
      entityType: 'SkillProposal',
      entityId: proposalId,
      metadataJson: getRequestMetadata(req, {
        taskId,
        passed,
        tasksCompleted: proposal.tasksCompleted,
        tasksFailed: proposal.tasksFailed,
        hashtag: proposal.hashtag,
      }),
      source: 'USER',
    });

    // Update progress
    await (prisma as any).skillProposal.update({
      where: { id: proposalId },
      data: { tasksCompleted: proposal.tasksCompleted, tasksFailed: proposal.tasksFailed },
    });

    res.json({ status: 'EN_PRUEBA', tasksCompleted: proposal.tasksCompleted, tasksFailed: proposal.tasksFailed });
  } catch (error) {
    console.error('[recordTrialTask] error:', error);
    res.status(500).json({ error: 'Error al registrar tarea de prueba' });
  }
};

// ═══════════════════════════════════════════════════════════════════════════════
// GET /skills/proposals?treeId=x — Get all proposals for a tree (for endorsing)
// ═══════════════════════════════════════════════════════════════════════════════
export const getProposals = async (req: any, res: Response) => {
  try {
    const { treeId } = req.query;
    if (!treeId) return res.status(400).json({ error: 'treeId requerido' });

    const proposals = await (prisma as any).skillProposal.findMany({
      where: { treeId, status: { in: ['PENDIENTE_AVALES', 'EN_PRUEBA'] } },
      include: {
        user: { select: { id: true, username: true } },
        endorsements: { include: { endorser: { select: { id: true, username: true } } } },
      },
      orderBy: { createdAt: 'desc' },
    });

    res.json(proposals);
  } catch (error) {
    res.status(500).json({ error: 'Error' });
  }
};

// ═══════════════════════════════════════════════════════════════════════════════
// GET /skills/my-proposals — Get current user's proposals
// ═══════════════════════════════════════════════════════════════════════════════
export const getMyProposals = async (req: any, res: Response) => {
  try {
    const proposals = await (prisma as any).skillProposal.findMany({
      where: { userId: req.user.id },
      include: {
        endorsements: { include: { endorser: { select: { id: true, username: true } } } },
      },
      orderBy: { createdAt: 'desc' },
    });
    res.json(proposals);
  } catch (error) {
    res.status(500).json({ error: 'Error' });
  }
};

// ═══════════════════════════════════════════════════════════════════════════════
// GET /skills/phase?treeId=x&hashtag=y — Get genesis/maturity phase info
// ═══════════════════════════════════════════════════════════════════════════════
export const getPhaseInfo = async (req: any, res: Response) => {
  try {
    const { treeId, hashtag } = req.query;
    if (!treeId || !hashtag) return res.status(400).json({ error: 'treeId y hashtag requeridos' });

    const normalizedHashtag = (hashtag as string).startsWith('#') ? hashtag as string : `#${hashtag}`;
    const phaseInfo = await getHashtagPhase(treeId as string, normalizedHashtag);
    res.json(phaseInfo);
  } catch (error) {
    res.status(500).json({ error: 'Error' });
  }
};
