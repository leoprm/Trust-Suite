/**
 * Health Check Cron — cada 15 min verifica servidores SSH activos.
 *
 * Itera ManagedServer con status ACTIVE, ejecuta 'echo ok' vía SSH,
 * y acumula fallos consecutivos en memoria + DB. A los 3 fallos consecutivos
 * marca el servidor como UNREACHABLE.
 *
 * Errores de rate-limit y decrypt no se cuentan como fallo de conectividad
 * (son transitorios o de configuración, no de red).
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

/** Errores que NO representan un fallo de conectividad. */
function isConnectivityError(code: string | undefined): boolean {
  if (!code) return true; // error genérico → asumir conectividad
  // Errores de conectividad real
  const connectivityCodes = [
    "SSH_HOST_UNREACHABLE",
    "SSH_CONNECTION_REFUSED",
    "SSH_TIMEOUT",
    "SSH_ERROR",
  ];
  return connectivityCodes.includes(code);
}

/**
 * Ejecuta una ronda de health checks sobre todos los servidores activos.
 * Cada servidor se protege con su propio try-catch para que un fallo
 * (SSH o DB) no interrumpa el chequeo del resto.
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

      // ── Success → reset counter ─────────────────────────────────────
      failureCounters.delete(server.id);

      await prisma.managedServer.update({
        where: { id: server.id },
        data: { lastCheck: new Date(), consecutiveFails: 0 },
      });

      console.log(
        `[HealthCheck] ✅ ${server.name} (${server.ip}) — OK`,
      );
    } catch (err: any) {
      const code: string | undefined = err?.code;

      // ── Rate-limit: ignorar, no es fallo de conectividad ─────────────
      if (code === "RATE_LIMITED") {
        console.log(
          `[HealthCheck] ⏳ ${server.name} (${server.ip}) rate-limited — skip`,
        );
        continue;
      }

      // ── Key decrypt failed: error de configuración, no conectividad ──
      if (code === "SSH_KEY_DECRYPT_FAILED") {
        console.log(
          `[HealthCheck] 🔑 ${server.name} (${server.ip}) key decrypt failed — ` +
            `no se cuenta como fallo de conectividad`,
        );
        continue;
      }

      // ── Error de conectividad genuino ────────────────────────────────
      if (isConnectivityError(code)) {
        failed++;

        const count = (failureCounters.get(server.id) || 0) + 1;
        failureCounters.set(server.id, count);

        // Persistir lastCheck + consecutiveFails (protegido)
        try {
          await prisma.managedServer.update({
            where: { id: server.id },
            data: { lastCheck: new Date(), consecutiveFails: count },
          });
        } catch (dbErr: any) {
          console.error(
            `[HealthCheck] ⚠️ DB update falló para ${server.name}: ${dbErr.message}`,
          );
        }

        if (count >= 3) {
          try {
            await prisma.managedServer.update({
              where: { id: server.id },
              data: { status: "UNREACHABLE", consecutiveFails: count },
            });
            failureCounters.delete(server.id);
            markedUnreachable++;

            console.log(
              `[HealthCheck] ❌ ${server.name} (${server.ip}) → UNREACHABLE ` +
                `tras ${count} fallos consecutivos`,
            );
          } catch (dbErr: any) {
            console.error(
              `[HealthCheck] ⚠️ No se pudo marcar UNREACHABLE ${server.name}: ${dbErr.message}`,
            );
          }
        } else {
          console.log(
            `[HealthCheck] ⚠️ ${server.name} (${server.ip}) fallo ${count}/3 ` +
              `— ${code || err?.message || "error desconocido"}`,
          );
        }
      } else {
        // Error no clasificado como conectividad — loggear sin contar
        console.log(
          `[HealthCheck] ℹ️ ${server.name} (${server.ip}) error no-contable ` +
            `(${code || "unknown"}): ${err?.message || ""}`,
        );
      }
    }
  }

  return { checked: servers.length, failed, markedUnreachable };
}
