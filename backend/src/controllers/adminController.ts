import { Request, Response } from 'express';
import { prisma } from '../index';
import bcrypt from 'bcryptjs';

const handleAdminError = (res: Response, error: any) => {
  console.error('[Admin Error]', error);
  res.status(500).json({ error: 'Admin operation failed' });
};

// ========================
// USERS
// ========================
export const createUser = async (req: Request, res: Response) => {
  try {
    const { username, email, password, role } = req.body;
    const hashedPassword = await bcrypt.hash(password, 10);
    const user = await prisma.user.create({
      data: {
        username,
        email,
        password: hashedPassword,
        role: role || 'PERSON',
      },
      select: { id: true, username: true, email: true, role: true }
    });
    res.status(201).json(user);
  } catch (error) { handleAdminError(res, error); }
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
      data: { name, description, inviteCode }
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
