import cron from 'node-cron';
import { renewAllNeedPoints } from '../services/monthlyNeedPointsService';

/**
 * Cron mensual — día 1 de cada mes a las 00:05 UTC.
 * Solo renueva availableNeedPoints (puntos no asignados).
 * La sedimentación (12 meses) y degradación (66%) las maneja
 * baseNeedReviewCron.ts usando baseNeedService.ts.
 */
export function startMonthlyNeedPointsCron() {
  cron.schedule('5 0 1 * *', async () => {
    console.log('[MonthlyNeedPoints] Starting monthly renewal...');
    try {
      const { renewed } = await renewAllNeedPoints();
      console.log(`[MonthlyNeedPoints] Renewed: ${renewed} members`);
      console.log('[MonthlyNeedPoints] Cycle complete.');
    } catch (err: any) {
      console.error('[MonthlyNeedPoints] Error:', err.message);
    }
  });

  console.log('[MonthlyNeedPoints] Cron scheduled: day 1, 00:05 UTC');
}
