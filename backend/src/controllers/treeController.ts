import { Request, Response } from 'express';
import { prisma } from '../index';
import { randomBytes } from 'crypto';
import { redistributeTreeBudget } from '../utils/economicEngine';
import { getRequestContext, getRequestMetadata, logEvent } from '../services/eventLogService';

// Re-usable helper to get users
export const createTree = async (req: any, res: Response) => {
  try {
    const { name, icono, description, inviteUserIds, settings, visibility, admissionPolicy, allowHashtags, allowTraditionalBranches, hashtagCreationPolicy, modoGobierno, creacionRamaDirecta, creacionRamaComunitaria, capacidades, treeType } = req.body;
    
    const isAICouncil = treeType === 'AI_COUNCIL';

    if (allowHashtags === false && allowTraditionalBranches === false && !isAICouncil) {
      return res.status(400).json({ error: 'Un árbol debe permitir al menos un tipo de rama (Hashtags o Tradicionales).' });
    }

    const inviteCode = randomBytes(4).toString('hex');
    const creatorId = req.user.id;

    // Enforce forced settings for AI_COUNCIL trees
    let economyMode: string;
    let forcedVisibility = visibility;
    let forcedAdmissionPolicy = admissionPolicy;
    let forcedHashtagPolicy = hashtagCreationPolicy;
    let forcedCreacionRamaComunitaria = creacionRamaComunitaria;
    let forcedAllowTraditionalBranches = allowTraditionalBranches;
    let forcedAllowHashtags = allowHashtags;

    if (isAICouncil) {
      forcedVisibility = 'PUBLIC';
      forcedAdmissionPolicy = 'INVITE_ONLY';
      forcedHashtagPolicy = 'ADMIN_ONLY';
      economyMode = 'NO_ECONOMY';
      forcedCreacionRamaComunitaria = false;
      forcedAllowTraditionalBranches = false;
      forcedAllowHashtags = true;
    } else {
      let econ = req.body.economyMode || 'NO_ECONOMY';
      try {
        const parsedSettings = typeof settings === 'string' ? JSON.parse(settings) : settings;
        if (!req.body.economyMode && parsedSettings?.modules?.fiat?.enabled) {
          econ = 'LEGACY_FIAT';
        }
      } catch {}
      economyMode = econ;
    }
    
    const tree = await (prisma as any).tree.create({
      data: { name, icono, description, inviteCode, creatorId, settings,
        visibility: forcedVisibility,
        admissionPolicy: forcedAdmissionPolicy,
        allowHashtags: forcedAllowHashtags,
        allowTraditionalBranches: forcedAllowTraditionalBranches,
        hashtagCreationPolicy: forcedHashtagPolicy,
        modoGobierno,
        creacionRamaDirecta,
        creacionRamaComunitaria: forcedCreacionRamaComunitaria,
        capacidades,
        economyMode,
        treeType: isAICouncil ? 'AI_COUNCIL' : 'NORMAL',
      }
    });

    // Protocolo Asimov: tree creator must be human. Check if user is AI in any other tree.
    // (New trees: the creator becomes a member, but they can't be AI yet — check User record or cross-ref)
    // Actually, we check: is the user an AI member of any existing tree?
    const existingAiMember = await prisma.treeMember.findFirst({
      where: { userId: creatorId, isAI: true },
      select: { id: true },
    });
    if (existingAiMember) {
      // Rollback the tree creation
      await prisma.tree.delete({ where: { id: tree.id } });
      return res.status(403).json({ error: 'Protocolo Asimov: Un AI no puede ser creador de un Tree.' });
    }
    
    // Creator membership
    await prisma.treeMember.create({
      data: {
        userId: creatorId,
        treeId: tree.id,
        invitedById: null,
        status: 'VERIFIED'
      }
    } as any);

    // Invited membership
    if (inviteUserIds && inviteUserIds.length > 0) {
      const userIds = new Set(inviteUserIds);
      userIds.delete(creatorId); // redundancy
      
      await prisma.treeMember.createMany({
        data: Array.from(userIds).map((userId: any) => ({
          userId,
          treeId: tree.id,
          invitedById: creatorId
        })) as any
      });
    }

    void logEvent({
      ...getRequestContext(req),
      treeId: tree.id,
      action: 'TREE_CREATED',
      entityType: 'Tree',
      entityId: tree.id,
      afterJson: {
        id: tree.id,
        name: tree.name,
        visibility: tree.visibility,
        admissionPolicy: tree.admissionPolicy,
        allowHashtags: tree.allowHashtags,
        allowTraditionalBranches: tree.allowTraditionalBranches,
      },
      metadataJson: getRequestMetadata(req, { invitedCount: inviteUserIds?.length || 0, result: 'success' }),
      source: 'USER',
    });

    res.status(201).json(tree);
  } catch (error: any) {
    console.error('[createTree] ERROR:', error?.message || error);
    res.status(500).json({ error: 'Failed to create tree', detail: error?.message || String(error) });
  }
};

export const inviteMember = async (req: any, res: Response) => {
  try {
    const { id } = req.params; // treeId
    const { userId } = req.body; // target user

    // Requester must be a member
    const requester = await prisma.treeMember.findUnique({
      where: { userId_treeId: { userId: req.user.id, treeId: id } }
    });
    if (!requester) return res.status(403).json({ error: 'Not a member of this tree' });
    if (requester.status !== 'VERIFIED') return res.status(403).json({ error: 'Debes ser un miembro Verificado para poder invitar a otros' });

    // Already a member?
    const existing = await prisma.treeMember.findUnique({
      where: { userId_treeId: { userId, treeId: id } }
    });
    if (existing) return res.status(400).json({ error: 'User is already a member' });

    await prisma.treeMember.create({
      data: {
        userId,
        treeId: id,
        invitedById: req.user.id
      }
    } as any);

    // TRIGGER: Nuevo miembro puede afectar el presupuesto dinámico
    await redistributeTreeBudget(id);

    void logEvent({
      ...getRequestContext(req),
      treeId: id,
      action: 'TREE_MEMBER_INVITED',
      entityType: 'TreeMember',
      entityId: userId,
      metadataJson: getRequestMetadata(req, { invitedUserId: userId, result: 'success' }),
      source: 'USER',
    });

    res.json({ message: 'User invited successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to invite member' });
  }
};

