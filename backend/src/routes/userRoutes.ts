import { Router } from 'express';
import { getAllUsers, createUser, updateUser, deleteUser, getContacts, searchUsers, addContact, getProfile, uploadProfilePic, updatePublicProfile, getPublicProfile, getSkillStar } from '../controllers/userController';
import { authenticateJWT, optionalAuth, requireAdmin } from '../middleware/authMiddleware';
import { upload } from '../middleware/upload';

const router = Router();

// Public route — no auth
router.get('/public/:code', optionalAuth, getPublicProfile);

router.use(authenticateJWT);

// Profile (must be before /:id routes)
router.get('/profile', getProfile);
router.get('/skill-star', getSkillStar);
router.post('/profile-pic', upload.single('image'), uploadProfilePic);
router.put('/public-profile', updatePublicProfile);

// Publicly available to members
router.get('/search', searchUsers);
router.get('/contacts', getContacts);
router.post('/contacts', addContact);

// Admin only
router.get('/', requireAdmin, getAllUsers);
router.post('/', requireAdmin, createUser);
router.put('/:id', requireAdmin, updateUser);
router.delete('/:id', requireAdmin, deleteUser);

export default router;
