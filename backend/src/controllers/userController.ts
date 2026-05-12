import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import sharp from 'sharp';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { prisma } from '../index';
import { computeSkillTier } from '../utils/eliteCalculator';
import { parseTicketMap } from '../utils/goldenTicketEngine';
import {
  canViewUserPrivacyLevel,
  DEFAULT_PRIVACY_SETTINGS,
  redactTaskEvidenceFields,
  withDefaultPrivacySettings,
} from '../utils/privacy';
import { getRequestContext, getRequestMetadata, logEvent } from '../services/eventLogService';
import { canAccessEvidenceFile, toSafeEvidenceMetadata } from '../utils/fileSecurity';

// ── GET /users/profile ───────────────────────────────────────────────────────
// Returns enriched profile data: global stats, per-tree memberships with skills,
// task completion counts per skill, and active migrations
export const getProfile = async (req: any, res: Response) => {
  try {
    const userId = req.user.id;

    const user = await (prisma as any).user.findUnique({
      where: { id: userId },
      select: {
        id: true, username: true, email: true, role: true, sharingCode: true, is_guest: true,
        is_onboarded: true,
        profilePic: true, publicProfileEnabled: true,
        publicShowLevels: true, publicShowTreeSize: true, publicShowTaskHistory: true,
        visibleForRecruitment: true, seekingWork: true,
        memberships: {
          select: {
            id: true, treeId: true, availableNeedPoints: true, status: true,
            xp: true, level: true, role: true, skills: true, bayasBalance: true, goldenTickets: true,
            bonoMentoriaActivo: true, bonoMentoriaExpira: true, avalBanHasta: true,
            tree: { select: { id: true, name: true, icono: true } },
          },
        },
      },
    });
    if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });

    // Global aggregates
    const totalXp = user.memberships.reduce((s: number, m: any) => s + (m.xp || 0), 0);
    const maxLevel = user.memberships.length > 0
      ? Math.max(...user.memberships.map((m: any) => m.level || 1))
      : 1;

    // Per-tree skill details: count completed tasks per skill tag
    const membershipsEnriched = await Promise.all(
      user.memberships.map(async (m: any) => {
        const skills: string[] = JSON.parse(m.skills || '[]');
        const ticketMap = parseTicketMap(m.goldenTickets);

        // Count completed tasks per skill in this tree
        const skillDetails = await Promise.all(
          skills.map(async (skill: string) => {
            const result = await computeSkillTier(userId, skill, m.treeId);
            const ticketData = ticketMap[skill];
            return {
              name: skill,
              completedTasks: result.completedTasks,
              accumulatedPoints: result.accumulatedPoints,
              tier: result.tier,
              phase: result.phase,
              totalSpecialists: result.totalSpecialists,
              goldenTickets: ticketData?.tickets || 0,
              streakProgress: ticketData?.streakTaskIds?.length || 0,
            };
          })
        );

        // Skill proposals for this tree (EN_PRUEBA or PENDIENTE_AVALES)
        const proposals = await (prisma as any).skillProposal.findMany({
          where: { userId, treeId: m.treeId, status: { in: ['PENDIENTE_AVALES', 'EN_PRUEBA'] } },
          include: { endorsements: { select: { id: true, endorserId: true } } },
        });

        // Check if mentorship bonus is still active (auto-expire)
        let mentoriaActivo = m.bonoMentoriaActivo;
        let mentoriaExpira = m.bonoMentoriaExpira;
        if (mentoriaActivo && mentoriaExpira && new Date(mentoriaExpira) <= new Date()) {
          mentoriaActivo = false;
          mentoriaExpira = null;
          await (prisma as any).treeMember.update({
            where: { id: m.id },
            data: { bonoMentoriaActivo: false, bonoMentoriaExpira: null },
          });
        }

        // Check if aval ban has expired
        let avalBan = m.avalBanHasta;
        if (avalBan && new Date(avalBan) <= new Date()) {
          avalBan = null;
          await (prisma as any).treeMember.update({
            where: { id: m.id },
            data: { avalBanHasta: null },
          });
        }

        return {
          treeId: m.treeId,
          treeName: m.tree?.name || 'Árbol',
          treeIcon: m.tree?.icono || '🌳',
          xp: m.xp,
          level: m.level,
          role: m.role,
          bayasBalance: m.bayasBalance,
          skills: skillDetails,
          mentorship: {
            bonoActivo: mentoriaActivo,
            bonoExpira: mentoriaExpira,
            avalBanHasta: avalBan,
          },
          skillProposals: proposals.map((p: any) => ({
            id: p.id,
            hashtag: p.hashtag,
            status: p.status,
            tasksCompleted: p.tasksCompleted,
            tasksFailed: p.tasksFailed,
            endorsementCount: p.endorsements?.length || 0,
          })),
        };
      })
    );

    // Active migrations
    const migrations = await (prisma as any).skillMigration.findMany({
      where: { userId },
      include: {
        sourceTree: { select: { id: true, name: true, icono: true } },
        targetTree: { select: { id: true, name: true, icono: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    res.json({
      id: user.id,
      username: user.username,
      email: user.email,
      role: user.role,
      sharingCode: user.sharingCode,
      profilePic: user.profilePic,
      publicProfileEnabled: user.publicProfileEnabled,
      publicShowLevels: user.publicShowLevels,
      publicShowTreeSize: user.publicShowTreeSize,
      publicShowTaskHistory: user.publicShowTaskHistory,
      totalXp,
      globalLevel: maxLevel,
      memberships: membershipsEnriched,
      migrations,
    });
  } catch (e: any) {
    console.error('[getProfile]', e);
    res.status(500).json({ error: e.message });
  }
};

export const getAllUsers = async (req: Request, res: Response) => {
  try {
    const users = await prisma.user.findMany({
      select: { id: true, username: true, email: true, role: true, sharingCode: true }
    });
    res.json(users);
  } catch (error) {
    res.status(500).json({ error: 'Failed' });
  }
};

export const createUser = async (req: Request, res: Response) => {
  try {
    const { username, email, password, role } = req.body;
    const hashedPassword = await bcrypt.hash(password, 10);
    const user = await prisma.user.create({
      data: { username, email, password: hashedPassword, role: role || 'PERSON' },
      select: { id: true, username: true, email: true, role: true }
    });
    res.status(201).json(user);
  } catch (error) {
    res.status(500).json({ error: 'Failed' });
  }
};

export const updateUser = async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const { username, email, role } = req.body;
    const user = await prisma.user.update({
      where: { id },
      data: { username, email, role },
      select: { id: true, username: true, email: true, role: true }
    });
    res.json(user);
  } catch (error) {
    res.status(500).json({ error: 'Failed' });
  }
};

export const deleteUser = async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    await prisma.user.delete({ where: { id } });
    res.json({ message: 'User deleted' });
  } catch (error) {
    res.status(500).json({ error: 'Failed' });
  }
};