export const generateGuestToken = async (req: any, res: Response) => {
  try {
    const { id } = req.params; // treeId
    const creadorId = req.user.id;

    // Requester must be a member
    const requester = await prisma.treeMember.findUnique({
      where: { userId_treeId: { userId: creadorId, treeId: id } }
    });
    if (!requester) return res.status(403).json({ error: 'Not a member of this tree' });
    if (requester.status !== 'VERIFIED') return res.status(403).json({ error: 'Debes ser un miembro Verificado para poder invitar a otros' });

    // Clean up expired tokens (older than 24h) just to keep DB clean
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
    await prisma.tokenInvitacion.deleteMany({
      where: { createdAt: { lt: yesterday } }
    });

    const token = await prisma.tokenInvitacion.create({
      data: {
        arbolId: id,
        creadorId,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000) // 24 hours
      }
    });

    res.json({ token: token.id });
  } catch (error) {
    console.error('generateGuestToken error:', error);
    res.status(500).json({ error: 'Failed to generate guest token' });
  }
};

export const consumeGuestToken = async (req: any, res: Response) => {
  try {
    const { token } = req.body;
    const userId = req.user.id;

    if (!token) {
      return res.status(400).json({ error: 'Token es requerido' });
    }

    // 1. Validar el token
    const tokenRecord = await (prisma as any).tokenInvitacion.findUnique({
      where: { id: token }
    });

    if (!tokenRecord) {
      return res.status(404).json({ error: 'Enlace inválido o no encontrado' });
    }

    if (tokenRecord.usado) {
      return res.status(403).json({ error: 'Este enlace ya ha sido utilizado.' });
    }

    if (tokenRecord.expiresAt && new Date() > new Date(tokenRecord.expiresAt)) {
      return res.status(403).json({ error: 'Este enlace ha expirado.' });
    }

    // 2. Comprobar si ya es miembro
    const existingMember = await prisma.treeMember.findUnique({
      where: { userId_treeId: { userId, treeId: tokenRecord.arbolId } }
    });

    if (existingMember) {
      // Si ya es miembro, está bien.
      return res.json({ message: 'Ya eres miembro del árbol', treeId: tokenRecord.arbolId });
    }

    // 3. Marcar token como usado y agregar usuario al árbol
    await prisma.$transaction([
      (prisma as any).tokenInvitacion.update({
        where: { id: token },
        data: { usado: true }
      }),
      prisma.treeMember.create({
        data: {
          userId,
          treeId: tokenRecord.arbolId,
          invitedById: tokenRecord.creadorId,
          status: 'VERIFIED'
        } as any
      })
    ] as any);

    // TRIGGER: Nuevo miembro via token puede afectar el presupuesto
    await redistributeTreeBudget(tokenRecord.arbolId);

    void logEvent({
      ...getRequestContext(req),
      treeId: tokenRecord.arbolId,
      action: 'TREE_MEMBER_JOINED',
      entityType: 'TreeMember',
      entityId: userId,
      metadataJson: getRequestMetadata(req, { via: 'guest_token', result: 'success' }),
      source: 'USER',
    });

    res.json({ message: 'Unido exitosamente', treeId: tokenRecord.arbolId });
  } catch (error) {
    console.error('consumeGuestToken error:', error);
    res.status(500).json({ error: 'No se pudo procesar tu invitación.' });
  }
};

export const removeMember = async (req: any, res: Response) => {
  try {
    const { treeId, userId } = req.params;
    const requesterId = req.user.id;

    if (requesterId === userId) {
      return res.status(400).json({ error: 'Use leaveTree to remove yourself' });
    }

    const tree = await prisma.tree.findUnique({ where: { id: treeId } });
    if (!tree) return res.status(404).json({ error: 'Tree not found' });

    const target = await prisma.treeMember.findUnique({
      where: { userId_treeId: { userId, treeId } }
    });
    if (!target) return res.status(404).json({ error: 'Member not found' });

    // Authority check
    let hasAuthority = false;

    // 1. Creator has authority over everyone
    if (tree.creatorId === requesterId) {
      hasAuthority = true;
    } else {
      // 2. Hierarchical check: Did requester invite target, or someone who invited someone... who invited target?
      // We check if target was invited by requester OR if target's inviter is someone requester has authority over.
      
      // Simpler: Is target in the "invitation tree" of requester?
      // We can walk up the chain from target to creator
      let currentInviterId = target.invitedById;
      while (currentInviterId) {
        if (currentInviterId === requesterId) {
          hasAuthority = true;
          break;
        }
        const inviterMember = await prisma.treeMember.findUnique({
          where: { userId_treeId: { userId: currentInviterId, treeId } }
        });
        currentInviterId = inviterMember?.invitedById || null;
      }
    }

    if (!hasAuthority) {
      return res.status(403).json({ error: 'No tienes autoridad para eliminar a este miembro' });
    }

    // Recursively collect all members invited by target (and their invitees)
    const membersToDelete = [userId];
    const getInvitees = async (pId: string) => {
      const invitees = await prisma.treeMember.findMany({
        where: { treeId, invitedById: pId }
      });
      for (const inv of invitees) {
        membersToDelete.push(inv.userId);
        await getInvitees(inv.userId);
      }
    };
    await getInvitees(userId);

    await prisma.treeMember.deleteMany({
      where: {
        treeId,
        userId: { in: membersToDelete }
      }
    });

    // TRIGGER: Miembros eliminados pueden afectar el presupuesto dinámico
    await redistributeTreeBudget(treeId);

    void logEvent({
      ...getRequestContext(req),
      treeId,
      action: 'TREE_MEMBER_REMOVED',
      entityType: 'TreeMember',
      entityId: userId,
      beforeJson: { userId, removedUserIds: membersToDelete },
      metadataJson: getRequestMetadata(req, { removedCount: membersToDelete.length, result: 'success' }),
      source: 'USER',
    });

    res.json({ message: `Member(s) removed successfully (${membersToDelete.length})` });
  } catch (error) {
    res.status(500).json({ error: 'Failed to remove member' });
  }
};

