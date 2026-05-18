import { Bot } from "grammy";
import { PrismaClient } from "@prisma/client";

/**
 * Inicializa @TrustManagerBot — el bot público de descubrimiento de árboles.
 * Usa TRUST_MANAGER_BOT_TOKEN del .env (token distinto a @TrustMakerBot).
 * Convive con @TrustMakerBot sin conflicto: otra instancia de Bot, otro token.
 */
export async function initTrustManagerBot(
  prisma: PrismaClient
): Promise<Bot | null> {
  const token = process.env.TRUST_MANAGER_BOT_TOKEN || "";

  if (!token) {
    console.warn(
      "[TrustManagerBot] TRUST_MANAGER_BOT_TOKEN no configurado — el bot no se iniciará."
    );
    return null;
  }

  const bot = new Bot(token);

  // ── /start ──────────────────────────────────────────────────────────────
  // /start                            → bienvenida genérica
  // /start <treeId>                   → verifica árbol público y da onboarding
  bot.command("start", async (ctx) => {
    const treeId = ctx.match?.trim();

    if (!treeId) {
      await ctx.reply(
        "🌳 ¡Bienvenido a Trust Manager!\n\n" +
          "Soy el bot público de Trust Maker. Puedo ayudarte a descubrir " +
          "y unirte a árboles públicos.\n\n" +
          "Si alguien te compartió un enlace como t.me/TrustManagerBot?start=ID_DEL_ARBOL, " +
          "úsalo para que te guíe en el proceso de unirte.\n\n" +
          "Comandos:\n" +
          "/start <treeId> — Ver información y unirte a un árbol público"
      );
      return;
    }

    try {
      const tree = await (prisma as any).tree.findUnique({
        where: { id: treeId },
        select: { id: true, name: true, admissionPolicy: true, description: true, icono: true },
      });

      if (!tree) {
        await ctx.reply(
          "⚠️ El árbol especificado no existe. Verifica el ID e inténtalo de nuevo."
        );
        return;
      }

      if (tree.admissionPolicy !== "OPEN") {
        await ctx.reply(
          "🔒 Este árbol no es público. Necesitas una invitación para unirte.\n\n" +
            "Pide al administrador del árbol que te comparta un enlace de invitación."
        );
        return;
      }

      // Árbol existe y es OPEN — iniciar flujo de onboarding
      const icono = tree.icono ?? "🌳";
      const description = tree.description ?? "Sin descripción.";
      await ctx.reply(
        `${icono} *${tree.name}*\n\n` +
          `${description}\n\n` +
          "✅ Este árbol es público y acepta nuevos miembros.\n\n" +
          "Para unirte necesitas una cuenta en Trust Maker. " +
          "Si ya tienes cuenta, abre @TrustMakerBot y usa /start para vincularte.\n\n" +
          "Una vez vinculado, serás añadido automáticamente al árbol.",
        { parse_mode: "Markdown" }
      );
    } catch (err: any) {
      console.error("[TrustManagerBot] Error verificando árbol:", err.message);
      await ctx.reply(
        "⚠️ Error al verificar el árbol. Inténtalo más tarde."
      );
    }
  });

  // ── Iniciar polling ─────────────────────────────────────────────────────
  bot.start({
    onStart: () => {
      console.log("[TrustManagerBot] Bot iniciado en modo polling ✅");
    },
  });

  return bot;
}