export const getContacts = async (req: any, res: Response) => {
  try {
    const contacts = await prisma.userContact.findMany({
      where: { userId: req.user.id },
      include: { contact: { select: { id: true, username: true } } }
    });
    res.json(contacts.map(c => c.contact));
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch contacts' });
  }
};

export const searchUsers = async (req: any, res: Response) => {
  try {
    const { query } = req.query;
    const users = await prisma.user.findMany({
      where: {
        username: { contains: query as string },
        id: { not: req.user.id }
      },
      select: { id: true, username: true, email: true }
    });
    res.json(users);
  } catch (error) {
    res.status(500).json({ error: 'Failed to search users' });
  }
};

export const addContact = async (req: any, res: Response) => {
  try {
    const { contactId } = req.body;
    await prisma.userContact.upsert({
      where: { userId_contactId: { userId: req.user.id, contactId } },
      update: {},
      create: { userId: req.user.id, contactId }
    });
    res.json({ message: 'Contact added' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to add contact' });
  }
};

// ═══════════════════════════════════════════════════════════════════════════════
// Shared helper: build star data for any userId (used by skill-star + public profile)
// ═══════════════════════════════════════════════════════════════════════════════
async function buildSkillStarData(userId: string) {
  const oneYearAgo = new Date();
  oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);

  const tasks = await (prisma as any).task.findMany({
    where: {
      assignedTo: userId,
      auditada: true,
      completedAt: { gte: oneYearAgo },
    },
    select: {
      id: true,
      name: true,
      difficulty: true,
      completedAt: true,
      tags: { select: { skillName: true } },
      branch: { select: { treeId: true } },
    },
    orderBy: { completedAt: 'desc' },
  });

  const skillMap: Record<string, {
    points: number;
    taskCount: number;
    recentTasks: { name: string; difficulty: number; completedAt: string }[];
  }> = {};

  for (const task of tasks) {
    for (const tag of task.tags) {
      const key = tag.skillName;
      if (!skillMap[key]) {
        skillMap[key] = { points: 0, taskCount: 0, recentTasks: [] };
      }
      skillMap[key].points += Math.round(task.difficulty || 1);
      skillMap[key].taskCount += 1;
      if (skillMap[key].recentTasks.length < 3) {
        skillMap[key].recentTasks.push({
          name: task.name,
          difficulty: Math.round(task.difficulty || 1),
          completedAt: task.completedAt?.toISOString() || '',
        });
      }
    }
  }

  const sorted = Object.entries(skillMap)
    .sort(([, a], [, b]) => b.points - a.points)
    .slice(0, 6);

  const maxPoints = sorted.length > 0 ? sorted[0][1].points : 1;

  const star = await Promise.all(sorted.map(async ([skillName, data]) => {
    const xpRecord = await (prisma as any).userSkillXP.findFirst({
      where: { userId, skillTag: skillName },
      select: { cachedPercentile: true },
    });
    const percentile = xpRecord?.cachedPercentile ?? 0;
    const tier = data.taskCount < 7
      ? 'INTERNO'
      : (percentile >= 80 ? 'ELITE_DORADO' : 'ESPECIALISTA');
    const level = Math.max(1, Math.round((data.points / maxPoints) * 10));

    return {
      skill: skillName,
      points: data.points,
      tasks: data.taskCount,
      level,
      percentile,
      tier,
      recentTasks: data.recentTasks,
    };
  }));

  while (star.length < 6) {
    star.push({ skill: 'En desarrollo', points: 0, tasks: 0, level: 0, percentile: 0, tier: 'INTERNO', recentTasks: [] });
  }

  const eliteCount = star.filter(s => s.tier === 'ELITE_DORADO').length;
  const goldenAura = eliteCount >= 3;

  const realSkills = star.filter(s => s.points > 0);
  let pretext = '';
  if (realSkills.length === 0) {
    pretext = 'Completa tareas con habilidades @ para construir tu Estrella de Ejecución.';
  } else if (goldenAura) {
    pretext = `Dominas ${eliteCount} habilidades a nivel Élite. Eres un referente multidisciplinario. ✨`;
  } else if (realSkills.length === 1) {
    pretext = `Eres un especialista puro en @${realSkills[0].skill}.`;
  } else if (realSkills.length <= 3) {
    const names = realSkills.map(s => `@${s.skill}`).join(' y ');
    pretext = `Tu perfil se concentra en ${names}. Diversifica para cubrir más ejes.`;
  } else {
    const topTwo = realSkills.slice(0, 2).map(s => `@${s.skill}`).join(' y ');
    pretext = `Tienes un perfil equilibrado. Destacas en ${topTwo}.`;
  }

  return { star, goldenAura, pretext };
}

// ═══════════════════════════════════════════════════════════════════════════════
// GET /users/skill-star — Top 6 skills (last year) + last 3 tasks per skill + pretext
// ═══════════════════════════════════════════════════════════════════════════════
export const getSkillStar = async (req: any, res: Response) => {
  try {
    const result = await buildSkillStarData(req.user.id);
    res.json(result);
  } catch (error: any) {
    console.error('[getSkillStar]', error);
    res.status(500).json({ error: 'Error al obtener estrella de habilidades' });
  }
};

// ═══════════════════════════════════════════════════════════════════════════════
// POST /users/profile-pic — Upload profile photo
// ═══════════════════════════════════════════════════════════════════════════════
const UPLOADS_DIR = path.join(__dirname, '../../uploads');
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });

