/**
 * Health Check Cron — cada 15 min verifica servidores SSH activos.
 *
 * Itera ManagedServer con status ACTIVE, ejecuta 'echo ok' vía SSH,
 * y acumula fallos consecutivos en memoria. A los 3 fallos consecutivos
 * marca el servidor como UNREACHABLE.
 *
 * Corre cada 15 minutos.
 */

import { PrismaClient } from "@prisma/client";
import { execCommand } from "../services/sshGateway";

// ── In-memory failure tracker ─────────────────────────────────────────────
// Resetea al reiniciar el proceso — aceptable: un reinicio es un evento
// infrecuente y perder el contador parcial es preferible a tocar el schema.
const failureCounters = new Map<string, number>();

export interface HealthCheckResult {
  checked: number;
  failed: number;
  markedUnreachable: number;
}

/**
 * Ejecuta una ronda de health checks sobre todos los servidores activos.
 */
export async function runHealthCheck(
  prisma: PrismaClient,
): Promise<HealthCheckResult> {
  const servers = await prisma.managedServer.findMany({
    where: { status: "ACTIVE" },
    select: { id: true, name: true, ip: true },
  });

  let failed = 0;
  let markedUnreachable = 0;

  for (const server of servers) {
    try {
      await execCommand(server.id, "echo ok");

      // Success → reset failure counter
      failureCounters.delete(server.id);

      // Update lastCheck timestamp
      await prisma.managedServer.update({
        where: { id: server.id },
        data: { lastCheck: new Date() },
      });
    } catch (err: any) {
      failed++;

      const count = (failureCounters.get(server.id) || 0) + 1;
      failureCounters.set(server.id, count);

      // Update lastCheck even on failure
      await prisma.managedServer.update({
        where: { id: server.id },
        data: { lastCheck: new Date() },
      });

      if (count >= 3) {
        // Threshold reached → mark unreachable
        await prisma.managedServer.update({
          where: { id: server.id },
          data: { status: "UNREACHABLE" },
        });
        failureCounters.delete(server.id);
        markedUnreachable++;

        console.log(
          `[HealthCheck] ❌ ${server.name} (${server.ip}) → UNREACHABLE ` +
            `tras ${count} fallos consecutivos`,
        );
      } else {
        console.log(
          `[HealthCheck] ⚠️ ${server.name} (${server.ip}) fallo ${count}/3 ` +
            `— ${err?.code || err?.message || "error desconocido"}`,
        );
      }
    }
  }

  return { checked: servers.length, failed, markedUnreachable };
}
