// Toy script: just load roleRoutes standalone
import { Router } from 'express';
import { recommendRoles, feedbackRoles } from './controllers/roleRecommendationController';

const router = Router();
router.post('/recommend', recommendRoles);
router.post('/feedback', recommendRoles); // No auth for this test

console.log('ROUTER OK:', typeof router);
console.log('STACK:', router.stack.map((s: any) => s.route?.path));
