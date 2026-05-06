import { Request, Response } from 'express';
import { prisma } from '../index';

export const getTemplates = async (req: Request, res: Response) => {
  try {
    const { treeId } = req.params;
    const templates = await (prisma as any).fiatTemplate.findMany({
      where: { treeId },
      orderBy: { createdAt: 'desc' }
    });
    res.json(templates);
  } catch (error: any) {
    console.error('[FiatTemplate] getTemplates:', error);
    res.status(500).json({ error: 'Failed to fetch templates' });
  }
};

export const deleteTemplate = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    await (prisma as any).fiatTemplate.delete({
      where: { id }
    });
    res.status(204).send();
  } catch (error: any) {
    console.error('[FiatTemplate] deleteTemplate:', error);
    res.status(500).json({ error: 'Failed to delete template' });
  }
};
