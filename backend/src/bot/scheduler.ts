/**
 * Scheduler: node-cron para el cierre diario a medianoche.
 *
 * Usa node-cron para disparar cron.ts cada día a las 00:00 (hora local).
 * También expone una función manual `triggerDailyClose()` para testing.
 */

import cron from "node-cron";
import type { ScheduledTask } from "node-cron";
import { PrismaClient } from "@prisma/client";
import type { Bot } from "grammy";
import type { BotContext } from "./types";
import { runDailyClose } from "./cron";

let task: ScheduledTask | null = null;

/**
 * Arranca el scheduler de medianoche.
 * Solo registra la tarea si hay árboles con telegramChatId.
 */
export function startScheduler(
  prisma: PrismaClient,
  bot: Bot<BotContext> | null
): void {
  // ── Detener scheduler previo si existe ──
  if (task) {
    task.stop();
    task = null;
  }

  // ── Cron: 0 0 * * * (medianoche, hora local del servidor) ──
  task = cron.schedule("0 0 * * *", async () => {
    console.log("[Scheduler] ⏰ Medianoche — ejecutando cierre diario…");

    try {
      await runDailyClose(prisma, bot);
    } catch (err) {
      console.error("[Scheduler] Error fatal en cierre diario:", err);
    }
  });

  console.log("[Scheduler] ⏰ Cierre diario programado a las 00:00 (hora local)");

  // ── Run initial close if there are existing votes to clear ──
  // (Only in dev — in prod, the cron will handle it)
  if (process.env.NODE_ENV !== "production") {
    console.log(
      "[Scheduler] 🧪 Entorno dev — usa triggerDailyClose() para simular el cierre."
    );
  }
}

/**
 * Dispara el cierre diario manualmente (para testing / desarrollo).
 */
export async function triggerDailyClose(
  prisma: PrismaClient,
  bot: Bot<BotContext> | null
) {
  console.log("[Scheduler] 🔧 Cierre diario manual disparado…");
  return runDailyClose(prisma, bot);
}

/**
 * Detiene el scheduler (para shutdown graceful).
 */
export function stopScheduler(): void {
  if (task) {
    task.stop();
    task = null;
    console.log("[Scheduler] ⏹️ Scheduler detenido.");
  }
}
