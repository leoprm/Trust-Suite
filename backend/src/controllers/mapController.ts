import { Request, Response } from 'express';
import { prisma } from '../index';

function calculateHaversineDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371; // km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

// Generador de ruido de 200m
function addLocationNoise(lat: number, lng: number) {
  const r = 0.0018 * Math.sqrt(Math.random());
  const theta = Math.random() * 2 * Math.PI;
  return {
    obfuscatedLat: lat + r * Math.cos(theta),
    obfuscatedLng: lng + r * Math.sin(theta)
  };
}

export const discoverTrees = async (req: Request, res: Response) => {
  try {
    const { country, city, sector, hashtag, global, userLat, userLng } = req.query as Record<string, string>;
    
    const where: any = { visibility: 'PUBLIC' };
    
    // Filtro Global vs Local
    if (global !== 'true') {
      if (country) where.country = country; // Ignora árboles de otro país a menos que busque global
    }

    if (hashtag) {
      // Filtrar aquellos que contengan la necesidad en hashtag o en needs
      where.OR = [
        { branches: { some: { name: { contains: hashtag } } } },
        { needLinks: { some: { need: { tags: { some: { skillName: { contains: hashtag } } } } } } }
      ];
    }
    
    const trees = await (prisma as any).tree.findMany({
      where,
      include: {
        branches: { where: { isHashtag: true } }
      }
    });

    let sortedTrees = trees;

    if (userLat && userLng) {
      // Ordenamiento por distancia física real (Haversine)
      const uLat = parseFloat(userLat);
      const uLon = parseFloat(userLng);
      sortedTrees.sort((a: any, b: any) => {
        let distA = Infinity; let distB = Infinity;
        if (a.latitude && a.longitude) distA = calculateHaversineDistance(uLat, uLon, a.latitude, a.longitude);
        if (b.latitude && b.longitude) distB = calculateHaversineDistance(uLat, uLon, b.latitude, b.longitude);
        return distA - distB;
      });
    } else {
      // Ordenamiento por Proximidad Social Estricta (Nombres)
      sortedTrees.sort((a: any, b: any) => {
        let scoreA = 0; let scoreB = 0;
        if (a.sector === sector && a.sector) scoreA += 30;
        else if (a.city === city && a.city) scoreA += 20;
        else if (a.country === country && a.country) scoreA += 10;

        if (b.sector === sector && b.sector) scoreB += 30;
        else if (b.city === city && b.city) scoreB += 20;
        else if (b.country === country && b.country) scoreB += 10;

        return scoreB - scoreA;
      });
    }

    // Filtrado de Privacidad Geográfica
    const finalTrees = sortedTrees.map((tree: any) => {
      const safeTree = { ...tree };

      if (safeTree.locationPrivacy === 'OCULTA') {
        safeTree.latitude = null;
        safeTree.longitude = null;
        safeTree.direccionExacta = null;
      } else if (safeTree.locationPrivacy === 'SECTOR') {
        if (safeTree.latitude && safeTree.longitude) {
           const noise = addLocationNoise(safeTree.latitude, safeTree.longitude);
           safeTree.latitude = noise.obfuscatedLat;
           safeTree.longitude = noise.obfuscatedLng;
        }
        safeTree.direccionExacta = null;
      }
      return safeTree;
    });

    res.json(finalTrees);
  } catch (err) {
    console.error('[mapController] error:', err);
    res.status(500).json({ error: 'Error fetching discovery map' });
  }
};

export const getHotspotDensity = async (req: Request, res: Response) => {
  try {
    const { country, city } = req.query as Record<string, string>;
    
    const trees = await (prisma as any).tree.findMany({
      where: { country, city, NOT: { sector: null } },
      include: { branches: { where: { isHashtag: true } } }
    });

    const sectors: Record<string, { treeCount: number, hashtags: Set<string> }> = {};
    
    for (const tree of trees) {
      if (!tree.sector) continue;
      if (!sectors[tree.sector]) sectors[tree.sector] = { treeCount: 0, hashtags: new Set() };
      
      sectors[tree.sector].treeCount++;
      tree.branches.forEach((b: any) => {
        if (b.name) sectors[tree.sector!].hashtags.add(b.name);
      });
    }

    const heatMap = Object.entries(sectors).map(([sector, data]) => ({
      sector,
      treeDensity: data.treeCount,
      uniqueNeeds: Array.from(data.hashtags) // Vacíos de oferta = alta necesidad pero baja densidad
    }));

    res.json(heatMap);
  } catch (err) {
    res.status(500).json({ error: 'Error fetching density map' });
  }
}
