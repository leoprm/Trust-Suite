import { Router } from 'express';
import { searchSpecialists, purchaseSearchPass, getAccessStatus, getFilterOptions, sendInvitation, getInvitations, respondInvitation } from '../controllers/recruitmentController';
import { authenticateJWT } from '../middleware/authMiddleware';

const router = Router();

router.use(authenticateJWT);

router.get('/search', searchSpecialists);
router.get('/access-status', getAccessStatus);
router.get('/filters', getFilterOptions);
router.post('/purchase-pass', purchaseSearchPass);
router.post('/invite', sendInvitation);
router.get('/invitations', getInvitations);
router.post('/invitations/:id/respond', respondInvitation);

export default router;
