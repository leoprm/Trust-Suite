import { Request, Response } from 'express';
import { prisma } from '../index';

const CRITICAL_MASS_THRESHOLD = 10000;
const LAUNCH_PHASE_PRETEXT = 'Estás en la Fase de Lanzamiento de Trust Lite. El buscador es gratuito hasta alcanzar los 10,000 especialistas.';
const MATURE_PHASE_PRETEXT = 'Estás viendo especialistas certificados por comunidades reales. Cero perfiles falsos.';

async function getRecruitmentPhase() {
  const onboardedUsers = await (prisma as any).user.count({
    where: { is_onboarded: true },
  });

  return {
    totalOnboardedUsers: onboardedUsers,
    criticalMassThreshold: CRITICAL_MASS_THRESHOLD,
    isLaunchPhase: onboardedUsers < CRITICAL_MASS_THRESHOLD,
  };
}

function getRecruitmentPretext(isLaunchPhase: boolean) {
  return isLaunchPhase ? LAUNCH_PHASE_PRETEXT : MATURE_PHASE_PRETEXT;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Helper: Maturity-based access check
// Launch phase: unlocked for everyone until critical mass is reached.
// Mature phase: free if user belongs to a tree that is ≥6 months old AND has ≥240 completed tasks.
// Otherwise, needs an active 24-hour SearchPass.
// ═══════════════════════════════════════════════════════════════════════════════
async function checkTreeAccess(userId: string): Promise<{
  isLaunchPhase: boolean;
  isMatureTree: boolean;
  hasActivePass: boolean;
  maturityInfo?: { oldestTreeMonths: number; totalCompletedTasks: number };
  populationInfo: { totalOnboardedUsers: number; criticalMassThreshold: number };
}> {
  const phase = await getRecruitmentPhase();

  if (phase.isLaunchPhase) {
    return {
      isLaunchPhase: true,
      isMatureTree: true,
      hasActivePass: false,
      maturityInfo: { oldestTreeMonths: 0, totalCompletedTasks: 0 },
      populationInfo: {
        totalOnboardedUsers: phase.totalOnboardedUsers,
        criticalMassThreshold: phase.criticalMassThreshold,
      },
    };
  }

  // Find user's trees with age info
  const memberships = await (prisma as any).treeMember.findMany({
    where: { userId },
    select: { tree: { select: { id: true, createdAt: true } } },
  });

  if (memberships.length === 0) {
    const pass = await (prisma as any).searchPass.findFirst({
      where: { userId, expiresAt: { gt: new Date() } },
    });
    return {
      isLaunchPhase: false,
      isMatureTree: false,
      hasActivePass: !!pass,
      maturityInfo: { oldestTreeMonths: 0, totalCompletedTasks: 0 },
      populationInfo: {
        totalOnboardedUsers: phase.totalOnboardedUsers,
        criticalMassThreshold: phase.criticalMassThreshold,
      },
    };
  }

  // Calculate oldest tree age in months
  const now = new Date();
  let oldestMonths = 0;
  for (const m of memberships) {
    const ageMs = now.getTime() - new Date(m.tree.createdAt).getTime();
    const months = ageMs / (1000 * 60 * 60 * 24 * 30);
    if (months > oldestMonths) oldestMonths = months;
  }

  // Count total completed+audited tasks across all user's trees
  const treeIds = memberships.map((m: any) => m.tree.id);
  const completedTasks = await (prisma as any).task.count({
    where: {
      branch: { treeId: { in: treeIds } },
      status: 'COMPLETED',
      auditada: true,
    },
  });

  const isMature = oldestMonths >= 6 && completedTasks >= 240;

  if (isMature) {
    return {
      isLaunchPhase: false,
      isMatureTree: true,
      hasActivePass: false,
      maturityInfo: { oldestTreeMonths: Math.floor(oldestMonths), totalCompletedTasks: completedTasks },
      populationInfo: {
        totalOnboardedUsers: phase.totalOnboardedUsers,
        criticalMassThreshold: phase.criticalMassThreshold,
      },
    };
  }

  // Not mature — check for paid pass
  const pass = await (prisma as any).searchPass.findFirst({
    where: { userId, expiresAt: { gt: new Date() } },
  });
  return {
    isLaunchPhase: false,
    isMatureTree: false,
    hasActivePass: !!pass,
    maturityInfo: { oldestTreeMonths: Math.floor(oldestMonths), totalCompletedTasks: completedTasks },
    populationInfo: {
      totalOnboardedUsers: phase.totalOnboardedUsers,
      criticalMassThreshold: phase.criticalMassThreshold,
    },
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// GET /recruitment/search — Global Specialist Directory
// ═══════════════════════════════════════════════════════════════════════════════
export const searchSpecialists = async (req: any, res: Response) => {
  try {
    const userId = req.user.id;
    const { isLaunchPhase, isMatureTree, hasActivePass, populationInfo } = await checkTreeAccess(userId);
    const pretext = getRecruitmentPretext(isLaunchPhase);

    // Mature phase gate: must be mature tree or have active 24h pass
    if (!isLaunchPhase && !isMatureTree && !hasActivePass) {
      return res.json({
        locked: true,
        pretext,
        populationInfo,
        preview: [],
      });
    }

    // Parse filters
    const {
      skill,      // single skill (backward compat)
      skills,     // comma-separated multi-hashtag
      eliteOnly,
      country,
      city,
      sector,
      minLevel,
      minTreeSize,   // minimum tree member count
      availableOnly, // only seekingWork = true
      page = '1',
    } = req.query;

    const pageNum = Math.max(1, parseInt(page as string) || 1);
    const pageSize = 20;

    // Build dynamic where clauses
    const userWhere: any = {
      visibleForRecruitment: true,
      publicProfileEnabled: true,
      privacySettings: {
        is: {
          showInTalentSearch: true,
        },
      },
    };

    // Availability filter: only users actively seeking work
    if (availableOnly === 'true') {
      userWhere.seekingWork = true;
    }

    // Parse skill list (multi-hashtag support)
    const skillList: string[] = [];
    if (skills) {
      skillList.push(...(skills as string).split(',').map((s: string) => s.trim()).filter(Boolean));
    } else if (skill) {
      skillList.push(skill as string);
    }

    // Find matching UserSkillXP records
    const skillXPWhere: any = {};
    if (skillList.length > 0) {
      skillXPWhere.OR = skillList.map((s: string) => ({ skillTag: { contains: s } }));
    }
    if (eliteOnly === 'true') {
      skillXPWhere.cachedPercentile = { gte: 80 };
    }

    // Geographic: filter by tree membership location
    const treeWhere: any = {};
    if (country) treeWhere.country = country as string;
    if (city) treeWhere.city = city as string;
    if (sector) treeWhere.sector = sector as string;

    const hasTreeFilter = Object.keys(treeWhere).length > 0;
    const minLvl = parseInt(minLevel as string) || 0;
    const minSize = parseInt(minTreeSize as string) || 0;

    // Step 1: get user IDs that match skill criteria
    let matchingUserIds: string[] | null = null;

    if (skillList.length > 0 || eliteOnly === 'true') {
      const xpRecords = await (prisma as any).userSkillXP.findMany({
        where: skillXPWhere,
        select: { userId: true },
        distinct: ['userId'],
      });
      matchingUserIds = xpRecords.map((r: any) => r.userId);
      if (matchingUserIds!.length === 0) {
        return res.json({
          locked: false,
          pretext,
          populationInfo,
          results: [],
          total: 0,
          page: pageNum,
        });
      }
    }

    // Step 2: get user IDs that match geo filter / tree scale (via tree membership)
    if (hasTreeFilter || minSize > 0) {
      // Build tree filter with optional min size
      const treeFilter: any = { ...treeWhere };
      if (minSize > 0) {
        treeFilter.members = { some: {} }; // tree must have members
      }

      const treeMembers = await (prisma as any).treeMember.findMany({
        where: {
          ...(minLvl > 0 ? { level: { gte: minLvl } } : {}),
          tree: treeFilter,
        },
        select: { userId: true, tree: { select: { _count: { select: { members: true } } } } },
        distinct: ['userId'],
      });

      // If minSize, filter by actual member count
      let geoUserIds = treeMembers
        .filter((m: any) => minSize <= 0 || (m.tree?._count?.members || 0) >= minSize)
        .map((m: any) => m.userId);

      if (matchingUserIds) {
        const geoSet = new Set(geoUserIds);
        matchingUserIds = matchingUserIds.filter(id => geoSet.has(id));
      } else {
        matchingUserIds = geoUserIds;
      }

      if (matchingUserIds!.length === 0) {
        return res.json({
          locked: false,
          pretext,
          populationInfo,
          results: [],
          total: 0,
          page: pageNum,
        });
      }
    }

    if (matchingUserIds) {
      userWhere.id = { in: matchingUserIds };
    }

    // Step 3: query users
    const [users, total] = await Promise.all([
      (prisma as any).user.findMany({
        where: userWhere,
        select: {
          id: true,
          username: true,
          profilePic: true,
          sharingCode: true,
          seekingWork: true,
          memberships: {
            select: {
              level: true,
              skills: true,
              xp: true,
              tree: { select: { name: true, icono: true, country: true, city: true, sector: true, _count: { select: { members: true } } } },
            },
          },
        },
        skip: (pageNum - 1) * pageSize,
        take: pageSize,
        orderBy: { createdAt: 'desc' },
      }),
      (prisma as any).user.count({ where: userWhere }),
    ]);

    // Enrich each user with top skills from UserSkillXP
    const results = await Promise.all(users.map(async (u: any) => {
      const topSkills = await (prisma as any).userSkillXP.findMany({
        where: { userId: u.id },
        orderBy: { accumulatedPoints: 'desc' },
        take: 6,
        select: { skillTag: true, accumulatedPoints: true, completedTasks: true, cachedPercentile: true },
      });

      // Aggregate geo from trees
      const locations = u.memberships
        .filter((m: any) => m.tree?.country)
        .map((m: any) => ({
          country: m.tree.country,
          city: m.tree.city,
          sector: m.tree.sector,
        }));
      const uniqueLocations = [...new Map(locations.map((l: any) => [JSON.stringify(l), l])).values()];

      // Max level across trees
      const maxLevel = u.memberships.length > 0
        ? Math.max(...u.memberships.map((m: any) => m.level || 1))
        : 1;

      // Total population
      const totalPopulation = u.memberships.reduce((s: number, m: any) => s + (m.tree?._count?.members || 0), 0);

      return {
        id: u.id,
        username: u.username,
        profilePic: u.profilePic,
        publicCode: u.sharingCode?.slice(0, 8),
        seekingWork: u.seekingWork || false,
        maxLevel,
        totalPopulation,
        locations: uniqueLocations.slice(0, 3),
        trees: u.memberships.map((m: any) => ({
          name: m.tree?.name,
          icon: m.tree?.icono,
          population: m.tree?._count?.members || 0,
        })),
        topSkills: topSkills.map((s: any) => ({
          name: s.skillTag,
          points: s.accumulatedPoints,
          tasks: s.completedTasks,
          isElite: (s.cachedPercentile ?? 0) >= 80,
          tier: s.completedTasks < 7 ? 'INTERNO' : ((s.cachedPercentile ?? 0) >= 80 ? 'ELITE_DORADO' : 'ESPECIALISTA'),
        })),
      };
    }));

    res.json({
      locked: false,
      pretext,
      populationInfo,
      results,
      total,
      page: pageNum,
    });
  } catch (error: any) {
    console.error('[searchSpecialists]', error);
    res.status(500).json({ error: 'Error en búsqueda de especialistas' });
  }
};

// ═══════════════════════════════════════════════════════════════════════════════
// POST /recruitment/purchase-pass — Create a 24-hour search pass
// ═══════════════════════════════════════════════════════════════════════════════
export const purchaseSearchPass = async (req: any, res: Response) => {
  try {
    const userId = req.user.id;
    const phase = await getRecruitmentPhase();

    if (phase.isLaunchPhase) {
      return res.json({
        disabled: true,
        message: 'El Pase de Reclutador está desactivado durante la Fase de Lanzamiento.',
        pretext: getRecruitmentPretext(true),
        populationInfo: {
          totalOnboardedUsers: phase.totalOnboardedUsers,
          criticalMassThreshold: phase.criticalMassThreshold,
        },
      });
    }

    // Check if already has active pass
    const existing = await (prisma as any).searchPass.findFirst({
      where: { userId, expiresAt: { gt: new Date() } },
    });
    if (existing) {
      return res.json({ pass: existing, message: 'Ya tienes un pase activo.' });
    }

    // Create 24-hour pass (in production this would integrate with Stripe/MercadoPago)
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + 24);

    const pass = await (prisma as any).searchPass.create({
      data: { userId, expiresAt },
    });

    res.json({ pass, message: 'Pase de búsqueda activado por 24 horas.' });
  } catch (error: any) {
    console.error('[purchaseSearchPass]', error);
    res.status(500).json({ error: 'Error al crear pase de búsqueda' });
  }
};

// ═══════════════════════════════════════════════════════════════════════════════
// GET /recruitment/access-status — Check current user's access level
// ═══════════════════════════════════════════════════════════════════════════════
export const getAccessStatus = async (req: any, res: Response) => {
  try {
    const { isLaunchPhase, isMatureTree, hasActivePass, maturityInfo, populationInfo } = await checkTreeAccess(req.user.id);

    let passExpires: string | null = null;
    if (hasActivePass) {
      const pass = await (prisma as any).searchPass.findFirst({
        where: { userId: req.user.id, expiresAt: { gt: new Date() } },
        orderBy: { expiresAt: 'desc' },
      });
      passExpires = pass?.expiresAt?.toISOString() || null;
    }

    res.json({
      isLaunchPhase,
      isMatureTree,
      hasActivePass,
      passExpires,
      maturityInfo,
      populationInfo,
      pretext: getRecruitmentPretext(isLaunchPhase),
    });
  } catch (error: any) {
    console.error('[getAccessStatus]', error);
    res.status(500).json({ error: 'Error al verificar acceso' });
  }
};

// ═══════════════════════════════════════════════════════════════════════════════
// GET /recruitment/filters — Available filter options (countries, cities, skills)
// ═══════════════════════════════════════════════════════════════════════════════
export const getFilterOptions = async (req: any, res: Response) => {
  try {
    // Get distinct locations from trees
    const trees = await (prisma as any).tree.findMany({
      where: { country: { not: null } },
      select: { country: true, city: true, sector: true },
      distinct: ['country', 'city', 'sector'],
    });

    const countries = [...new Set(trees.map((t: any) => t.country).filter(Boolean))].sort();
    const cities = [...new Set(trees.map((t: any) => t.city).filter(Boolean))].sort();
    const sectors = [...new Set(trees.map((t: any) => t.sector).filter(Boolean))].sort();

    // Get distinct skills
    const skills = await (prisma as any).userSkillXP.findMany({
      where: { accumulatedPoints: { gt: 0 } },
      select: { skillTag: true },
      distinct: ['skillTag'],
    });
    const skillNames = skills.map((s: any) => s.skillTag).sort();

    res.json({ countries, cities, sectors, skills: skillNames });
  } catch (error: any) {
    console.error('[getFilterOptions]', error);
    res.status(500).json({ error: 'Error al obtener filtros' });
  }
};

// ═══════════════════════════════════════════════════════════════════════════════
// POST /recruitment/invite — Send interview invitation to a specialist
// ═══════════════════════════════════════════════════════════════════════════════
export const sendInvitation = async (req: any, res: Response) => {
  try {
    const senderId = req.user.id;
    const { recipientId, message } = req.body;

    if (!recipientId || !message?.trim()) {
      return res.status(400).json({ error: 'Destinatario y mensaje son obligatorios.' });
    }

    if (senderId === recipientId) {
      return res.status(400).json({ error: 'No puedes invitarte a ti mismo.' });
    }

    // Verify sender has access. In launch phase, everyone can send invitations.
    const { isLaunchPhase, isMatureTree, hasActivePass } = await checkTreeAccess(senderId);
    if (!isLaunchPhase && !isMatureTree && !hasActivePass) {
      return res.status(403).json({ error: 'Necesitas acceso al directorio para enviar invitaciones.' });
    }

    // Verify recipient is visible for recruitment
    const recipient = await (prisma as any).user.findUnique({
      where: { id: recipientId },
      select: {
        visibleForRecruitment: true,
        publicProfileEnabled: true,
        privacySettings: { select: { showInTalentSearch: true } },
      },
    });
    if (!recipient?.visibleForRecruitment || !recipient?.publicProfileEnabled || !recipient?.privacySettings?.showInTalentSearch) {
      return res.status(404).json({ error: 'Especialista no encontrado o no disponible.' });
    }

    // Check for existing pending invitation
    const existing = await (prisma as any).interviewInvitation.findFirst({
      where: { senderId, recipientId, status: 'PENDING' },
    });
    if (existing) {
      return res.status(409).json({ error: 'Ya tienes una invitación pendiente para este especialista.' });
    }

    const invitation = await (prisma as any).interviewInvitation.create({
      data: {
        senderId,
        recipientId,
        message: message.trim().slice(0, 500),
      },
    });

    // Create notification for recipient
    try {
      const sender = await (prisma as any).user.findUnique({ where: { id: senderId }, select: { username: true } });
      await (prisma as any).notification.create({
        data: {
          userId: recipientId,
          type: 'GENERAL',
          title: '📩 Invitación de Entrevista',
          body: `${sender?.username || 'Alguien'} te ha invitado a una conversación profesional.`,
          entityType: 'invitacion',
          entityId: invitation.id,
        },
      });
    } catch { /* notification is non-critical */ }

    res.json({ invitation, message: 'Invitación enviada correctamente.' });
  } catch (error: any) {
    console.error('[sendInvitation]', error);
    res.status(500).json({ error: 'Error al enviar invitación' });
  }
};

// ═══════════════════════════════════════════════════════════════════════════════
// GET /recruitment/invitations — Get received invitations for current user
// ═══════════════════════════════════════════════════════════════════════════════
export const getInvitations = async (req: any, res: Response) => {
  try {
    const userId = req.user.id;
    const { type = 'received' } = req.query;

    const where = type === 'sent'
      ? { senderId: userId }
      : { recipientId: userId };

    const invitations = await (prisma as any).interviewInvitation.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 50,
      include: {
        sender: { select: { id: true, username: true, profilePic: true } },
        recipient: { select: { id: true, username: true, profilePic: true } },
      },
    });

    res.json({ invitations });
  } catch (error: any) {
    console.error('[getInvitations]', error);
    res.status(500).json({ error: 'Error al obtener invitaciones' });
  }
};