export const uploadProfilePic = async (req: any, res: Response) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No se recibió imagen' });

    const fileId = crypto.randomUUID();
    const filename = `profile_${fileId}.webp`;
    const outputPath = path.join(UPLOADS_DIR, filename);

    await sharp(req.file.buffer)
      .rotate() // auto-rotate based on EXIF orientation
      .resize(400, 400, { fit: 'cover' })
      .webp({ quality: 80 })
      .toFile(outputPath);

    const url = `/api/profile-pics/${filename}`;
    await (prisma as any).user.update({
      where: { id: req.user.id },
      data: { profilePic: url },
    });

    void logEvent({
      ...getRequestContext(req),
      actorId: req.user.id,
      action: 'USER_PROFILE_UPDATED',
      entityType: 'User',
      entityId: req.user.id,
      afterJson: { profilePic: url },
      metadataJson: getRequestMetadata(req, { changedFields: ['profilePic'], result: 'success' }),
      source: 'USER',
    });

    res.json({ url });
  } catch (error: any) {
    console.error('[uploadProfilePic]', error);
    res.status(500).json({ error: 'Error al procesar la imagen' });
  }
};

// ═══════════════════════════════════════════════════════════════════════════════
// PUT /users/public-profile — Update public profile settings
// ═══════════════════════════════════════════════════════════════════════════════
export const updatePublicProfile = async (req: any, res: Response) => {
  try {
    const { publicProfileEnabled, publicShowLevels, publicShowTreeSize, publicShowTaskHistory, visibleForRecruitment, seekingWork } = req.body;
    const user = await (prisma as any).user.findUnique({ where: { id: req.user.id }, select: { profilePic: true } });
    const membershipCount = await (prisma as any).treeMember.count({ where: { userId: req.user.id } });

    // Block enabling without profile photo
    if (publicProfileEnabled && !user?.profilePic) {
      return res.status(400).json({ error: 'Sube una foto de perfil antes de habilitar tu perfil público.' });
    }

    const nextPublicProfileEnabled = typeof publicProfileEnabled === 'boolean'
      ? publicProfileEnabled
      : undefined;
    const shouldMarkOnboarded = !!user?.profilePic && membershipCount > 0 && nextPublicProfileEnabled === true;

    const updated = await (prisma as any).user.update({
      where: { id: req.user.id },
      data: {
        ...(typeof publicProfileEnabled === 'boolean' && { publicProfileEnabled }),
        ...(typeof publicShowLevels === 'boolean' && { publicShowLevels }),
        ...(typeof publicShowTreeSize === 'boolean' && { publicShowTreeSize }),
        ...(typeof publicShowTaskHistory === 'boolean' && { publicShowTaskHistory }),
        ...(typeof visibleForRecruitment === 'boolean' && { visibleForRecruitment }),
        ...(typeof seekingWork === 'boolean' && { seekingWork }),
        ...(shouldMarkOnboarded && { is_onboarded: true }),
      },
      select: {
        publicProfileEnabled: true, publicShowLevels: true,
        publicShowTreeSize: true, publicShowTaskHistory: true,
        visibleForRecruitment: true, seekingWork: true, is_onboarded: true,
      },
    });

    const privacySync: Record<string, any> = {};
    if (typeof publicProfileEnabled === 'boolean') {
      privacySync.traceProfileVisibility = publicProfileEnabled ? 'PUBLIC' : 'TREE_ONLY';
    }
    if (typeof publicShowTaskHistory === 'boolean') {
      privacySync.taskHistoryVisibility = publicShowTaskHistory ? 'PUBLIC' : 'PRIVATE';
    }
    if (typeof visibleForRecruitment === 'boolean') {
      privacySync.showInTalentSearch = visibleForRecruitment;
    }

    if (Object.keys(privacySync).length > 0) {
      await (prisma as any).privacySettings.upsert({
        where: { userId: req.user.id },
        create: {
          userId: req.user.id,
          ...DEFAULT_PRIVACY_SETTINGS,
          ...privacySync,
        },
        update: privacySync,
      });
    }

    void logEvent({
      ...getRequestContext(req),
      actorId: req.user.id,
      action: 'USER_PROFILE_UPDATED',
      entityType: 'User',
      entityId: req.user.id,
      afterJson: updated,
      metadataJson: getRequestMetadata(req, { changedFields: Object.keys(req.body || {}), result: 'success' }),
      source: 'USER',
    });

    res.json(updated);
  } catch (error: any) {
    console.error('[updatePublicProfile]', error);
    res.status(500).json({ error: 'Error al actualizar perfil público' });
  }
};