export const leaveTree = async (req: any, res: Response) => {
  try {
    const { id } = req.params;
    const leavingUserId = req.user.id;
    await prisma.treeMember.delete({
      where: {
        userId_treeId: {
          userId: leavingUserId,
          treeId: id
        }
      }
    });

    // TRIGGER: Usuario abandonó el árbol, puede afectar el presupuesto
    await redistributeTreeBudget(id);

    res.json({ message: 'Left tree successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to leave tree' });
  }
};

export const joinTree = async (req: any, res: Response) => {
  try {
    const { inviteCode, treeId } = req.body;
    let tree;

    if (inviteCode) {
      tree = await prisma.tree.findUnique({ where: { inviteCode } });
    } else if (treeId) {
      tree = await prisma.tree.findUnique({ where: { id: treeId } });
      if (tree && tree.admissionPolicy !== 'OPEN') {
        return res.status(403).json({ error: 'This tree requires an invite code' });
      }
    }
    
    if (!tree) {
      return res.status(404).json({ error: 'Tree not found or invalid invite code' });
    }

    // Check if already a member
    const existing = await prisma.treeMember.findUnique({
      where: {
        userId_treeId: { userId: req.user.id, treeId: tree.id }
      }
    });

    if (existing) {
      return res.status(400).json({ error: 'Already a member of this tree' });
    }

    const membership = await prisma.treeMember.create({
      data: {
        userId: req.user.id,
        treeId: tree.id,
        invitedById: null // Joined via code
      }
    } as any);

    void logEvent({
      ...getRequestContext(req),
      treeId: tree.id,
      action: 'TREE_MEMBER_JOINED',
      entityType: 'TreeMember',
      entityId: req.user.id,
      metadataJson: getRequestMetadata(req, { via: inviteCode ? 'invite_code' : 'open_tree', result: 'success' }),
      source: 'USER',
    });

    res.status(200).json({ message: 'Joined tree successfully', tree });
  } catch (error) {
    res.status(500).json({ error: 'Failed to join tree' });
  }
};

// Helper for temporal aggregation
const calculateTreeHistory = async (treeId: string, userId: string, range: string) => {
  const now = new Date();
  let startTime: Date;
  let points: number;
  let intervalMs: number;
  let labelFormat: (d: Date) => string;

  switch (range) {
    case '1D':
      startTime = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      points = 24; // Every 1 hour
      intervalMs = 60 * 60 * 1000;
      labelFormat = (d) => `${d.getHours()}:00`;
      break;
    case '1S':
      const sDay = now.getDay(); 
      const diff = now.getDate() - sDay + (sDay === 0 ? -6 : 1); // Adjust to Monday
      startTime = new Date(now.getFullYear(), now.getMonth(), diff, 0, 0, 0, 0);
      points = 7;
      intervalMs = 24 * 60 * 60 * 1000;
      labelFormat = (d) => d.toLocaleDateString('es-ES', { weekday: 'short' }).replace(/^\w/, (c) => c.toUpperCase());
      break;
    case '1M':
      startTime = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
      const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
      points = lastDay;
      intervalMs = 24 * 60 * 60 * 1000;
      labelFormat = (d) => d.getDate().toString();
      break;
    case '1A':
      startTime = new Date(now.getFullYear(), 0, 1, 0, 0, 0, 0);
      points = 12;
      intervalMs = 30.5 * 24 * 60 * 60 * 1000; // Approx 1 month
      labelFormat = (d) => d.toLocaleDateString('es-ES', { month: 'short' }).replace(/^\w/, (c) => c.toUpperCase());
      break;
    default:
      return [];
  }

  // Fetch all relevant data for the whole period at once to bucket it in memory
  // --- $queryRaw: FiatTransaction table (model removed from Prisma schema, table persists in MySQL) ---
  const transactions = await prisma.$queryRawUnsafe<any[]>(
    `SELECT ft.date, ft.type, ft.amount FROM FiatTransaction ft WHERE ft.treeId = ? AND ft.date >= ? ORDER BY ft.date ASC`,
    treeId, startTime
  );

  // --- $queryRaw: SatisfactionRating + PhaseDeliverable + Branch join (models removed, tables persist) ---
  const ratings = await prisma.$queryRawUnsafe<any[]>(
    `SELECT sr.rating, sr.createdAt FROM SatisfactionRating sr
     JOIN PhaseDeliverable pd ON sr.deliverableId = pd.id
     JOIN Branch b ON pd.branchId = b.id
     WHERE b.treeId = ? AND sr.createdAt >= ?
     ORDER BY sr.createdAt ASC`,
    treeId, startTime
  );

  const history = [];
  for (let i = 0; i < points; i++) {
    const bucketStart = new Date(startTime.getTime() + i * intervalMs);
    const bucketEnd = new Date(bucketStart.getTime() + intervalMs);

    // Filter data for this bucket
    const bucketTrans = transactions.filter((t: any) => t.date >= bucketStart && t.date < bucketEnd);
    const bucketRatings = ratings.filter((r: any) => r.createdAt >= bucketStart && r.createdAt < bucketEnd);

    const profit = bucketTrans.reduce((acc: number, t: any) => {
      if (t.type === 'INCOME') return acc + Number(t.amount);
      if (t.type === 'EXPENSE') return acc - Number(t.amount);
      return acc;
    }, 0);

    const investment = bucketTrans
      .filter((t: any) => t.type === 'INVESTMENT')
      .reduce((acc: number, t: any) => acc + Number(t.amount), 0);

    const satisfaction = bucketRatings.length > 0
      ? (bucketRatings.reduce((acc, r) => acc + r.rating, 0) / bucketRatings.length) / 20
      : null;

    history.push({
      name: labelFormat(bucketStart),
      profit: Number(profit.toFixed(2)),
      investment: Number(investment.toFixed(2)),
      satisfaction: satisfaction !== null ? Number(satisfaction.toFixed(1)) : null
    });
  }

  return history;
};

