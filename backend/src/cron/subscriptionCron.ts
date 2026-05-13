import cron from 'node-cron';
import { recalculateCost } from '../services/billingService';

/**
 * Cron diario: recalcula el costo de suscripción.
 * Ejecuta a las 03:00 UTC (medianoche en Chile UTC-3).
 */
export function startSubscriptionCron() {
  cron.schedule('0 3 * * *', async () => {
    console.log('[Subscription] Recalculando costo mensual...');
    try {
      const { plan } = await recalculateCost();
      console.log(
        `[Subscription] Costo actualizado: $${plan.currentMonthlyCost}/usuario/mes`,
      );
    } catch (err: any) {
      console.error('[Subscription] Error recalculando costo:', err.message);
    }
  });

  console.log('[Subscription] Cron de suscripción registrado (diario 03:00 UTC).');
}
