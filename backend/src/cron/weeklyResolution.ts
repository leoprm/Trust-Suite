import cron from 'node-cron';
import { prisma } from '../index';

// v2: Weekly resolution disabled — no democratic pipeline (ideas, voting, podium).
// Points renewal is now handled by monthlyNeedPointsCron.
export const startCronJobs = () => {
  console.log('[cron] Weekly resolution disabled in v2 (no democratic pipeline).');
};