export const getMyTrees = async (req: any, res: Response) => {
  try {
    const userId = req.user.id;
    const memberships = await prisma.treeMember.findMany({
      where: { userId },
      include: { tree: { include: { _count: { select: { members: true } } } } }
    });

    const enrichedTrees = await Promise.all(memberships.map(async (m: any) => {
      const tree = m.tree;
      const lastMonth = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

      // --- GROUP HEALTH DATA (Current Month Summary — automatic transactions only) ---
      // $queryRaw: FiatTransaction groupBy (model removed)
      const groupStats = await prisma.$queryRawUnsafe<any[]>(
        `SELECT ft.type, SUM(ft.amount) as _sum FROM FiatTransaction ft
         WHERE ft.treeId = ? AND ft.date >= ?
         GROUP BY ft.type`,
        tree.id, lastMonth
      );

      const groupIncome = Number(groupStats.find((s: any) => s.type === 'INCOME')?._sum) || 0;
      const groupExpense = Number(groupStats.find((s: any) => s.type === 'EXPENSE')?._sum) || 0;

      // --- INVERSION %: Active FIAT promises / Total historical INCOME * 100 ---
      // $queryRaw: PromiseP2P + Task + Branch join (model removed)
      const [activeFiatPromises, historicalIncomeStats] = await Promise.all([
        prisma.$queryRawUnsafe<any[]>(
          `SELECT SUM(pp.amount) as _sum FROM PromiseP2P pp
           JOIN Task t ON pp.taskId = t.id
           JOIN Branch b ON t.branchId = b.id
           WHERE pp.currencyType = 'FIAT'
             AND pp.status IN ('PENDING', 'PAYMENT_SENT')
             AND b.treeId = ?`,
          tree.id
        ),
        prisma.$queryRawUnsafe<any[]>(
          `SELECT SUM(ft.amount) as _sum FROM FiatTransaction ft
           WHERE ft.treeId = ? AND ft.type = 'INCOME'`,
          tree.id
        )
      ]);
      const totalFiatPromises = Number(activeFiatPromises[0]?._sum) || 0;
      const totalHistoricalCapital = Number(historicalIncomeStats[0]?._sum) || 0;
      const inversionPct = totalHistoricalCapital > 0
        ? Math.min(100, (totalFiatPromises / totalHistoricalCapital) * 100)
        : 0;

      // $queryRaw: SatisfactionRating + PhaseDeliverable + Branch join
      const groupSatisfactions = await prisma.$queryRawUnsafe<any[]>(
        `SELECT sr.rating FROM SatisfactionRating sr
         JOIN PhaseDeliverable pd ON sr.deliverableId = pd.id
         JOIN Branch b ON pd.branchId = b.id
         WHERE b.treeId = ?`,
        tree.id
      );
      const groupSatisfactionAvg = groupSatisfactions.length > 0
        ? (groupSatisfactions.reduce((acc, r) => acc + r.rating, 0) / groupSatisfactions.length) / 20
        : null;

      // --- PERSONAL HEALTH DATA ---
      // $queryRaw: FiatTransaction groupBy personal (model removed)
      const personalFiatStats = await prisma.$queryRawUnsafe<any[]>(
        `SELECT ft.type, SUM(ft.amount) as _sum FROM FiatTransaction ft
         WHERE ft.treeId = ? AND ft.createdById = ? AND ft.date >= ?
         GROUP BY ft.type`,
        tree.id, userId, lastMonth
      );
      const personalIncome = Number(personalFiatStats.find((s: any) => s.type === 'INCOME')?._sum) || 0;
      const personalExpense = Number(personalFiatStats.find((s: any) => s.type === 'EXPENSE')?._sum) || 0;

      // $queryRaw: SatisfactionRating personal + PhaseDeliverable + Branch join
      const personalSatisfactions = await prisma.$queryRawUnsafe<any[]>(
        `SELECT sr.rating FROM SatisfactionRating sr
         JOIN PhaseDeliverable pd ON sr.deliverableId = pd.id
         JOIN Branch b ON pd.branchId = b.id
         WHERE sr.userId = ? AND b.treeId = ?`,
        userId, tree.id
      );
      const personalSatisfactionAvg = personalSatisfactions.length > 0
        ? (personalSatisfactions.reduce((acc, r) => acc + r.rating, 0) / personalSatisfactions.length) / 20
        : null;

      // --- HISTORY (For Chart) ---
      const history = {
        '1D': await calculateTreeHistory(tree.id, userId, '1D'),
        '1S': await calculateTreeHistory(tree.id, userId, '1S'),
        '1M': await calculateTreeHistory(tree.id, userId, '1M'),
        '1A': await calculateTreeHistory(tree.id, userId, '1A'),
      };

      // --- TREE RELATIONS (Federations) ---
      const treeRelations = await prisma.treeRelation.findMany({
        where: {
          OR: [
            { sourceTreeId: tree.id },
            { targetTreeId: tree.id }
          ]
        },
        include: {
          sourceTree: { select: { id: true, name: true } },
          targetTree: { select: { id: true, name: true } }
        }
      });

      return {
        ...tree,
        role: m.role,
        healthData: {
          fiatMonthlyProfit: groupIncome - groupExpense,
          inversionPct: Number(inversionPct.toFixed(1)),
          satisfaction: groupSatisfactionAvg !== null ? Number(groupSatisfactionAvg.toFixed(1)) : null
        },
        personalHealthData: {
          fiatMonthlyProfit: personalIncome - personalExpense,
          inversionPct: Number(inversionPct.toFixed(1)), // same tree-level metric for personal view
          satisfaction: personalSatisfactionAvg !== null ? Number(personalSatisfactionAvg.toFixed(1)) : null
        },
        treeRelations: treeRelations.map(tr => ({
          id: tr.id,
          sourceTreeId: tr.sourceTreeId,
          targetTreeId: tr.targetTreeId,
          sourceTreeName: tr.sourceTree.name,
          targetTreeName: tr.targetTree.name,
          relationType: tr.relationType,
          socialDistanceCategory: tr.socialDistanceCategory,
        })),
        history
      };
    }));
    
    res.json(enrichedTrees);
  } catch (error) {
    console.error('[getMyTrees Error]:', error);
    res.status(500).json({ error: 'Failed to fetch trees' });
  }
};

