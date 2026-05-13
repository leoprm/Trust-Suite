import { Request, Response } from 'express';
import { prisma } from '../index';
import bcrypt from 'bcryptjs';
import { getCurrentCost } from '../services/billingService';
import { getRequestContext, getRequestMetadata, logEvent } from '../services/eventLogService';

const handleAdminError = (res: Response, error: any) => {
  console.error('[Admin Error]', error);
  res.status(500).json({ error: 'Admin operation failed' });
};

// ========================
// STATS
// ========================
export const getAdminStats = async (req: Request, res: Response) => {
  try {
    // Active users (VERIFIED members)
    const sixtyDaysAgo = new Date(Date.now() - 60 * 86400000);
    const activeMemberRows = await prisma.treeMember.findMany({
      where: {
        status: 'VERIFIED',
        OR: [
          { joinedAt: { gte: sixtyDaysAgo } },
          { xp: { gt: 0 } },
        ],
      },
      select: { userId: true },
      distinct: ['userId'],
    });
    const activeUsers = activeMemberRows.length;

    // Registered IAs
    const registeredIAs = (await prisma.userAI.count()) + (await prisma.modelRegistry.count());

    // Monthly cost
    let monthlyCost = 0;
    try {
      const costResult = await getCurrentCost();
      monthlyCost = costResult?.monthlyCost ?? 0;
    } catch (e) { /* ignore cost errors */ }

    // Completed tasks
    const completedTasks = await prisma.task.count({
      where: { status: 'COMPLETED' },
    });

    // Total users (all roles)
    const totalUsers = await prisma.user.count();

    // Users with subscription details
    const users = await prisma.user.findMany({
      select: {
        id: true,
        username: true,
        email: true,
        role: true,
        subscriptionActive: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });
    const userSubscriptions = await prisma.userSubscription.findMany({
      select: { userId: true, status: true, monthlyCost: true, currentPeriodEnd: true },
    });
    const subMap = new Map(userSubscriptions.map(s => [s.userId, s]));

    const usersWithSub = users.map(u => ({
      ...u,
      subscription: subMap.has(u.id) ? subMap.get(u.id) : null,
    }));

    // Monthly task completion trend (last 6 months)
    const sixMonthsAgo = new Date(Date.now() - 180 * 86400000);
    const completedInLast6m = await prisma.task.findMany({
      where: { status: 'COMPLETED', completedAt: { gte: sixMonthsAgo } },
      select: { completedAt: true },
    });
    const monthMap: Record<string, number> = {};
    for (let i = 5; i >= 0; i--) {
      const d = new Date(Date.now() - i * 30 * 86400000);
      const key = d.toLocaleString('es-CL', { month: 'short', year: '2-digit' });
      monthMap[key] = 0;
    }
    for (const t of completedInLast6m) {
      if (!t.completedAt) continue;
      const d = new Date(t.completedAt);
      const key = d.toLocaleString('es-CL', { month: 'short', year: '2-digit' });
      if (monthMap[key] !== undefined) monthMap[key]++;
    }
    const monthlyTasks = Object.entries(monthMap).map(([name, count]) => ({ name, count }));

    res.json({
      activeUsers,
      registeredIAs,
      monthlyCost,
      completedTasks,
      totalUsers,
      users: usersWithSub,
      monthlyTasks,
    });
  } catch (error) {
    console.error('[Admin Stats Error]', error);
    res.status(500).json({ error: 'Failed to fetch admin stats' });
  }
};

// ========================
// USERS
// ========================
export const createUser = async (req: Request, res: Response) => {
  try {
    const { username, email, password, role } = req.body;
    const hashedPassword = await bcrypt.hash(password, 10);
    const newUser = await prisma.user.create({
      data: {
        username,
        email,
        password: hashedPassword,
        role: role || 'PERSON',
      },
      select: { id: true, username: true, email: true, role: true }
    });
    res.status(201).json({ user: newUser });

    void logEvent({
      ...getRequestContext(req),
      actorId: req.user!.id,
      action: 'ADMIN_USER_CREATED',
      entityType: 'User',
      entityId: newUser.id,
      metadataJson: getRequestMetadata(req, { createdUsername: newUser.username }),
      severity: 'WARNING',
      source: 'ADMIN',
    });
  } catch (error: any) { handleAdminError(res, error); }
};

export const getUsers = async (req: Request, res: Response) => {
  try {
    const users = await prisma.user.findMany({
      select: { id: true, username: true, email: true, role: true, createdAt: true }
    });
    res.json(users);
  } catch (error) { handleAdminError(res, error); }
};

export const updateUser = async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const { username, email, role, password } = req.body;
    
    let updateData: any = { username, email, role };
    
    if (password) {
      updateData.password = await bcrypt.hash(password, 10);
    }
    
    const user = await prisma.user.update({
      where: { id },
      data: updateData,
      select: { id: true, username: true, email: true, role: true }
    });
    
    res.json(user);
  } catch (error) { handleAdminError(res, error); }
};

