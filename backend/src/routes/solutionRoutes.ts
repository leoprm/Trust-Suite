import { Router, Request, Response } from 'express';
import { prisma } from '../index';

const router = Router();

// GET /api/solutions/search?q=agricultura+riego
router.get('/search', async (req: Request, res: Response) => {
  try {
    const query = (req.query.q as string) || '';

    if (!query.trim()) {
      return res.json({ solutions: [] });
    }

    const solutions = await prisma.solutionCatalog.findMany({
      where: {
        OR: [
          { title: { contains: query } },
          { description: { contains: query } },
          { keywords: { contains: query } },
        ],
      },
      include: {
        need: {
          select: {
            id: true,
            title: true,
            status: true,
          },
        },
        tree: {
          select: {
            id: true,
            name: true,
            icono: true,
          },
        },
      },
      orderBy: { publishedAt: 'desc' },
      take: 20,
    });

    res.json({ solutions });
  } catch (err: any) {
    console.error('[SolutionCatalog] search error:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
