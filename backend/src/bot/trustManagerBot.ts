import { Bot, InlineKeyboard } from "grammy";
import { PrismaClient } from "@prisma/client";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/** Usuarios que están en modo conversacional (supportMode) — key = telegramUserId string */
const supportModeUsers = new Set<string>();

/**
 * Construye el teclado inline del menú principal.
 */
function mainMenuKeyboard(): InlineKeyboard {
  return new InlineKeyboard()
    .text("📋 Ver mis árboles", "menu:trees")
    .row()
    .text("💳 Gestionar método de pago", "menu:payment")
    .row()
    .text("❓ Preguntas frecuentes", "menu:faq")
    .row()
    .text("📞 Hablar con TrustManager", "menu:support");
}

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
  // /start                            → bienvenida genérica + menú
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
          "Selecciona una opción:",
        { reply_markup: mainMenuKeyboard() }
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

  // ── /menu ───────────────────────────────────────────────────────────────
  bot.command("menu", async (ctx) => {
    await ctx.reply("📋 Menú principal — selecciona una opción:", {
      reply_markup: mainMenuKeyboard(),
    });
  });

  // ── /salir ──────────────────────────────────────────────────────────────
  bot.command("salir", async (ctx) => {
    const tgUser = ctx.from;
    if (!tgUser) return;
    const uid = String(tgUser.id);

    if (supportModeUsers.has(uid)) {
      supportModeUsers.delete(uid);
      await ctx.reply(
        "✅ Has salido del modo conversacional.\n\n" +
          "Usa /menu para ver las opciones disponibles."
      );
    } else {
      await ctx.reply("No estabas en modo conversacional. Usa /menu para ver las opciones.");
    }
  });

  // ── Callback: 📋 Ver mis árboles ────────────────────────────────────────
  bot.callbackQuery("menu:trees", async (ctx) => {
    const tgUser = ctx.from;
    if (!tgUser) {
      await ctx.answerCallbackQuery({ text: "No se pudo identificar tu usuario.", show_alert: true });
      return;
    }

    try {
      const user = await prisma.user.findUnique({
        where: { telegramUserId: BigInt(tgUser.id) },
      });

      if (!user) {
        await ctx.answerCallbackQuery({
          text: "No tienes cuenta en Trust Maker. Usa @TrustMakerBot para crear una.",
          show_alert: true,
        });
        return;
      }

      const memberships = await prisma.treeMember.findMany({
        where: { userId: user.id, status: "ACTIVE" },
        include: { tree: { select: { id: true, name: true, icono: true } } },
      });

      await ctx.answerCallbackQuery();

      if (memberships.length === 0) {
        await ctx.reply(
          "🌳 No eres miembro de ningún árbol aún.\n\n" +
            "¡Únete a uno usando un enlace de invitación como t.me/TrustManagerBot?start=ID_DEL_ARBOL!"
        );
        return;
      }

      const lines = memberships.map((m, i) => {
        const icono = m.tree.icono ?? "🌳";
        return `${i + 1}\\. ${icono} *${escapeMd(m.tree.name)}*`;
      });

      await ctx.reply(
        `🌳 *Tus árboles \\(${memberships.length}\\)*:\n\n${lines.join("\n")}`,
        { parse_mode: "MarkdownV2" }
      );
    } catch (err: any) {
      console.error("[TrustManagerBot] Error listando árboles:", err.message);
      await ctx.reply("⚠️ Error al consultar tus árboles. Inténtalo más tarde.");
    }
  });

  // ── Callback: 💳 Gestionar método de pago ───────────────────────────────
  bot.callbackQuery("menu:payment", async (ctx) => {
    await ctx.answerCallbackQuery({
      text: "Esta funcionalidad estará disponible pronto.",
      show_alert: true,
    });
    await ctx.reply(
      "💳 *Gestionar método de pago*\n\n" +
        "Esta funcionalidad estará disponible pronto. ¡Gracias por tu interés!",
      { parse_mode: "Markdown" }
    );
  });

  // ── Callback: ❓ Preguntas frecuentes ────────────────────────────────────
  bot.callbackQuery("menu:faq", async (ctx) => {
    await ctx.answerCallbackQuery();
    try {
      const faqPath = join(__dirname, "menus", "faq.md");
      const faqContent = readFileSync(faqPath, "utf-8");
      await ctx.reply(faqContent);
    } catch (err: any) {
      console.error("[TrustManagerBot] Error cargando FAQ:", err.message);
      await ctx.reply("⚠️ Error al cargar las preguntas frecuentes. Inténtalo más tarde.");
    }
  });

  // ── Callback: 📞 Hablar con TrustManager ─────────────────────────────────
  bot.callbackQuery("menu:support", async (ctx) => {
    const tgUser = ctx.from;
    if (!tgUser) {
      await ctx.answerCallbackQuery({ text: "No se pudo identificar tu usuario.", show_alert: true });
      return;
    }

    const uid = String(tgUser.id);
    supportModeUsers.add(uid);

    await ctx.answerCallbackQuery({
      text: "Modo conversacional activado. Escribe tu consulta.",
      show_alert: true,
    });
    await ctx.reply(
      "📞 *Modo conversacional activado*\n\n" +
        "Estás hablando directamente con TrustManager. " +
        "Escribe tu consulta y te responderé lo antes posible.\n\n" +
        "Para salir, usa /salir.",
      { parse_mode: "Markdown" }
    );
  });

  // ── Mensajes de texto en modo conversacional ────────────────────────────
  bot.on("message:text", async (ctx) => {
    const tgUser = ctx.from;
    if (!tgUser) return;
    const uid = String(tgUser.id);

    if (!supportModeUsers.has(uid)) return;

    // El usuario está en modo soporte — eco de confirmación
    // (la respuesta conversacional real se implementará en una tarea futura)
    await ctx.reply(
      "📞 *Tu mensaje ha sido recibido*\n\n" +
        "Gracias por escribirnos. Actualmente el modo conversacional " +
        "está en fase de activación y pronto podremos responder tus consultas " +
        "en tiempo real.\n\n" +
        "Para salir del modo conversacional, usa /salir.",
      { parse_mode: "Markdown" }
    );
  });

  // ── Iniciar polling ─────────────────────────────────────────────────────
  bot.start({
    onStart: () => {
      console.log("[TrustManagerBot] Bot iniciado en modo polling ✅");
    },
  });

  return bot;
}

/** Escapa caracteres especiales de MarkdownV2 */
function escapeMd(text: string): string {
  return text.replace(/[_*[\]()~`>#+\-=|{}.!]/g, "\\$&");
}
