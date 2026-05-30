import { Bot, InputFile } from "grammy";
import { PrismaClient } from "@prisma/client";
import { BotContext } from "../types";
import { handleDM, handleProfileCallback } from "../dm";
import { handleDmGreeting } from "../dmHandler";
import { resolveUserLanguage, showLanguageSelector } from "../messages";
import { t } from "../i18n";
import { routeToHermes } from "../hermesBridge/route";
import { sendTelegramMessage } from "../hermesBridge/telegram-sender";
import { getChatHistory } from "../hermesBridge/history";
import { handleWorkerTextContinuation } from "../worker";
import { handleEncuestaCallback } from "../encuesta";


export function register(bot: Bot<BotContext>, prisma: PrismaClient): void {
  bot.on("message:text", async (ctx, next) => {
    const chatType = ctx.chat?.type;
    if (chatType !== "private") return next();

    // Worker flow continuation (text responses for /trabajar steps or /perfil edits)
    const bctx = ctx as BotContext;
    const text = ctx.message?.text?.trim();
    if (text) {
      // Worker text continuation (only if already in a worker flow)
      if (await handleWorkerTextContinuation(prisma, bctx)) return;
    }

    // ── DM Greeting handler: "hola" → dmEnabled=true (before expensive routing) ──
    if (await handleDmGreeting(prisma, ctx as BotContext)) return;

    if (process.env.HERMES_BRIDGE_ENABLED === "true") {
      // ── Hermes Bridge: enrutar DM al agente ───────────────────────────
      const msg = ctx.message;
      if (!msg || !("text" in msg) || !msg.text) return;
      const text = msg.text.trim();
      const tgUser = ctx.from;
      if (!tgUser) return;

      // Find first active tree membership
      const user = await prisma.user.findUnique({
        where: { telegramUserId: BigInt(tgUser.id) },
        select: { id: true, username: true, language: true },
      });
      if (!user) {
        await ctx.reply("⚠️ No tienes una cuenta vinculada. Usa /start en un grupo para vincularte a Trust Maker.");
        return;
      }

      // Find all active tree memberships for this user
      const allMemberships = await prisma.treeMember.findMany({
        where: { userId: user.id, status: "ACTIVE" },
        include: { tree: { select: { id: true, name: true } } },
        orderBy: { lastDmAt: "desc" },
      });

      if (allMemberships.length === 0) {
        await ctx.reply("🌳 No eres miembro activo de ningún árbol. Únete a un grupo de Trust Maker para empezar.");
        return;
      }

      // Resolve treeId: use session preference, or auto-pick if only 1 tree
      const session = (ctx as BotContext).session;
      let treeId: string;
      let treeName: string;

      if (session.dmTreeId) {
        // Verify the stored tree is still active
        const valid = allMemberships.find((m: any) => m.tree.id === session.dmTreeId);
        if (valid) {
          treeId = valid.tree.id;
          treeName = valid.tree.name;
        } else {
          // Stored tree no longer valid, fall through to auto-pick
          session.dmTreeId = null;
        }
      }

      if (!session.dmTreeId) {
        if (allMemberships.length === 1) {
          treeId = allMemberships[0].tree.id;
          treeName = allMemberships[0].tree.name;
          session.dmTreeId = treeId;
        } else {
          // Multiple trees — show selector
          const buttons = allMemberships.map((m: any) => [{
            text: `🌳 ${m.tree.name}`,
            callback_data: `dm_tree:${m.tree.id}`,
          }]);
          await ctx.reply(
            "🌳 Estás en varios árboles. ¿En cuál quieres hablar con Ari?",
            { reply_markup: { inline_keyboard: buttons } },
          );
          return;
        }
      }

      const userId = tgUser.id.toString();
      const displayName = tgUser.first_name || userId;
      const fullMessage = `${displayName}: ${text}`;

      // Track last DM interaction for auto-select
      prisma.treeMember.updateMany({
        where: { userId: user.id, treeId, status: "ACTIVE" },
        data: { lastDmAt: new Date() },
      }).catch(e => console.error('[bot:dm] treeMember.updateMany failed:', e.message)); // fire-and-forget

      // Keep typing indicator alive during potentially long API call
      const typingInterval = setInterval(() => {
        ctx.replyWithChatAction("typing").catch(e => console.error('[bot:typing] replyWithChatAction failed:', e.message));
      }, 4000);
      ctx.replyWithChatAction("typing").catch(e => console.error('[bot:typing] replyWithChatAction failed:', e.message));
      const chatHistory = ctx.chat?.id
        ? await getChatHistory(ctx.chat.id, treeId, 20)
        : [];

      let response;
      try {
        response = await routeToHermes(
        fullMessage, treeId, userId, chatHistory, displayName,
        ctx.chat?.id, msg.message_id,
      );
      } finally {
        clearInterval(typingInterval);
      }
      if (response) {
        // Queue: saturation or position
        if (response.saturationMessage) {
          await ctx.reply(response.saturationMessage);
          return;
        }
        if (response.queued) {
          await ctx.reply(
            `🔄 Ari está procesando otro mensaje. Estás en la posición ${response.queuePosition} de la cola.`,
          );
          return;
        }
        await sendTelegramMessage(ctx, response.text!, "Markdown");

        // TTS: only for voice messages (DM text → no audio)
      } else {
        await ctx.reply("⚠️ El agente no está disponible en este momento. Intenta de nuevo más tarde.");
      }
      return;
    }

    await handleDM(prisma, ctx as BotContext);
    // Don't call next() — DM handled, group handler won't fire
  });

}
