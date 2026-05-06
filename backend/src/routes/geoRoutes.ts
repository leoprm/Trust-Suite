import { Router } from 'express';
import { discoverTrees, getHotspotDensity } from '../controllers/mapController';
import { connectTrees } from '../controllers/peeringController';

const router = Router();

// Mapa Terrestre
router.get('/discovery', discoverTrees);
router.get('/density', getHotspotDensity);

// Relaciones Territoriales
router.post('/peering/connect', connectTrees);

export default router;
