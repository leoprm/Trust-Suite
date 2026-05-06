import { Router } from 'express';
import { getContacts, addContact, removeContact, generateToken, connectViaToken } from '../controllers/contactController';
import { authenticateJWT } from '../middleware/authMiddleware';

const router = Router();

router.use(authenticateJWT);

router.get('/', getContacts);
router.post('/add', addContact);
router.post('/token', generateToken);
router.post('/connect', connectViaToken);
router.delete('/:id', removeContact);

export default router;
