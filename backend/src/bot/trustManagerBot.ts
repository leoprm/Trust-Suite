import { Bot, InlineKeyboard } from "grammy";
import { PrismaClient } from "@prisma/client";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { routeToHermes } from "./hermesBridge";
import { useTurn } from "../services/supportSessionService";

// ── Onboarding session state ──────────────────────────────────────────────

interface OnboardingState {
  step: 1 | 2 | 3;
  treeId: string;
  treeName: string;
}

const onboardingSessions = new Map<number, OnboardingState>();

/** Usuarios que están en modo conversacional (supportMode) — key = telegramUserId string */
const supportModeUsers = new Set<string>();

// ── Terms template (loaded once) ───────────────────────────────────────────

let termsTemplate = "";
try {
  termsTemplate = readFileSync(join(__dirname, "menus", "terms.md"), "utf-8");
} catch {
  try {
    termsTemplate = readFileSync(join(process.cwd(), "src/bot/menus/terms.md"), "utf-8");
  } catch {
    console.warn("[TrustManagerBot] No se pudo cargar terms.md");
  }
}

// ── Helpers ────────────────────────────────────────────────────────────────

/**
 * Busca o crea un usuario basado en la info de Telegram.
 * Mismo patrón que commands.ts:resolveTelegramUser.
 */
async function resolveTelegramUser(
  prisma: PrismaClient,
  tgUser: { id: number; username?: string; first_name?: string }
): Promise<string | null> {
  const telegramId = BigInt(tgUser.id);

  try {
    const byTgId = await (prisma as any).user.findUnique({
      where: { telegramUserId: telegramId },
    });
    if (byTgId) return byTgId.id;

    if (tgUser.username) {
      const byUsername = await (prisma as any).user.findUnique({
        where: { username: tgUser.username },
      });
      if (byUsername) {
        await (prisma as any).user.update({
          where: { id: byUsername.id },
          data: { telegramUserId: telegramId },
        });
        return byUsername.id;
      }
    }

    const created = await (prisma as any).user.create({
      data: {
        username: tgUser.username || `tg_${tgUser.id}`,
        firstName: tgUser.first_name,
        telegramUserId: telegramId,
        role: "USER",
      },
    });
    return created.id;
  } catch {
    return null;
  }
}