export const getGlobalTrees = async (req: any, res: Response) => {
  try {
    const userId = req.user.id;
    
    // Find trees the user is NOT a member of, and are public
    const globalTreesList = await prisma.tree.findMany({
      where: { 
         visibility: 'PUBLIC',
         members: {
            none: { userId }
         }
      },
      include: { _count: { select: { members: true } } },
      take: 50 // Limit to avoid massive payload
    });

    const enrichedGlobal = await Promise.all(globalTreesList.map(async (tree: any) => {
      const lastMonth = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

      const groupStats = await prisma.$queryRawUnsafe<any[]>(
        `SELECT ft.type, SUM(ft.amount) as _sum FROM FiatTransaction ft
         WHERE ft.treeId = ? AND ft.date >= ?
         GROUP BY ft.type`,
        tree.id, lastMonth
      );

      const groupIncome = Number(groupStats.find((s: any) => s.type === 'INCOME')?._sum) || 0;
      const groupExpense = Number(groupStats.find((s: any) => s.type === 'EXPENSE')?._sum) || 0;

      // --- INVERSION %: Active FIAT promises / Total historical INCOME * 100 ---
      // $queryRaw: PromiseP2P + Task + Branch join (model removed)
      const [activeFiatPromisesG, historicalIncomeStatsG] = await Promise.all([
        prisma.$queryRawUnsafe<any[]>(
          `SELECT SUM(pp.amount) as _sum FROM PromiseP2P pp
           JOIN Task t ON pp.taskId = t.id
           JOIN Branch b ON t.branchId = b.id
           WHERE pp.currencyType = 'FIAT'
             AND pp.status IN ('PENDING', 'PAYMENT_SENT')
             AND b.treeId = ?`,
          tree.id
        ),
        prisma.$queryRawUnsafe<any[]>(
          `SELECT SUM(ft.amount) as _sum FROM FiatTransaction ft
           WHERE ft.treeId = ? AND ft.type = 'INCOME'`,
          tree.id
        )
      ]);
      const totalFiatPromisesG = Number(activeFiatPromisesG[0]?._sum) || 0;
      const totalHistoricalCapitalG = Number(historicalIncomeStatsG[0]?._sum) || 0;
      const inversionPctG = totalHistoricalCapitalG > 0
        ? Math.min(100, (totalFiatPromisesG / totalHistoricalCapitalG) * 100)
        : 0;

      // $queryRaw: SatisfactionRating + PhaseDeliverable + Branch join
      const groupSatisfactions = await prisma.$queryRawUnsafe<any[]>(
        `SELECT sr.rating FROM SatisfactionRating sr
         JOIN PhaseDeliverable pd ON sr.deliverableId = pd.id
         JOIN Branch b ON pd.branchId = b.id
         WHERE b.treeId = ?`,
        tree.id
      );
      const groupSatisfactionAvg = groupSatisfactions.length > 0
        ? (groupSatisfactions.reduce((acc, r) => acc + r.rating, 0) / groupSatisfactions.length) / 20
        : null;

      // Fill empty personal data and history to match the interface of MyTreesList components
      return {
        ...tree,
        isGlobal: true,
        healthData: {
          fiatMonthlyProfit: groupIncome - groupExpense,
          inversionPct: Number(inversionPctG.toFixed(1)),
          satisfaction: groupSatisfactionAvg !== null ? Number(groupSatisfactionAvg.toFixed(1)) : null
        },
        personalHealthData: { fiatMonthlyProfit: 0, inversionPct: 0, satisfaction: null },
        history: { '1D': [], '1S': [], '1M': [], '1A': [] }
      };
    }));

    res.json(enrichedGlobal);
  } catch (error) {
    console.error('[getGlobalTrees Error]:', error);
    res.status(500).json({ error: 'Failed to fetch global trees' });
  }
};

