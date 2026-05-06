import { Request, Response } from 'express';
import { prisma } from '../index';

export const getSuggestedHashtags = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;
    const { sector, city } = req.query;

    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    // Encuentra todos los árboles en el sector dado
    const trees = await (prisma as any).tree.findMany({
      where: {
        OR: [
          { sector: sector as string },
          { city: city as string }
        ]
      },
      select: { id: true }
    });

    const treeIds = trees.map((t: any) => t.id);

    // Extrae y cuenta ramas hashtag activas recientes
    const branches = await (prisma as any).branch.findMany({
      where: {
        treeId: { in: treeIds },
        isHashtag: true,
        createdAt: { gte: thirtyDaysAgo },
        name: { not: null }
      },
      select: { name: true } // solo requerimos el nombre del hashtag
    });

    const counts: Record<string, number> = {};
    for (const b of branches) {
        if (b.name) counts[b.name] = (counts[b.name] || 0) + 1;
    }

    const sortedTags = Object.entries(counts)
      .sort((a, b) => b[1] - a[1]) // mayor frecuencia primero
      .slice(0, 10) // top 10
      .map(entry => ({ tag: entry[0], count: entry[1] }));

    res.json(sortedTags);
  } catch (error) {
    console.error('getSuggestedHashtags Error:', error);
    res.status(500).json({ error: 'Failed to fetch hashtags' });
  }
};

export const searchProviders = async (req: Request, res: Response) => {
  try {
    const { hashtag, sector, city } = req.query;
    
    if (!hashtag) return res.status(400).json({ error: 'Hashtag es obligatorio' });

    // Encuentra árboles con capacidad y que geográficamente coincidan
    // Las capacidades es un string JSON array, ej: '["#Agua", "#Luz"]'
    const trees = await (prisma as any).tree.findMany({
      where: {
        capacidades: {
          contains: hashtag as string
        },
        OR: [
            { sector: sector as string },
            { city: city as string }
        ]
      },
      include: {
        members: {
           where: { status: 'VERIFIED' },
           select: { xp: true }
        }
      }
    });

    // Enriquecemos calculando la XP total y marcando proximidad exacta
    const enriched = trees.map((tree: any) => {
       const treeXp = tree.members.reduce((acc: number, m: any) => acc + (m.xp || 0), 0);
       const exactMatch = tree.sector === sector;
       
       return {
         id: tree.id,
         name: tree.name,
         icono: tree.icono,
         sector: tree.sector,
         city: tree.city,
         treeXp: treeXp,
         exactMatch: exactMatch,
         locationPrivacy: tree.locationPrivacy,
         distanceScore: exactMatch ? 2 : 1 // Si el sector matchea exacto, vale más que la ciudad (2 vs 1)
       };
    });

    // Sort por distancia primero (exactMatch), luego por XP mayor
    enriched.sort((a: any, b: any) => {
      if (b.distanceScore !== a.distanceScore) {
          return b.distanceScore - a.distanceScore;
      }
      return b.treeXp - a.treeXp;
    });

    res.json(enriched);
  } catch (error) {
    console.error('searchProviders Error:', error);
    res.status(500).json({ error: 'Failed to search providers' });
  }
};

export const createRequestTask = async (req: Request, res: Response) => {
  try {
    const requesterId = (req as any).user.id;
    const { treeId, hashtag, description } = req.body;

    if (!treeId || !hashtag || !description) {
        return res.status(400).json({ error: 'Missing parameters.' });
    }

    const tree = await (prisma as any).tree.findUnique({ where: { id: treeId } });
    if (!tree) return res.status(404).json({ error: 'Provider tree not found.' });

    // 1. Verificar si el árbol ya tiene una Rama Hashtag con ese nombre
    let branch = await (prisma as any).branch.findFirst({
        where: {
            treeId: treeId,
            name: hashtag,
            isHashtag: true
        }
    });

    // Si no existe, creamos la rama express
    if (!branch) {
        branch = await (prisma as any).branch.create({
            data: {
                treeId: treeId,
                name: hashtag,
                isHashtag: true,
                esVotable: false,
                isDesire: false, // Es operativo
                userId: requesterId // El que hizo la primera petición "crea" la categoría
            }
        });
    }

    // 2. Insertar la nueva tarea en la Rama
    const task = await (prisma as any).task.create({
        data: {
            branchId: branch.id,
            name: `Solicitud: ${hashtag}`,
            description: description,
            status: 'OPEN'
        }
    });

    res.status(201).json({ message: 'Solicitud enviada', task });
  } catch (error) {
    console.error('createRequestTask Error:', error);
    res.status(500).json({ error: 'Failed to request task' });
  }
};
