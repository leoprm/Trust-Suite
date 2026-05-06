import { Request, Response } from 'express';
import { prisma } from '../index';

export const connectTrees = async (req: Request, res: Response) => {
  try {
    const { sourceTreeId, targetTreeId, relationType } = req.body;

    if (sourceTreeId === targetTreeId) {
       return res.status(400).json({ error: 'Cannot connect a tree to itself.' });
    }

    const source = await (prisma as any).tree.findUnique({ where: { id: sourceTreeId } });
    const target = await (prisma as any).tree.findUnique({ where: { id: targetTreeId } });

    if (!source || !target) {
      return res.status(404).json({ error: 'Source or target tree not found' });
    }

    // Determine Social Distance Category
    let socialDistance = 'INTERNACIONAL';
    if (source.country === target.country && source.country) {
      socialDistance = 'CIUDAD_DIFERENTE';
      if (source.city === target.city && source.city) {
         socialDistance = 'MISMA_CIUDAD';
         if (source.sector === target.sector && source.sector) {
            socialDistance = 'MISMO_SECTOR';
         }
      }
    }

    // Logistic Constraint: Block physical exchange internationally
    if (relationType === 'LOGISTICA_FISICA' && socialDistance === 'INTERNACIONAL') {
      return res.status(409).json({
         error: 'Inviabilidad Logística: Choque internacional detectado. No se pueden cruzar recursos físicos de forma hiperlocal entre distintos países.'
      });
    }

    // Create Relation
    const relation = await (prisma as any).treeRelation.create({
      data: {
        sourceTreeId,
        targetTreeId,
        relationType,
        socialDistanceCategory: socialDistance
      }
    });

    res.status(201).json(relation);
  } catch (err) {
    console.error('[peeringController] error:', err);
    res.status(500).json({ error: 'Error bridging trees' });
  }
};