// ═══════════════════════════════════════════════════════════════════════════════
// POST /recruitment/invitations/:id/respond — Accept or reject invitation
// ═══════════════════════════════════════════════════════════════════════════════
export const respondInvitation = async (req: any, res: Response) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;
    const { action } = req.body; // 'accept' or 'reject'

    if (!['accept', 'reject'].includes(action)) {
      return res.status(400).json({ error: 'Acción inválida. Usa "accept" o "reject".' });
    }

    const invitation = await (prisma as any).interviewInvitation.findUnique({
      where: { id },
      include: { sender: { select: { username: true } } },
    });

    if (!invitation) {
      return res.status(404).json({ error: 'Invitación no encontrada.' });
    }
    if (invitation.recipientId !== userId) {
      return res.status(403).json({ error: 'No puedes responder a esta invitación.' });
    }
    if (invitation.status !== 'PENDING') {
      return res.status(409).json({ error: 'Esta invitación ya fue respondida.' });
    }

    const status = action === 'accept' ? 'ACCEPTED' : 'REJECTED';
    const updated = await (prisma as any).interviewInvitation.update({
      where: { id },
      data: { status, respondedAt: new Date() },
    });

    // Notify sender of response
    try {
      const recipient = await (prisma as any).user.findUnique({ where: { id: userId }, select: { username: true } });
      await (prisma as any).notification.create({
        data: {
          userId: invitation.senderId,
          type: 'GENERAL',
          title: action === 'accept' ? '✅ Invitación Aceptada' : '❌ Invitación Rechazada',
          body: `${recipient?.username || 'El especialista'} ${action === 'accept' ? 'aceptó' : 'rechazó'} tu invitación de entrevista.`,
          entityType: 'invitacion',
          entityId: id,
        },
      });
    } catch { /* notification is non-critical */ }

    res.json({ invitation: updated, message: action === 'accept' ? 'Invitación aceptada.' : 'Invitación rechazada.' });
  } catch (error: any) {
    console.error('[respondInvitation]', error);
    res.status(500).json({ error: 'Error al responder invitación' });
  }
};