async function isAlreadyMember(
  prisma: PrismaClient,
  userId: string,
  treeId: string
): Promise<boolean> {
  const member = await (prisma as any).treeMember.findUnique({
    where: { userId_treeId: { userId, treeId } },
    select: { id: true },
  });
  return !!member;
}

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
 * Inicializa @AriTrustManagerBot — el bot público de descubrimiento de árboles.
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
  // /start <treeId>                   → flujo de onboarding (términos → pago → registro)
  bot.command("start", async (ctx) => {
    const treeId = ctx.match?.trim();

    if (!treeId) {
      await ctx.reply(
        "🌳 ¡Bienvenido a Trust Manager!\n\n" +
          "Soy el bot público de Trust Maker. Puedo ayudarte a descubrir " +
          "y unirte a árboles públicos.\n\n" +
          "Si alguien te compartió un enlace como t.me/AriTrustManagerBot?start=ID_DEL_ARBOL, " +
          "úsalo para que te guíe en el proceso de unirte.\n\n" +
          "Selecciona una opción:",
        { reply_markup: mainMenuKeyboard() }
      );
      return;
    }

    if (!ctx.from) {
      await ctx.reply("⚠️ No se pudo identificar tu cuenta de Telegram.");
      return;
    }

    try {
      const tree = await (prisma as any).tree.findUnique({
        where: { id: treeId },
        select: { id: true, name: true, admissionPolicy: true },
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

      // Verificar si ya es miembro
      const userId = await resolveTelegramUser(prisma, ctx.from);
      if (userId) {
        const alreadyMember = await isAlreadyMember(prisma, userId, treeId);
        if (alreadyMember) {
          await ctx.reply(
            `🌳 Ya eres miembro de *${tree.name}*. Para manejar tu cuenta o cualquier duda, habla con @AriTrustManagerBot.`,
            { parse_mode: "Markdown" }
          );
          return;
        }
      }

      // ── PASO 1: Términos legales ──────────────────────────────────────
      const termsText = termsTemplate.replace(/<treeName>/g, tree.name);
      onboardingSessions.set(ctx.from.id, { step: 1, treeId: tree.id, treeName: tree.name });

      const step1Keyboard = new InlineKeyboard()
        .text("✅ Aceptar", `onboard:accept:${tree.id}`)
        .text("❌ Rechazar", `onboard:reject:${tree.id}`);

      await ctx.reply(termsText, { reply_markup: step1Keyboard });
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
            "¡Únete a uno usando un enlace de invitación como t.me/AriTrustManagerBot?start=ID_DEL_ARBOL!"
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

  // ── Callback: Onboarding — PASO 1: Aceptar términos ───────────────────
  bot.callbackQuery(/^onboard:accept:/, async (ctx) => {
    const tgUserId = ctx.from?.id;
    if (!tgUserId) return;

    const data = ctx.callbackQuery.data;
    const treeId = data.slice("onboard:accept:".length);
    const session = onboardingSessions.get(tgUserId);

    if (!session || session.step !== 1) {
      await ctx.answerCallbackQuery({ text: "Esta opción ya no está disponible. Usa /start para comenzar de nuevo." });
      return;
    }

    // Avanzar a paso 2
    session.step = 2;
    onboardingSessions.set(tgUserId, session);

    const step2Keyboard = new InlineKeyboard()
      .text("💳 Stripe", `onboard:pay:stripe:${treeId}`)
      .text("💳 Paddle", `onboard:pay:paddle:${treeId}`)
      .row()
      .text("⏭️ Por ahora no", `onboard:pay:skip:${treeId}`);

    await ctx.editMessageText(
      "💳 *Método de pago*\n\n" +
        "Elige tu método de pago preferido para las cuotas del árbol. " +
        "Puedes cambiarlo después, o continuar sin método de pago por ahora.",
      { parse_mode: "Markdown", reply_markup: step2Keyboard }
    );
    await ctx.answerCallbackQuery();
  });

  // ── Callback: Onboarding — PASO 1: Rechazar términos ──────────────────
  bot.callbackQuery(/^onboard:reject:/, async (ctx) => {
    const tgUserId = ctx.from?.id;
    if (!tgUserId) return;

    onboardingSessions.delete(tgUserId);

    await ctx.editMessageText(
      "Entendido. Cuando quieras unirte, usa el enlace de invitación."
    );
    await ctx.answerCallbackQuery();
  });

  // ── Callback: Onboarding — PASO 2: Elegir método de pago → PASO 3 ────
  bot.callbackQuery(/^onboard:pay:/, async (ctx) => {
    const tgUserId = ctx.from?.id;
    if (!tgUserId) return;

    const session = onboardingSessions.get(tgUserId);

    if (!session || session.step !== 2) {
      await ctx.answerCallbackQuery({ text: "Esta opción ya no está disponible. Usa /start para comenzar de nuevo." });
      return;
    }

    const choice = ctx.callbackQuery.data.slice("onboard:pay:".length);
    // choice: "stripe:<treeId>", "paddle:<treeId>", o "skip:<treeId>"
    const paymentMethod = choice.startsWith("skip:") ? null : choice.split(":")[0];

    // Avanzar a paso 3
    session.step = 3;
    onboardingSessions.set(tgUserId, session);

    const treeId = session.treeId;
    const treeName = session.treeName;

    try {
      const userId = await resolveTelegramUser(prisma, ctx.from!);
      if (!userId) {
        await ctx.editMessageText(
          "⚠️ Error al identificar tu cuenta. Intenta de nuevo con /start."
        );
        onboardingSessions.delete(tgUserId);
        await ctx.answerCallbackQuery();
        return;
      }

      // Verificar membresía duplicada
      const existing = await (prisma as any).treeMember.findUnique({
        where: { userId_treeId: { userId, treeId } },
      });
      if (existing) {
        onboardingSessions.delete(tgUserId);
        await ctx.editMessageText(
          `🌳 Ya eres miembro de *${treeName}*. Para manejar tu cuenta o cualquier duda, habla con @AriTrustManagerBot.`,
          { parse_mode: "Markdown" }
        );
        await ctx.answerCallbackQuery();
        return;
      }

      // Registrar TreeMember
      await (prisma as any).treeMember.create({
        data: {
          userId,
          treeId,
          status: "ACTIVE",
          role: "MEMBER",
        },
      });

      onboardingSessions.delete(tgUserId);

      await ctx.editMessageText(
        `✅ ¡Listo! Ya eres miembro de *${treeName}*.\n\n` +
          `Para manejar tu cuenta o cualquier duda, habla con @AriTrustManagerBot.`,
        { parse_mode: "Markdown" }
      );
    } catch (err: any) {
      console.error("[TrustManagerBot] Error registrando miembro:", err.message);
      onboardingSessions.delete(tgUserId);
      await ctx.editMessageText(
        "⚠️ Error al registrar tu membresía. Inténtalo de nuevo con /start o contacta al administrador del árbol."
      );
    }
    await ctx.answerCallbackQuery();
  });

  // ── Mensajes de texto en modo conversacional ────────────────────────────
  bot.on("message:text", async (ctx) => {
    const tgUser = ctx.from;
    if (!tgUser) return;
    const uid = String(tgUser.id);

    if (!supportModeUsers.has(uid)) return;

    // ── Consumir turno ──────────────────────────────────────────────────
    const remaining = useTurn(uid);
    if (remaining <= 0) {
      await ctx.reply(
        "⏳ Has alcanzado el límite de 30 turnos este mes. " +
          "Tu límite se renovará el primer día del mes siguiente.",
        { parse_mode: "Markdown" }
      );
      return;
    }

    // ── Mostrar indicador de escritura ──────────────────────────────────
    const typingInterval = setInterval(() => {
      ctx.replyWithChatAction("typing").catch(() => {});
    }, 4000);
    ctx.replyWithChatAction("typing").catch(() => {});

    try {
      const displayName =
        tgUser.first_name || tgUser.username || uid;

      // treeId=null: support mode no está ligado a un árbol específico
      const response = await routeToHermes(
        ctx.message.text,
        null,             // treeId
        uid,
        undefined,        // chatHistory
        displayName,
        // NO chatId ni messageId (no es conversación de grupo)
      );

      if (!response) {
        await ctx.reply(
          "⚠️ El agente no está disponible en este momento. Intenta de nuevo más tarde.",
          { parse_mode: "Markdown" }
        );
        return;
      }

      if (response.saturationMessage) {
        await ctx.reply(response.saturationMessage, { parse_mode: "Markdown" });
        return;
      }

      if (response.queued) {
        await ctx.reply(
          `🔄 TrustManager está procesando otro mensaje. Estás en la posición ${response.queuePosition} de la cola.`,
          { parse_mode: "Markdown" }
        );
        return;
      }

      if (response.text) {
        await ctx.reply(response.text, { parse_mode: "Markdown" });
      }
    } catch (err: any) {
      console.error("[TrustManagerBot] Error en supportMode:", err?.message || err);
      await ctx.reply(
        "⚠️ Ocurrió un error al procesar tu consulta. Por favor, inténtalo de nuevo."
      );
    } finally {
      clearInterval(typingInterval);
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

/** Escapa caracteres especiales de MarkdownV2 */
function escapeMd(text: string): string {
  return text.replace(/[_*[\]()~`>#+\-=|{}.!]/g, "\\$&");
}