// ═══════════════════════════════════════════════════════════════════════════════
// GET /users/public/:code — Public portfolio (no auth required)
// ═══════════════════════════════════════════════════════════════════════════════
export const getPublicProfile = async (req: any, res: Response) => {
  try {
    const code = req.params.code as string;

    if (!code || code.length < 6 || code.length > 16) {
      return res.status(404).json({ error: 'Perfil no encontrado' });
    }

    const user = await (prisma as any).user.findFirst({
      where: {
        sharingCode: { startsWith: code },
      },
      select: {
        id: true, username: true, sharingCode: true, profilePic: true,
        publicShowLevels: true, publicShowTreeSize: true, publicShowTaskHistory: true,
        privacySettings: true,
        memberships: {
          select: {
            treeId: true, xp: true, level: true, skills: true, goldenTickets: true,
            tree: { select: { id: true, name: true, icono: true, _count: { select: { members: true } } } },
          },
        },
      },
    });

    if (!user) return res.status(404).json({ error: 'Perfil no encontrado' });

    const privacy = withDefaultPrivacySettings(user.id, user.privacySettings);
    const viewerId = req.user?.id || null;
    const viewerRole = req.user?.role || null;
    const canViewTrace = await canViewUserPrivacyLevel({
      level: privacy.traceProfileVisibility,
      ownerId: user.id,
      viewerId,
      viewerRole,
    });

    if (!canViewTrace) {
      return res.status(404).json({ error: 'Perfil no encontrado' });
    }

    const canViewTaskHistory = await canViewUserPrivacyLevel({
      level: privacy.taskHistoryVisibility,
      ownerId: user.id,
      viewerId,
      viewerRole,
    });
    const canViewEvidence = await canViewUserPrivacyLevel({
      level: privacy.evidenceVisibility,
      ownerId: user.id,
      viewerId,
      viewerRole,
    });

    // Build skills with tiers
    const allSkills: any[] = [];
    for (const m of user.memberships) {
      const skills: string[] = JSON.parse(m.skills || '[]');
      const ticketMap = parseTicketMap(m.goldenTickets);
      for (const skill of skills) {
        const result = await computeSkillTier(user.id, skill, m.treeId);
        const ticketData = ticketMap[skill];
        allSkills.push({
          name: skill,
          treeName: m.tree?.name || 'Árbol',
          treeIcon: m.tree?.icono || '🌳',
          treePopulation: m.tree?._count?.members || 0,
          level: m.level,
          xp: m.xp,
          completedTasks: result.completedTasks,
          tier: result.tier,
          isTopTier: result.tier === 'ESPECIALISTA' || result.tier === 'ELITE_DORADO',
          goldenTickets: ticketData?.tickets || 0,
        });
      }
    }

    // Task history (if enabled)
    let taskHistory: any[] = [];
    if (canViewTaskHistory) {
      const tasks = await (prisma as any).task.findMany({
        where: {
          assignedTo: user.id,
          status: 'COMPLETED',
          auditada: true,
        },
        select: {
          id: true, name: true, difficulty: true, completedAt: true,
          evidenceUrl: true, completionPhotoUrl: true,
          evidenceFiles: {
            where: { status: 'ACTIVE' },
            orderBy: { createdAt: 'desc' },
            take: 5,
          },
          branch: { select: { name: true, isHashtag: true } },
        },
        orderBy: { completedAt: 'desc' },
        take: 20,
      });
      taskHistory = await Promise.all(tasks.map(async (t: any) => {
        const evidenceMetadata = await Promise.all((t.evidenceFiles || []).map(async (file: any) => {
          const allowed = canViewEvidence && await canAccessEvidenceFile({ ...file, task: t }, req);
          return toSafeEvidenceMetadata({ ...file, task: t }, allowed);
        }));
        const task = {
          id: t.id,
          name: t.name,
          difficulty: t.difficulty,
          completedAt: t.completedAt,
          evidence: canViewEvidence ? (t.evidenceUrl || t.completionPhotoUrl || evidenceMetadata.find((e: any) => e.fileAccessAllowed)?.downloadUrl || null) : null,
          evidenceMetadata,
          branch: t.branch?.name || null,
        };
        return canViewEvidence ? task : redactTaskEvidenceFields(task);
      }));
    }

    // Tree sizes
    const trees = user.publicShowTreeSize
      ? user.memberships.map((m: any) => ({
          name: m.tree?.name || 'Árbol',
          icon: m.tree?.icono || '🌳',
          population: m.tree?._count?.members || 0,
          level: user.publicShowLevels ? m.level : undefined,
          xp: user.publicShowLevels ? m.xp : undefined,
        }))
      : [];

    // Skill star (public — strip recentTasks for privacy, keep visual data)
    let skillStar = null;
    if (user.publicShowLevels) {
      const starData = await buildSkillStarData(user.id);
      const hasPoints = starData.star.some((s: any) => s.points > 0);
      if (hasPoints) {
        skillStar = {
          star: starData.star.map((s: any) => ({ skill: s.skill, points: s.points, tasks: s.tasks, level: s.level, tier: s.tier })),
          goldenAura: starData.goldenAura,
          pretext: starData.pretext,
        };
      }
    }

    res.json({
      username: user.username,
      profilePic: user.profilePic,
      skills: user.publicShowLevels ? allSkills : [],
      trees,
      taskHistory,
      skillStar,
    });
  } catch (error: any) {
    console.error('[getPublicProfile]', error);
    res.status(500).json({ error: 'Error al cargar perfil público' });
  }
};

