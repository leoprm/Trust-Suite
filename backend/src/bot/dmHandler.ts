/**
 * DM Handler — habilita a miembros para recibir encuestas de votación.
 *
 * Cuando un usuario envía "hola" (o variantes) por DM al bot,
 * se marca dmEnabled=true en todas sus membresías activas.
 * Otros mensajes en DM son ignorados por este handler.
 */

import { PrismaClient } from "@prisma/client";
import { BotContext } from "./types";
import { t } from "./i18n";

const DM_BOT_LINK = "https://t.me/TrustMakerBot";

// Patrones que matchean "hola" / "hello" / "hi" (case-insensitive, ignora puntuación)
const GREETING_PATTERNS = [
  /^hola\b/i,
  /^ola\b/i,
  /^hello\b/i,
  /^hi\b/i,
  /^hey\b/i,
  /^buenas\b/i,
  /^qué tal\b/i,
  /^que tal\b/i,
];

function isGreeting(text: string): boolean {
  const normalized = text.trim().toLowerCase().replace(/[!¡¿?.,]+$/, "");
  return GREETING_PATTERNS.some((p) => p.test(normalized));
}

function getUserLang(ctx: BotContext): "es" | "en" {
  const code = ctx.from?.language_code;
  return code === "en" ? "en" : "es";
}

/**
 * Intenta manejar un mensaje de DM como "hola" para habilitar votación.
 * Retorna true si el mensaje fue manejado (es un saludo), false si debe seguir.
 */
export async function handleDmGreeting(
  prisma: PrismaClient,
  ctx: BotContext,
): Promise<boolean> {
  const msg = ctx.message;
  if (!msg || !("text" in msg) || !msg.text) return false;

  const text = msg.text.trim();
  if (!isGreeting(text)) return false;

  const tgUser = ctx.from;
  if (!tgUser) {
    await ctx.reply("⚠️ No se pudo identificar tu cuenta de Telegram.");
    return true;
  }

  const lang = getUserLang(ctx);

  try {
    // Buscar el usuario por telegramUserId
    const user = await prisma.user.findUnique({
      where: { telegramUserId: BigInt(tgUser.id) },
      select: { id: true },
    });

    if (!user) {
      // Usuario no tiene cuenta en Trust Maker
      await ctx.reply(
        lang === "en"
          ? "⚠️ You don't have a Trust Maker account linked. Use /start in a group first."
          : "⚠️ No tienes una cuenta vinculada a Trust Maker. Únete a un grupo primero.",
      );
      return true;
    }

    // Buscar membresías activas
    const memberships = await prisma.treeMember.findMany({
      where: { userId: user.id, status: "ACTIVE" },
      select: { id: true, dmEnabled: true },
    });

    if (memberships.length === 0) {
      await ctx.reply(
        lang === "en"
          ? "🌳 You're not an active member of any tree. Join a Trust Maker group first."
          : "🌳 No eres miembro activo de ningún árbol. Únete a un grupo de Trust Maker primero.",
      );
      return true;
    }

    // Verificar si ya estaba habilitado
    const alreadyEnabled = memberships.every((m) => m.dmEnabled);

    if (alreadyEnabled) {
      await ctx.reply(t("common.dm_already_enabled", lang), {
        parse_mode: "Markdown",
      });
      return true;
    }

    // Marcar dmEnabled=true en todas las membresías activas
    await prisma.treeMember.updateMany({
      where: { userId: user.id, status: "ACTIVE" },
      data: { dmEnabled: true },
    });

    await ctx.reply(t("common.dm_enabled", lang), {
      parse_mode: "Markdown",
    });

    return true;
  } catch (err: any) {
    console.error("[dmHandler] Error processing greeting:", err.message);
    await ctx.reply(
      lang === "en"
        ? "⚠️ Something went wrong. Please try again later."
        : "⚠️ Algo salió mal. Intenta de nuevo más tarde.",
    );
    return true;
  }
}