export const getTreeMembers = async (req: any, res: Response) => {
  try {
    const { id } = req.params;
    const requesterId = req.user?.id;

    const tree = await prisma.tree.findUnique({ where: { id } });
    if (!tree) return res.status(404).json({ error: 'Tree not found' });
    
    if (tree.visibility === 'PRIVATE') {
      if (!requesterId) return res.status(401).json({ error: 'Authentication required for private trees' });
      const membership = await prisma.treeMember.findUnique({
        where: { userId_treeId: { userId: requesterId, treeId: id } }
      });
      if (!membership) return res.status(403).json({ error: 'Access denied' });
    }
    
    const members = await prisma.treeMember.findMany({
      where: { treeId: id },
      include: { 
        user: { 
          select: { id: true, username: true, role: true, memberships: { include: { tree: true } } } 
        },
        invitedBy: {
          select: { username: true }
        }
      }
    });

    // Helper to check authority recursively for FE
    const checkAuthority = async (targetUserId: string, invitedById: string | null) => {
      if (!requesterId) return false;
      if (tree.creatorId === requesterId) return true;
      if (targetUserId === requesterId) return false;
      
      let cur = invitedById;
      while (cur) {
        if (cur === requesterId) return true;
        const parent = await prisma.treeMember.findUnique({
          where: { userId_treeId: { userId: cur, treeId: id } }
        });
        cur = parent?.invitedById || null;
      }
      return false;
    };

    const formatted = await Promise.all(members.map(async (m: any) => ({
      userId: m.user.id,
      username: m.user.username,
      level: m.level,
      xp: m.xp,
      status: m.status,
      availableNeedPoints: m.availableNeedPoints,
      invitedById: m.invitedById,
      invitedByUsername: m.invitedBy?.username || null,
      joinedAt: m.joinedAt,
      isCreator: tree.creatorId === m.user.id,
      canRemove: await checkAuthority(m.user.id, m.invitedById),
      otherTrees: m.user.memberships.map((userMem: any) => ({
        id: userMem.tree.id,
        name: userMem.tree.name
      }))
    })));

    res.json(formatted);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch tree members' });
  }
};

export const getTree = async (req: any, res: Response) => {
  try {
    const id = req.params.id as string;
    const requesterId = req.user?.id;
    const tree = await prisma.tree.findUnique({
      where: { id },
      include: {
        _count: { select: { members: true, needLinks: true } }
      }
    });

    if (!tree) {
      return res.status(404).json({ error: 'Tree not found' });
    }

    if (tree.visibility === 'PRIVATE') {
      if (!requesterId) return res.status(401).json({ error: 'Authentication required for private trees' });
      const membership = await prisma.treeMember.findUnique({
        where: { userId_treeId: { userId: requesterId, treeId: id } }
      });
      if (!membership) return res.status(403).json({ error: 'Access denied' });
    }

    // --- ZONAL BROADCAST EVALUATION (LAZY) ---
    const now = new Date();
    const treeAny = tree as any;
    const activeAlerts = await (prisma as any).alertaZonal.findMany({
      where: {
        expiresAt: { gt: now },
        OR: [
          { scope: 'PAIS', targetLocation: treeAny.country || "_INVALID" },
          { scope: 'CIUDAD', targetLocation: treeAny.city || "_INVALID" },
          { scope: 'SECTOR', targetLocation: treeAny.sector || "_INVALID" }
        ]
      }
    });

    if (activeAlerts.length > 0) {
      treeAny.modoCrisis = true; // Override volatil (frontend interceptor)
      const newSubjects = activeAlerts.map((a: any) => a.hashtag);
      let existingSubjects: string[] = JSON.parse(treeAny.crisisSubjects || "[]");
      const combined = Array.from(new Set([...existingSubjects, ...newSubjects]));
      treeAny.crisisSubjects = JSON.stringify(combined);

      const maxExp = new Date(Math.max(...activeAlerts.map((a: any) => new Date(a.expiresAt).getTime())));
      if (!treeAny.crisisExpiresAt || maxExp > new Date(treeAny.crisisExpiresAt)) {
         treeAny.crisisExpiresAt = maxExp;
      }
    }
    // ------------------------------------------

    // Calculate health metrics with total resilience
    let healthData = {
      fiatIncome: 0,
      fiatExpense: 0,
      satisfactionAverage: 4.5 as number | null,
      estimatedWeeks: 1
    };

    try {
      const ninetyDaysAgo = new Date();
      ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

      // fiatTransaction model was deleted (TM1-TM6)
      const income = 0;
      const expense = 0;

      const satisfactionRatings = await prisma.$queryRawUnsafe<any[]>(
        `SELECT sr.rating FROM SatisfactionRating sr
         JOIN PhaseDeliverable pd ON sr.deliverableId = pd.id
         JOIN Branch b ON pd.branchId = b.id
         WHERE b.treeId = ?`,
        id
      );

      const satisfactionAvg = satisfactionRatings.length > 0
        ? (satisfactionRatings.reduce((acc, r) => acc + r.rating, 0) / satisfactionRatings.length) / 20
        : null; // null means no data yet

      const pendingTasksCount = await prisma.task.count({
        where: { 
          status: { not: 'COMPLETED' },
          branch: { treeId: id }
        }
      });

      const completedTasksLastMonth = await prisma.task.count({
        where: {
          status: 'COMPLETED',
          branch: { treeId: id },
          createdAt: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) }
        }
      });

      const weeklyVelocity = Math.max(completedTasksLastMonth / 4, 1);
      const estimatedWeeks = Math.ceil(pendingTasksCount / weeklyVelocity) || 1;

      healthData = {
        fiatIncome: income,
        fiatExpense: expense,
        satisfactionAverage: satisfactionAvg !== null ? Number(satisfactionAvg.toFixed(1)) : null,
        estimatedWeeks: Number(estimatedWeeks)
      };
    } catch (healthError) {
      console.error('Error calculating health data:', healthError);
      // fallback to defaults already in healthData
    }

    res.json({ ...tree, healthData });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch tree' });
  }
};