// ── POST /users/me/request-deletion ──────────────────────────────────────
// GDPR "Right to be forgotten" — anonymizes identifiable data and logs request
export const requestDataDeletion = async (req: any, res: Response) => {
  try {
    const userId = req.user.id;

    const user = await (prisma as any).user.findUnique({ where: { id: userId } });
    if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });

    const anonymizedUsername = `deleted_${crypto.randomBytes(6).toString('hex')}`;
    const anonymizedEmail = `${anonymizedUsername}@deleted.trust`;

    await (prisma as any).user.update({
      where: { id: userId },
      data: {
        username: anonymizedUsername,
        email: anonymizedEmail,
        password: null,
        profilePic: null,
        is_guest: true,
        is_onboarded: false,
        publicProfileEnabled: false,
        visibleForRecruitment: false,
        seekingWork: false,
      },
    });

    // Anonymize privacy settings
    await (prisma as any).privacySettings.upsert({
      where: { userId },
      create: {
        userId,
        traceProfileVisibility: 'PRIVATE',
        taskHistoryVisibility: 'PRIVATE',
        evidenceVisibility: 'PRIVATE',
        showInTalentSearch: false,
        allowAggregatedMetrics: false,
      },
      update: {
        traceProfileVisibility: 'PRIVATE',
        taskHistoryVisibility: 'PRIVATE',
        evidenceVisibility: 'PRIVATE',
        showInTalentSearch: false,
        allowAggregatedMetrics: false,
      },
    });

    void logEvent({
      ...getRequestContext(req),
      actorId: userId,
      action: 'USER_REQUESTED_DELETION',
      entityType: 'User',
      entityId: userId,
      metadataJson: getRequestMetadata(req, {
        originalUsername: user.username,
        anonymizedAs: anonymizedUsername,
        result: 'success',
      }),
      severity: 'CRITICAL',
      source: 'USER',
    });

    res.json({ message: 'Solicitud de eliminación procesada. Tus datos han sido anonimizados.' });
  } catch (error: any) {
    console.error('[requestDataDeletion]', error);
    res.status(500).json({ error: 'Error al procesar la solicitud de eliminación' });
  }
};
