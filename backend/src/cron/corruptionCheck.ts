import cron from 'node-cron';
import { checkCorruption } from '../controllers/migrationController';

/**
 * ============================================================
 *  CORRUPCIÓN DE TRATADOS — Cron Job Diario
 * ============================================================
 *
 * Ejecutado cada día a las 03:00 UTC.
 * Revisa todos los Tratados de Confianza activos y revoca
 * aquellos donde >20% de tareas de alto nivel (dificultad >6)
 * asignadas a especialistas auto-aprobados fueron rechazadas.
 */
export const startCorruptionCheckCron = () => {
  cron.schedule('0 3 * * *', async () => {
    console.log('[CorruptionCheck] ── Verificación de Tratados de Confianza ──');
    try {
      await checkCorruption();
      console.log('[CorruptionCheck] ── Completado ──');
    } catch (e) {
      console.error('[CorruptionCheck] Error:', e);
    }
  });
  console.log('[Cron] Corruption check scheduled (daily 03:00 UTC)');
};
