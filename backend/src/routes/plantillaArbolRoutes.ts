import { Router } from 'express';
import { getPlantillas, createPlantilla, deletePlantilla } from '../controllers/plantillaArbolController';
import { authenticateJWT } from '../middleware/authMiddleware';

const router = Router();

// Todas las rutas requieren autenticación
router.use(authenticateJWT);

router.get('/', getPlantillas);
router.post('/', createPlantilla);
router.delete('/:id', deletePlantilla);

export default router;