export const updateMemberPower = async (req: any, res: Response) => {
  try {
    const { id, userId } = req.params;
    const { points } = req.body;
    const requesterId = req.user.id;

    const tree = await prisma.tree.findUnique({ where: { id } });
    if (!tree) return res.status(404).json({ error: 'Tree not found' });

    if (tree.creatorId !== requesterId) {
      return res.status(403).json({ error: 'Solo el administrador puede asignar poder' });
    }

    const membership = await prisma.treeMember.update({
      where: { userId_treeId: { userId, treeId: id } },
      data: { availableNeedPoints: Number(points) }
    });

    void logEvent({
      ...getRequestContext(req),
      treeId: id,
      action: 'TREE_MEMBER_ROLE_CHANGED',
      entityType: 'TreeMember',
      entityId: membership.id,
      afterJson: { userId, availableNeedPoints: membership.availableNeedPoints },
      metadataJson: getRequestMetadata(req, { changedField: 'availableNeedPoints', result: 'success' }),
      source: 'ADMIN',
    });

    res.json(membership);
  } catch (error) {
    res.status(500).json({ error: 'Failed to update member power' });
  }
};

export const getNetworkGraph = async (req: any, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: 'Authentication required for network graph' });
    let centerId = req.params.centerId;

    if (!centerId || centerId === 'default') {
      const firstMembership = await prisma.treeMember.findFirst({
        where: { userId }
      });
      if (!firstMembership) {
        return res.json({ nodes: [], links: [] });
      }
      centerId = firstMembership.treeId;
    }

    const visitedTrees = new Set<string>();
    const treesToProcess = [{ id: centerId, depth: 0 }];
    
    const treeDataMap = new Map<string, any>(); 
    const treeMembersMap = new Map<string, Set<string>>(); 
    const linksMap = new Map<string, any>(); 

    const userMemberships = await prisma.treeMember.findMany({
      where: { userId }
    });
    const userTreeIds = new Set(userMemberships.map(m => m.treeId));

    while (treesToProcess.length > 0) {
      const current = treesToProcess.shift()!;
      if (visitedTrees.has(current.id)) continue;
      
      const tree = await prisma.tree.findUnique({
        where: { id: current.id },
        include: { members: { select: { userId: true } } }
      });
      
      if (!tree) continue;
      
      let isVisible = req.user.role === 'ADMINISTRATOR' || userTreeIds.has(tree.id);
      if (!isVisible && tree.settings) {
         try {
           const settings = JSON.parse(tree.settings);
           if (settings.governance?.isPublic) isVisible = true;
         } catch(e){}
      }
      
      if (!isVisible) {
        if (current.depth === 0) {
          return res.status(403).json({ error: 'No tienes acceso a este entorno.' });
        }
        visitedTrees.add(current.id);
        continue;
      }

      visitedTrees.add(current.id);

      const memberIds = new Set(tree.members.map(m => m.userId));
      treeMembersMap.set(tree.id, memberIds);
      treeDataMap.set(tree.id, {
        id: tree.id,
        name: tree.name,
        val: memberIds.size, 
        isCenter: tree.id === centerId,
        hopDistance: current.depth,
        isMember: userTreeIds.has(tree.id)
      });

      if (current.depth < 2) {
         const sharedTrees = await prisma.treeMember.findMany({
           where: {
             userId: { in: Array.from(memberIds) },
             treeId: { not: tree.id }
           },
           select: { treeId: true, userId: true }
         });

         const sharedUsersByTree = new Map<string, Set<string>>();
         for (const st of sharedTrees) {
           if (!sharedUsersByTree.has(st.treeId)) sharedUsersByTree.set(st.treeId, new Set());
           sharedUsersByTree.get(st.treeId)!.add(st.userId);
         }

         for (const [otherTreeId, sharedUsers] of sharedUsersByTree.entries()) {
           if (!visitedTrees.has(otherTreeId)) {
             treesToProcess.push({ id: otherTreeId, depth: current.depth + 1 });
           }

           const linkId = [tree.id, otherTreeId].sort().join('-');
           if (!linksMap.has(linkId)) {
              linksMap.set(linkId, {
                source: tree.id,
                target: otherTreeId,
                value: sharedUsers.size,
                sharedPercentage: (sharedUsers.size / memberIds.size) * 100
              });
           }
         }
      }
    }

    const validLinks = Array.from(linksMap.values()).filter(l => treeDataMap.has(l.source) && treeDataMap.has(l.target));

    res.json({
      nodes: Array.from(treeDataMap.values()),
      links: validLinks
    });

  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to generate network graph' });
  }
};

export const getPendingEvidence = async (req: any, res: Response) => {
  try {
    const { id } = req.params;
    
    // Check if requester is VERIFIED in this tree
    const membership = await prisma.treeMember.findUnique({
      where: { userId_treeId: { userId: req.user.id, treeId: id } }
    });
    if (!membership || membership.status !== 'VERIFIED') {
      return res.status(403).json({ error: 'Debes ser un miembro Verificado para ver evidencias pendientes' });
    }

    // Get all tasks with evidenceStatus PENDING in this tree
    const pendingTasks = await prisma.task.findMany({
      where: {
        evidenceStatus: 'PENDING',
        branch: { idea: { need: { treeLinks: { some: { treeId: id } } } } }
      },
      include: {
        branch: { select: { id: true, idea: { select: { title: true } } } }
      }
    });

    res.json(pendingTasks);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch pending evidence' });
  }
};

