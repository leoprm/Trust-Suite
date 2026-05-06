import { Router } from 'express';
import { authenticateJWT } from '../middleware/authMiddleware';
import {
  initiateMigration,
  recordTrialTask,
  getMyMigrations,
  getForeignStatus,
  getTreaties,
  getPretext,
} from '../controllers/migrationController';

const router = Router();

router.use(authenticateJWT);

// Initiate a skill migration
router.post('/initiate', initiateMigration);

// Record a trial task result for a migration in progress
router.post('/:id/record-task', recordTrialTask);

// Get current user's migrations
router.get('/my', getMyMigrations);

// Check if a user is a foreign specialist (for auditors)
router.get('/foreign-status/:userId', getForeignStatus);

// Get trust treaties for a tree
router.get('/treaties', getTreaties);

// Get human-readable pretext for a migration
router.get('/pretext/:migrationId', getPretext);

export default router;
