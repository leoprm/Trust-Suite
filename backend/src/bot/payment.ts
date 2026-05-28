/**
 * Middleware de pago para el bot de Telegram.
 *
 * Antes de procesar cualquier mensaje, verifica el paymentStatus del usuario
 * en el árbol asociado al chat:
 *   - BLOCKED  → mensaje genérico + link de pago
 *   - DELINQUENT → recordatorio amable + link de pago
 *   - GRACE / ACTIVE → pasa normal
 *
 * Comandos públicos (/info, /lista) siempre visibles sin importar status.
 */

import { PrismaClient } from "@prisma/client";
import { BotContext } from "./types";
import { findTreeByChat } from "./treeResolver";

/** Link de pago, configurable vía variable de entorno. */
const PAYMENT_LINK =
  process.env.PAYMENT_LINK || "https://trustmaker.app/pagos";

/** Comandos públicos que siempre pasan sin verificar pago. */
const PUBLIC_COMMAND_ROOTS = new Set(["info", "lista"]);

/** Resultado de la verificación de acceso por pago. */
export type PaymentCheckResult =
  | { blocked: true; reply: string }
  | { blocked: false };

/**
 * Verifica si el usuario tiene acceso según su paymentStatus en el árbol.
 *
 * @returns `{ blocked: false }` si puede pasar, `{ blocked: true, reply }` si debe mostrarse mensaje de bloqueo.
 */
export async function checkPaymentAccess(
  prisma: PrismaClient,
  ctx: BotContext,
  chatId: string,
  cmdText: string,
): Promise<PaymentCheckResult> {
  // 1. Comandos públicos siempre pasan
  const root = extractCommandRoot(cmdText);
  if (root && PUBLIC_COMMAND_ROOTS.has(root)) {
    return { blocked: false };
  }

  // 2. Resolver usuario de Telegram → userId
  const userId = await resolveUserId(prisma, ctx);
  if (!userId) return { blocked: false }; // sin usuario identificado → permitir

  // 3. Buscar árbol asociado al chat
  const tree = await findTreeByChat(prisma, chatId);
  if (!tree) return { blocked: false }; // sin árbol → permitir

  // 4. Buscar membresía del usuario en este árbol
  const member = await prisma.treeMember.findUnique({
    where: {
      userId_treeId: { userId, treeId: tree.id },
    },
    select: { paymentStatus: true },
  });

  if (!member) return { blocked: false }; // no es miembro → permitir

  // 5. Evaluar según paymentStatus
  switch (member.paymentStatus) {
    case "BLOCKED":
      return {
        blocked: true,
        reply:
          `🚫 *Acceso restringido*\n\n` +
          `Tu cuenta está bloqueada por falta de pago. Para restaurar el acceso, realiza tu pago aquí:\n\n` +
          `${PAYMENT_LINK}`,
      };

    case "DELINQUENT":
      return {
        blocked: true,
        reply:
          `⚠️ *Recordatorio de pago*\n\n` +
          `Tu membresía tiene pagos pendientes. Por favor regulariza tu situación para evitar la suspensión:\n\n` +
          `${PAYMENT_LINK}`,
      };

    case "GRACE":
    case "ACTIVE":
    default:
      return { blocked: false };
  }
}

// ── Helpers ─────────────────────────────────────────────────────────────────

/** Extrae la raíz del comando: "/lista necesidades" → "lista", "/info" → "info". */
function extractCommandRoot(cmdText: string): string | null {
  const text = cmdText.startsWith("/") ? cmdText.slice(1) : cmdText;
  const parts = text.trim().split(/\s+/);
  if (parts.length === 0 || !parts[0]) return null;
  return parts[0].toLowerCase();
}

/** Busca el userId a partir de la info de Telegram (solo lectura, no crea). */
async function resolveUserId(
  prisma: PrismaClient,
  ctx: BotContext,
): Promise<string | null> {
  const tgUser = ctx.from;
  if (!tgUser) return null;

  const telegramId = BigInt(tgUser.id);

  // 1. Buscar por telegramUserId
  const byTgId = await prisma.user.findUnique({
    where: { telegramUserId: telegramId },
    select: { id: true },
  });
  if (byTgId) return byTgId.id;

  // 2. Fallback: username de Telegram
  if (tgUser.username) {
    const byUsername = await prisma.user.findUnique({
      where: { username: tgUser.username },
      select: { id: true },
    });
    if (byUsername) return byUsername.id;
  }

  return null;
}