export const toggleCrisisMode = async (req: Request, res: Response) => {
  try {
    const treeId = req.params.id as string;
    const userId = req.user!.id;
    const { subjects } = req.body; // Array de hashtags opcionales

    const tree = await (prisma as any).tree.findUnique({ where: { id: treeId } });
    if (!tree) return res.status(404).json({ error: 'Tree not found' });
    
    const member = await (prisma as any).treeMember.findUnique({ where: { userId_treeId: { userId, treeId } } });
    if (tree.creatorId !== userId && member?.role !== 'ADMIN') {
       return res.status(403).json({ error: 'Forbidden. Solamente el Creador o Administradores pueden activar el Modo Crisis.' });
    }

    const nextMode = !tree.modoCrisis;
    let newExpiresAt = null;
    let newSubjects = "[]";

    if (nextMode) {
      const ttl = new Date();
      ttl.setHours(ttl.getHours() + 24); // 24hs auto-apagado
      newExpiresAt = ttl;
      if (subjects && Array.isArray(subjects)) {
        newSubjects = JSON.stringify(subjects);
      }
    }

    const updated = await (prisma as any).tree.update({
      where: { id: treeId },
      data: { 
        modoCrisis: nextMode,
        crisisExpiresAt: newExpiresAt,
        crisisSubjects: newSubjects
      }
    });

    res.json({ 
      modoCrisis: updated.modoCrisis, 
      crisisSubjects: JSON.parse(updated.crisisSubjects),
      crisisExpiresAt: updated.crisisExpiresAt
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to toggle crisis mode' });
  }
};

export const broadcastCrisisSignal = async (req: Request, res: Response) => {
  try {
    const senderTreeId = req.params.id as string;
    const userId = req.user!.id;
    const { hashtag, severity, scope, targetLocation } = req.body;

    // Check sender auth
    const senderMember = await (prisma as any).treeMember.findUnique({ where: { userId_treeId: { userId, treeId: senderTreeId } } });
    const senderTree = await (prisma as any).tree.findUnique({ where: { id: senderTreeId } });
    
    if (!senderTree || (senderTree.creatorId !== userId && senderMember?.role !== 'ADMIN')) {
       return res.status(403).json({ error: 'Forbidden. You do not own the broadcaster tree.' });
    }

    if (!hashtag || !scope || !targetLocation) {
        return res.status(400).json({ error: 'Debes declarar el Hashtag, el Scope y el TargetLocation.' });
    }

    const tomorrow = new Date();
    tomorrow.setHours(tomorrow.getHours() + 24);

    const alerta = await (prisma as any).alertaZonal.create({
      data: {
        emisorId: senderTreeId,
        hashtag: hashtag,
        gravedad: severity || 1,
        scope: scope,              // PAIS, CIUDAD, SECTOR
        targetLocation: targetLocation,
        expiresAt: tomorrow
      }
    });

    res.json({ message: 'Zonal Broadcast successful.', alerta });
  } catch (err) {
    res.status(500).json({ error: 'Failed to broadcast crisis' });
  }
};

// ── AI Council: updateTree ────────────────────────────────────────────

export const updateTree = async (req: any, res: Response) => {
  try {
    const tree = await prisma.tree.findUnique({ where: { id: req.params.id } });
    if (!tree) return res.status(404).json({ error: 'Tree not found' });
    if (tree.creatorId !== req.user.id) return res.status(403).json({ error: 'Only tree creator can update' });

    if (tree.treeType === 'AI_COUNCIL') {
      const blockedFields = [
        'visibility', 'admissionPolicy', 'hashtagCreationPolicy',
        'economyMode', 'creacionRamaComunitaria', 'allowTraditionalBranches',
        'allowHashtags', 'treeType',
      ];
      const attempted = Object.keys(req.body).filter(k => blockedFields.includes(k));
      if (attempted.length > 0) {
        return res.status(403).json({
          error: `AI Council trees cannot modify: ${attempted.join(', ')}`,
          blockedFields: attempted,
        });
      }
    }

    const allowed = ['name', 'icono', 'description'];
    const data: any = {};
    for (const k of Object.keys(req.body)) {
      if (allowed.includes(k)) data[k] = req.body[k];
    }

    const updated = await prisma.tree.update({ where: { id: req.params.id }, data });
    res.json(updated);
  } catch (error: any) {
    console.error('[updateTree] ERROR:', error?.message || error);
    res.status(500).json({ error: 'Failed to update tree', detail: error?.message || String(error) });
  }
};

// ── AI Council: inviteAI ──────────────────────────────────────────────

export const inviteAI = async (req: any, res: Response) => {
  try {
    const treeId = req.params.id;
    const { userId } = req.body;

    const tree = await prisma.tree.findUnique({ where: { id: treeId } });
    if (!tree) return res.status(404).json({ error: 'Tree not found' });
    if (tree.treeType !== 'AI_COUNCIL') return res.status(400).json({ error: 'Only AI_COUNCIL trees can invite AI members' });
    if (tree.creatorId !== req.user.id) return res.status(403).json({ error: 'Only tree creator can invite AI members' });

    // Verify target user exists and has AIMemberConfig
    const targetUser = await prisma.user.findUnique({ where: { id: userId } });
    if (!targetUser) return res.status(404).json({ error: 'Target user not found' });

    // Check not already a member
    const existing = await prisma.treeMember.findUnique({
      where: { userId_treeId: { userId, treeId } },
    });
    if (existing) return res.status(409).json({ error: 'User is already a member of this tree' });

    // Create AI member — AIMemberConfig will be created separately
    const member = await prisma.treeMember.create({
      data: {
        userId,
        treeId,
        isAI: true,
        invitedById: req.user.id,
        status: 'VERIFIED',
      },
    } as any);

    void logEvent({
      ...getRequestContext(req),
      treeId,
      action: 'AI_MEMBER_INVITED',
      entityType: 'TreeMember',
      entityId: member.id,
      afterJson: { userId, treeId, isAI: true },
      metadataJson: getRequestMetadata(req, { result: 'success' }),
      source: 'USER',
    });

    res.status(201).json(member);
  } catch (error: any) {
    console.error('[inviteAI] ERROR:', error?.message || error);
    res.status(500).json({ error: 'Failed to invite AI member', detail: error?.message || String(error) });
  }
};
