import { Bot, InputFile } from "grammy";
import { PrismaClient } from "@prisma/client";
import { BotContext } from "../types";
import { handleEncuestaCommand, handleVotarCommand } from "../encuesta";
import { resolveUserLanguage, showLanguageSelector } from "../messages";
import { t } from "../i18n";
import { computePaymentObligations, formatPagarResult } from "../../services/telegramBotService";
import { getBotNotebookLMBridge } from "../helpers";


export function register(bot: Bot<BotContext>, prisma: PrismaClient): void {
  bot.command("start", async (ctx) => {
    const lang = await resolveUserLanguage(prisma, ctx);
    if (!lang) {
      // No language set → show language selector first
      await showLanguageSelector(ctx);
      return;
    }
    await ctx.reply(t("common.welcome", lang) + "\n\n" + t("common.welcome_detail", lang));
  });

  bot.command("language", async (ctx) => {
    await showLanguageSelector(ctx);
  });

  bot.command("help", async (ctx) => {
      await ctx.reply(
        "Comandos disponibles:\n" +
          "/start — Iniciar el bot\n" +
          "/login — Vincular tu cuenta de Trust Maker\n" +
          "/cuota — Ver tu cuota mensual\n" +
          "/pagar — Ver pagos pendientes\n" +
          "/trabajar — Registrarte como trabajador\n" +
          "/perfil — Editar tu perfil de trabajador\n" +
          "/tareas — Ver tareas disponibles\n" +
          "/ask <pregunta> — Preguntar al NotebookLM del árbol\n" +
          "/podcast — Generar podcast del árbol\n" +
          "/help — Mostrar esta ayuda\n\n" +
          "En grupos, menciona @TrustMakerBot:\n" +
          "  @TrustMakerBot /info\n" +
          "  @TrustMakerBot /lista necesidades\n" +
          "  @TrustMakerBot /crea necesidad \"título\" — descripción\n" +
          "  @TrustMakerBot /ideas para \"título\"\n" +
          "  @TrustMakerBot /vota <id>\n\n" +
          "Admin:\n" +
          "  /informe — generar informes de subárboles\n" +
          "  /informe activar — activar informes mensuales\n" +
          "  /informe desactivar — desactivar informes mensuales\n" +
          "  /pause — pausar la IA del grupo\n" +
          "  /modo máxima|media|mínima — cambiar modo de IA\n\n" +
          "También puedes conversar naturalmente mencionando al bot."
      );
  });

  bot.command("cuota", async (ctx) => {
    const tgUser = ctx.from;
    if (!tgUser) {
      await ctx.reply("⚠️ No se pudo identificar tu cuenta de Telegram.");
      return;
    }

    const telegramId = BigInt(tgUser.id);
    const user = await prisma.user.findUnique({
      where: { telegramUserId: telegramId },
      select: { id: true },
    });

    if (!user) {
      await ctx.reply(
        "⚠️ No tienes una cuenta vinculada. Usa /start para vincularte a Trust Maker."
      );
      return;
    }

    const memberships = await prisma.treeMember.findMany({
      where: { userId: user.id, status: "ACTIVE" },
      include: {
        tree: { select: { name: true, icono: true } },
      },
    });

    if (memberships.length === 0) {
      await ctx.reply("🌳 No eres miembro activo de ningún árbol.");
      return;
    }

    const lines: string[] = ["💰 *Tu cuota mensual*:\n"];
    for (const m of memberships) {
      const fee = m.monthlyFee ?? 0;
      const icono = m.tree.icono ?? "🌳";
      const statusEmoji: Record<string, string> = {
        GRACE: "🆕",
        ACTIVE: "✅",
        DELINQUENT: "⚠️",
        BLOCKED: "🚫",
      };
      const emoji = statusEmoji[m.paymentStatus] ?? "❓";
      lines.push(
        `${icono} *${m.tree.name}*: ${fee} CLP/mes ${emoji}`
      );
    }
    lines.push("", "Usa /pagar para ver cómo pagar.");

    await ctx.reply(lines.join("\n"), { parse_mode: "Markdown" });
  });

  bot.command("pagar", async (ctx) => {
    const tgUser = ctx.from;
    if (!tgUser) {
      await ctx.reply(t("common:not_identified", "es"));
      return;
    }

    // Resolve user language for i18n
    const lng = await resolveUserLanguage(prisma, ctx) ?? "es";

    const user = await prisma.user.findUnique({
      where: { telegramUserId: BigInt(tgUser.id) },
      select: { id: true },
    });

    if (!user) {
      await ctx.reply(
        lng === "en"
          ? "⚠️ No account linked. Use /start to link your Trust Maker account."
          : "⚠️ No tienes una cuenta vinculada. Usa /start para vincularte a Trust Maker.",
        { parse_mode: "Markdown" },
      );
      return;
    }

    const result = await computePaymentObligations(tgUser.id);
    if (!result) {
      await ctx.reply(
        "⚠️ Error al calcular tus obligaciones de pago. Intenta más tarde.",
      );
      return;
    }

    const message = formatPagarResult(result, lng);
    await ctx.reply(message, { parse_mode: "Markdown" });
  });

  bot.command("tree", async (ctx) => {
    const tgUser = ctx.from;
    if (!tgUser) return;

    const user = await prisma.user.findUnique({
      where: { telegramUserId: BigInt(tgUser.id) },
      select: { id: true },
    });
    if (!user) {
      await ctx.reply("⚠️ No tienes una cuenta vinculada. Usa /start.");
      return;
    }

    const allMemberships = await prisma.treeMember.findMany({
      where: { userId: user.id, status: "ACTIVE" },
      include: { tree: { select: { id: true, name: true } } },
      orderBy: { joinedAt: "desc" },
    });

    if (allMemberships.length === 0) {
      await ctx.reply("🌳 No eres miembro activo de ningún árbol.");
      return;
    }

    // If argument provided, switch to that tree
    const arg = ctx.message?.text?.split(/\s+/, 2)[1]?.trim().toLowerCase();
    if (arg) {
      const match = allMemberships.find((m: any) =>
        m.tree.name.toLowerCase().includes(arg)
      );
      if (match) {
        (ctx as BotContext).session.dmTreeId = match.tree.id;
        await ctx.reply(`🌳 Cambiado a *${match.tree.name}*.`);
        return;
      }
      await ctx.reply(`⚠️ No se encontró un árbol que coincida con "${arg}".`);
      return;
    }

    // No argument — show selector
    const buttons = allMemberships.map((m: any) => [{
      text: `🌳 ${m.tree.name}`,
      callback_data: `dm_tree:${m.tree.id}`,
    }]);
    await ctx.reply("🌳 Selecciona tu árbol para DMs:", {
      reply_markup: { inline_keyboard: buttons },
    });
  });

  bot.command("ask", async (ctx) => {
    const chatType = ctx.chat?.type;
    if (chatType !== "group" && chatType !== "supergroup") {
      await ctx.reply("🔍 /ask solo funciona en grupos vinculados a un árbol.");
      return;
    }

    const chatId = ctx.chat?.id.toString();
    if (!chatId) return;

    // Extract question (everything after "/ask")
    const raw = ctx.message?.text || "";
    const question = raw.replace(/^\/ask(?:@\w+)?\s*/, "").trim();
    if (!question) {
      await ctx.reply("🔍 Uso: /ask <pregunta>\n\nEjemplo: /ask ¿Qué dice el documento sobre sostenibilidad?");
      return;
    }

    const tree = ctx.tree!;
    if (!tree) {
      await ctx.reply("⚠️ Este grupo no está vinculado a ningún árbol.");
      return;
    }

    try {
      await ctx.replyWithChatAction("typing");
      const bridge = await getBotNotebookLMBridge();
      const result = await bridge.ask(tree.id, question);

      const citations = result.citations || [];
      let reply = `📚 *Respuesta:*\n${result.answer}`;

      if (citations.length > 0) {
        reply += "\n\n📖 *Fuentes:*";
        for (const c of citations.slice(0, 5)) {
          const sourceLabel = c.text
            ? (c.text.length > 80 ? c.text.slice(0, 80) + "..." : c.text)
            : c.sourceId;
          reply += `\n• ${sourceLabel}`;
        }
      } else {
        reply += "\n\n⚠️ No hay fuentes en el notebook de este árbol.";
      }

      await ctx.reply(reply, { parse_mode: "Markdown" });
    } catch (err: any) {
      console.error("[Bot /ask] Error:", err?.message || err);
      const msg = err?.message || "Error desconocido";
      if (msg.includes("No notebook found")) {
        await ctx.reply("⚠️ Este árbol no tiene un notebook creado aún. Añade fuentes primero con /source.");
      } else {
        await ctx.reply(`❌ Error al consultar NotebookLM: ${msg.slice(0, 200)}`);
      }
    }
  });

  bot.command("podcast", async (ctx) => {
    const chatType = ctx.chat?.type;
    if (chatType !== "group" && chatType !== "supergroup") {
      await ctx.reply("🎙️ /podcast solo funciona en grupos vinculados a un árbol.");
      return;
    }

    const chatId = ctx.chat?.id.toString();
    if (!chatId) return;

    const tree = ctx.tree!;
    if (!tree) {
      await ctx.reply("⚠️ Este grupo no está vinculado a ningún árbol.");
      return;
    }

    try {
      const bridge = await getBotNotebookLMBridge();
      const genResult = await bridge.generatePodcast(tree.id);

      await ctx.reply(
        `🎙️ *Generando podcast...* te aviso cuando esté listo.\n\n` +
        `⏳ Task: \`${genResult.taskId}\``,
        { parse_mode: "Markdown" },
      );

      // Poll every 15s for up to 10 minutes
      const MAX_POLLS = 40; // 10 min
      const POLL_INTERVAL_MS = 15_000;
      let pollCount = 0;

      const pollInterval = setInterval(async () => {
        pollCount++;
        try {
          const status = await bridge.pollPodcast(tree.id, genResult.taskId);

          if (status.isFailed) {
            clearInterval(pollInterval);
            await ctx.reply("❌ La generación del podcast falló. Intenta de nuevo más tarde.");
            return;
          }

          if (status.isComplete && status.url) {
            clearInterval(pollInterval);
            await ctx.replyWithChatAction("upload_document");

            // Download the audio
            const outputPath = `/tmp/tm-podcast-${tree.id}-${genResult.taskId}.mp3`;
            const dl = await bridge.downloadPodcast(tree.id, genResult.taskId, outputPath);

            try {
              const { InputFile } = await import("grammy");
              const audioFile = new InputFile(dl.path);
              await ctx.replyWithAudio(audioFile, {
                title: `Podcast: ${tree.name}`,
                caption: `🎙️ Podcast generado para *${tree.name}*`,
                parse_mode: "Markdown",
              });
              await ctx.reply("✅ ¡Podcast listo!");
            } catch (sendErr: any) {
              console.error("[Bot /podcast] Send error:", sendErr?.message || sendErr);
              await ctx.reply(
                `✅ Podcast generado pero no pude enviarlo.\n📁 Archivo: ${dl.path}`,
              );
            }
            return;
          }

          if (pollCount >= MAX_POLLS) {
            clearInterval(pollInterval);
            await ctx.reply(
              "⏰ El podcast está tardando más de lo esperado. " +
              `Puedes verificarlo luego con la task \`${genResult.taskId}\`.`,
              { parse_mode: "Markdown" },
            );
          }
        } catch (pollErr: any) {
          console.error("[Bot /podcast] Poll error:", pollErr?.message || pollErr);
          // Don't clear interval on transient errors
        }
      }, POLL_INTERVAL_MS);

      // Safety: clear interval after 12 min regardless
      setTimeout(() => clearInterval(pollInterval), 12 * 60_000);

    } catch (err: any) {
      console.error("[Bot /podcast] Error:", err?.message || err);
      const msg = err?.message || "Error desconocido";
      if (msg.includes("No notebook found")) {
        await ctx.reply("⚠️ Este árbol no tiene un notebook creado aún. Añade fuentes primero con /source.");
      } else {
        await ctx.reply(`❌ Error al iniciar podcast: ${msg.slice(0, 200)}`);
      }
    }
  });

  bot.command("encuesta", async (ctx) => {
    await handleEncuestaCommand(prisma, ctx as BotContext);
  });

  bot.command("votar", async (ctx) => {
    await handleVotarCommand(prisma, ctx as BotContext);
  });

}
