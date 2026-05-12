import cron from 'node-cron';
import { prisma } from '../index';

// v2: Material fallback disabled — no democratic pipeline (ACTIVE/RESOLVED status + treeLinks no longer exist).
export const startMaterialFallbackJob = () => {
  console.log('[cron] Material fallback disabled in v2 (no democratic pipeline).');
};
