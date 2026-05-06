import { Request, Response } from 'express';
import { prisma } from '../index';

export const getPlantillas = async (req: any, res: Response) => {
  try {
    const userId = req.user.id;
    const plantillas = await (prisma as any).plantillaArbol.findMany({
      where: {
        OR: [
          { esGlobal: true },
          { creadorId: userId }
        ]
      },
      orderBy: { createdAt: 'desc' },
      include: {
        creador: { select: { username: true, role: true } }
      }
    });
    res.json(plantillas);
  } catch (error) {
    console.error('getPlantillas Error:', error);
    res.status(500).json({ error: 'Failed to fetch plantillas' });
  }
};

export const createPlantilla = async (req: any, res: Response) => {
  try {
    const { nombre, descripcion, icono, configuracion, guardarComoGlobal } = req.body;
    const userId = req.user.id;

    // Check permissions if trying to save as global
    let esGlobal = false;
    if (guardarComoGlobal) {
      if (req.user.role !== 'ADMINISTRATOR') {
        return res.status(403).json({ error: 'Solo los administradores pueden crear plantillas globales.' });
      }
      esGlobal = true;
    }

    const newPlantilla = await (prisma as any).plantillaArbol.create({
      data: {
        nombre,
        descripcion,
        icono,
        configuracion: typeof configuracion === 'string' ? configuracion : JSON.stringify(configuracion),
        esGlobal,
        creadorId: userId
      }
    });

    res.status(201).json(newPlantilla);
  } catch (error) {
    console.error('createPlantilla Error:', error);
    res.status(500).json({ error: 'Failed to create plantilla' });
  }
};

export const deletePlantilla = async (req: any, res: Response) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const plantilla = await prisma.plantillaArbol.findUnique({ where: { id } });
    
    if (!plantilla) {
      return res.status(404).json({ error: 'Plantilla no encontrada' });
    }

    // Permission check
    if (plantilla.esGlobal) {
      if (req.user.role !== 'ADMINISTRATOR') {
        return res.status(403).json({ error: 'Solo los administradores pueden borrar plantillas globales.' });
      }
    } else {
      if (plantilla.creadorId !== userId && req.user.role !== 'ADMINISTRATOR') {
        return res.status(403).json({ error: 'No tienes permiso para borrar esta plantilla.' });
      }
    }

    await prisma.plantillaArbol.delete({ where: { id } });
    
    res.json({ message: 'Plantilla successfully deleted' });
  } catch (error) {
    console.error('deletePlantilla Error:', error);
    res.status(500).json({ error: 'Failed to delete plantilla' });
  }
};