export const deleteUser = async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    await prisma.user.delete({ where: { id } });
    res.json({ message: 'User deleted' });

    void logEvent({
      ...getRequestContext(req),
      actorId: req.user!.id,
      action: 'ADMIN_USER_DELETED',
      entityType: 'User',
      entityId: req.params.id as string,
      severity: 'CRITICAL',
      source: 'ADMIN',
    });
  } catch (error) { handleAdminError(res, error); }
};

// ========================
// TREES
// ========================
export const createTree = async (req: Request, res: Response) => {
  try {
    const { name, description } = req.body;
    const inviteCode = Math.random().toString(36).substring(2, 8).toUpperCase();
    const tree = await prisma.tree.create({
      data: { name, description, inviteCode, capacidades: '', crisisSubjects: '' } as any
    });
    res.status(201).json(tree);
  } catch (error) { handleAdminError(res, error); }
};

export const getTrees = async (req: Request, res: Response) => {
  try {
    const trees = await prisma.tree.findMany({
      include: {
        _count: { select: { members: true, needLinks: true } }
      }
    });
    res.json(trees);
  } catch (error) { handleAdminError(res, error); }
};

export const updateTree = async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const { name, description } = req.body;
    const tree = await prisma.tree.update({
      where: { id },
      data: { name, description }
    });
    res.json(tree);
  } catch (error) { handleAdminError(res, error); }
};

export const deleteTree = async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    await prisma.tree.delete({ where: { id } });
    res.json({ message: 'Tree deleted' });

    void logEvent({
      ...getRequestContext(req),
      actorId: req.user!.id,
      action: 'ADMIN_TREE_DELETED',
      entityType: 'Tree',
      entityId: req.params.id as string,
      severity: 'CRITICAL',
      source: 'ADMIN',
    });
  } catch (error) { handleAdminError(res, error); }
};

// ========================
// NEEDS
// ========================
export const createNeed = async (req: Request, res: Response) => {
  try {
    const { title, description, creatorId } = req.body;
    const need = await prisma.need.create({
      data: { title, description, creatorId }
    });
    res.status(201).json(need);
  } catch (error) { handleAdminError(res, error); }
};

export const getNeeds = async (req: Request, res: Response) => {
  try {
    const needs = await prisma.need.findMany({
      include: { creator: { select: { username: true } } }
    });
    res.json(needs);
  } catch (error) { handleAdminError(res, error); }
};

export const updateNeed = async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const { title, description } = req.body;
    const need = await prisma.need.update({
      where: { id },
      data: { title, description }
    });
    res.json(need);
  } catch (error) { handleAdminError(res, error); }
};

export const deleteNeed = async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    await prisma.need.delete({ where: { id } });
    res.json({ message: 'Need deleted' });
  } catch (error) { handleAdminError(res, error); }
};

// ========================
// BRANCHES
// ========================

export const getBranches = async (req: Request, res: Response) => {
  try {
    const branches = await prisma.branch.findMany({
      include: { 
        idea: { select: { title: true } },
        _count: { select: { members: true, tasks: true, deliverables: true } }
      }
    });
    res.json(branches);
  } catch (error) { handleAdminError(res, error); }
};

export const updateBranch = async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const { phase, xpPool, currentPhaseIndex, bayasFund } = req.body;
    const branch = await prisma.branch.update({
      where: { id },
      data: { phase, xpPool: Number(xpPool), currentPhaseIndex: Number(currentPhaseIndex), bayasFund: Number(bayasFund) }
    });
    res.json(branch);
  } catch (error) { handleAdminError(res, error); }
};

export const deleteBranch = async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    await prisma.branch.delete({ where: { id } });
    res.json({ message: 'Branch deleted' });
  } catch (error) { handleAdminError(res, error); }
};

// ========================
// PHASE DELIVERABLES
// ========================

export const getDeliverables = async (req: Request, res: Response) => {
  try {
    const deliverables = await prisma.phaseDeliverable.findMany({
      include: {
        branch: { select: { idea: { select: { title: true } } } },
        _count: { select: { ratings: true } }
      }
    });
    res.json(deliverables);
  } catch (error) { handleAdminError(res, error); }
};

export const updateDeliverable = async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const { status, deliverableUrl } = req.body;
    const deliverable = await prisma.phaseDeliverable.update({
      where: { id },
      data: { status, deliverableUrl }
    });
    res.json(deliverable);
  } catch (error) { handleAdminError(res, error); }
};

export const deleteDeliverable = async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    await prisma.phaseDeliverable.delete({ where: { id } });
    res.json({ message: 'Deliverable deleted' });
  } catch (error) { handleAdminError(res, error); }
};
