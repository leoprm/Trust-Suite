import { Bot, InputFile } from "grammy";
import { PrismaClient } from "@prisma/client";
import { BotContext } from "../types";
import { handleLanguageCallback, showLanguageSelector, resolveUserLanguage } from "../messages";
import { handleProfileCallback } from "../dm";
import { handleWorkerCallback } from "../worker";
import { handleEncuestaCallback, handleVotarCallback } from "../encuesta";
import { handleNeedPollAnswer } from "../voting";
import { sendSatisfactionPoll } from "../satisfaction";
import { getTreeDepth, parentTreeSelectors, resolveTreeLanguage, trackBotMessage } from "../helpers";
import { t } from "../i18n";
import { routeToHermes } from "../hermesBridge/route";
import { getChatHistory } from "../hermesBridge/history";


export function register(bot: Bot<BotContext>, prisma: PrismaClient): void {
  async function handleKanbanVote(
    prisma: PrismaClient,
    ctx: BotContext,
    proposalId: string,
    vote: "yes" | "no",
  ) {
    const tgUser = ctx.from;
    if (!tgUser) {
      await ctx.answerCallbackQuery({ text: "⚠️ No se pudo identificar tu cuenta" });
      return;
    }

    try {
      // Resolve user by telegramUserId
      const user = await prisma.user.findUnique({
        where: { telegramUserId: BigInt(tgUser.id) },
        select: { id: true },
      });
      if (!user) {
        await ctx.answerCallbackQuery({ text: "⚠️ No tienes cuenta vinculada. Usa /start" });
        return;
      }

      // Verify proposal exists and is OPEN
      // FIXME: table "kanbanProposal" not in DB — add to Prisma schema + create migration
      const proposal = await (prisma as any).kanbanProposal.findUnique({
        where: { id: proposalId },
      });
      if (!proposal) {
        await ctx.answerCallbackQuery({ text: "⚠️ Propuesta no encontrada" });
        return;
      }
      if (proposal.status !== "OPEN") {
        await ctx.answerCallbackQuery({
          text: `⚠️ La propuesta ya está ${proposal.status === "APPROVED" ? "APROBADA" : "RECHAZADA"}`,
        });
        return;
      }
      if (new Date() > new Date(proposal.expiresAt)) {
        await ctx.answerCallbackQuery({ text: "⚠️ La votación ya ha expirado" });
        return;
      }

      // Verify user is active member of the tree
      const member = await prisma.treeMember.findUnique({
        where: { userId_treeId: { userId: user.id, treeId: proposal.treeId } },
      });
      if (!member || member.status !== "ACTIVE") {
        await ctx.answerCallbackQuery({ text: "⚠️ No eres miembro activo de este árbol" });
        return;
      }

      // Tree threshold check: trees with ≤voteThreshold members skip voting → direct execution
      const tree = await prisma.tree.findUnique({
        where: { id: proposal.treeId },
        select: { voteThreshold: true },
      });
      const memberCount = await prisma.treeMember.count({
        where: { treeId: proposal.treeId, status: "ACTIVE" },
      });
      if (memberCount <= (tree?.voteThreshold ?? 20)) {
        // Direct execution — auto-approve without voting
        // FIXME: table "kanbanProposal" not in DB — add to Prisma schema + create migration
        await (prisma as any).kanbanProposal.update({
          where: { id: proposalId },
          data: { status: "APPROVED", resolvedAt: new Date() },
        });
        await ctx.answerCallbackQuery({ text: "⚡ Árbol pequeño — ejecución directa, propuesta aprobada" });
        return;
      }

      // Prevent double vote (unique constraint on proposalId+userId)
      // FIXME: table "kanbanVote" not in DB — add to Prisma schema + create migration
      const existingVote = await (prisma as any).kanbanVote.findUnique({
        where: { proposalId_userId: { proposalId, userId: user.id } },
      });
      if (existingVote) {
        const prevLabel = existingVote.vote === "yes" ? "Sí" : "No";
        await ctx.answerCallbackQuery({ text: `⚠️ Ya votaste (${prevLabel})` });
        return;
      }

      // Record the vote
      // FIXME: table "kanbanVote" not in DB — add to Prisma schema + create migration
      await (prisma as any).kanbanVote.create({
        data: { proposalId, userId: user.id, vote },
      });

      // Increment counter
      const updateData =
        vote === "yes"
          ? { votesYes: { increment: 1 } }
          : { votesNo: { increment: 1 } };
      // FIXME: table "kanbanProposal" not in DB — add to Prisma schema + create migration
      await (prisma as any).kanbanProposal.update({
        where: { id: proposalId },
        data: updateData,
      });

      // Edit DM to show vote confirmation and remove buttons
      const voteLabel = vote === "yes" ? "Sí" : "No";
      const voteEmoji = vote === "yes" ? "✅" : "❌";
      try {
        await ctx.editMessageText(
          `${ctx.callbackQuery?.message?.text ?? ""}\n\n${voteEmoji} Tu voto: ${voteLabel} registrado. Resultado en el grupo cuando cierre la votación.`,
          { reply_markup: undefined },
        );
      } catch {
        // Non-fatal — vote is already recorded; edit may fail if message text is unchanged or too old
        await ctx.answerCallbackQuery({ text: `${voteEmoji} Tu voto: ${voteLabel} registrado` });
        return;
      }

      await ctx.answerCallbackQuery({ text: `${voteEmoji} Tu voto: ${voteLabel} registrado` });
    } catch (err: any) {
      // Prisma unique constraint violation → double vote (race condition safety net)
      if (err?.code === "P2002") {
        await ctx.answerCallbackQuery({ text: "⚠️ Ya votaste en esta propuesta" });
        return;
      }
      console.error("[kanban:vote] DM handler error:", err.message);
      await ctx.answerCallbackQuery({ text: "⚠️ Error al registrar voto" });
    }
  }


  bot.on("callback_query", async (ctx) => {
    const data = ctx.callbackQuery?.data;
    if (!data) {
      await ctx.answerCallbackQuery();
      return;
    }

    // DM tree selector callback
    if (data.startsWith("dm_tree:")) {
      const treeId = data.slice(8); // remove "dm_tree:"
      const session = (ctx as BotContext).session;
      session.dmTreeId = treeId;

      // Verify membership
      const tgUser = ctx.from;
      if (!tgUser) { await ctx.answerCallbackQuery(); return; }
      const user = await prisma.user.findUnique({
        where: { telegramUserId: BigInt(tgUser.id) },
        select: { id: true },
      });
      if (!user) { await ctx.answerCallbackQuery({ text: "⚠️ Sin cuenta" }); return; }
      const member = await prisma.treeMember.findFirst({
        where: { userId: user.id, treeId, status: "ACTIVE" },
        include: { tree: { select: { name: true } } },
      });
      if (!member) {
        await ctx.answerCallbackQuery({ text: "⚠️ No eres miembro de ese árbol" });
        session.dmTreeId = null;
        return;
      }

      await ctx.editMessageText(`🌳 Hablando con Ari en *${member.tree.name}*.`);
      return;
    }

    // Language selector callbacks (DM)
    if (data === "lang:en" || data === "lang:es") {
      const lang = data === "lang:en" ? "en" : "es";
      await handleLanguageCallback(prisma, ctx, lang);
      return;
    }

    // Language selector callbacks (group welcome)
    if (data.startsWith("lang_group:")) {
      const parts = data.split(":");
      // parts = ["lang_group", "en"|"es", "treeId"]
      if (parts.length >= 3) {
        const lang = parts[1];
        const treeId = parts.slice(2).join(":"); // treeId may contain ':' if UUID
        if (lang === "en" || lang === "es") {
          await ctx.answerCallbackQuery();

          // Save language to tree
          try {
            await prisma.tree.update({
              where: { id: treeId },
              data: { language: lang },
            });
          } catch (err: any) {
            console.error("[lang_group] Failed to update tree language:", err.message);
          }

          // Edit selector message to confirm
          try {
            await ctx.editMessageText(t("common.language_selected", lang), {
              reply_markup: undefined,
            });
          } catch {
            // Ok if edit fails
          }

          // Send welcome message in the selected language
          const welcomeMsg = await ctx.reply(t("onboarding.welcome_group", lang), {
            parse_mode: "Markdown",
          });
          trackBotMessage(prisma, treeId, welcomeMsg.message_id);

          // Send DM voting notice
          await new Promise(r => setTimeout(r, 1200));
          const dmNotice = lang === "en"
            ? "📩 *Voting setup*: Members need to send me \"hello\" via DM (https://t.me/TrustMakerBot) to receive voting polls. Only DM-enabled members can vote."
            : "📩 *Configuración de votación*: Los miembros deben enviarme \"hola\" por DM (https://t.me/TrustMakerBot) para recibir las encuestas. Solo los miembros habilitados por DM podrán votar.";
          await ctx.reply(dmNotice, { parse_mode: "Markdown" });

          // Send monthly reports question
          await new Promise(r => setTimeout(r, 1200));
          await ctx.reply(
            t("onboarding.monthly_reports_question", lang),
            {
              parse_mode: "Markdown",
              reply_markup: {
                inline_keyboard: [[
                  {
                    text: t("onboarding.monthly_reports_yes", lang),
                    callback_data: "informe_si:" + treeId,
                  },
                  {
                    text: t("onboarding.monthly_reports_no", lang),
                    callback_data: "informe_no:" + treeId,
                  },
                ]],
              },
            }
          );

          // Send subtree question after brief pause
          await new Promise(r => setTimeout(r, 1500));
          await ctx.reply(
            "¿Es este un sub-árbol?",
            {
              reply_markup: {
                inline_keyboard: [[
                  {
                    text: "\uD83C\uDF3F Sí, es sub-árbol",
                    callback_data: "osub_y:" + treeId,
                  },
                  {
                    text: "\uD83C\uDF33 No, es independiente",
                    callback_data: "osub_n:" + treeId,
                  },
                ]],
              },
            }
          );

          // Set onboarding session state
          const session = (ctx as BotContext).session;
          session.onboardingTreeId = treeId;
          session.onboardingStep = 1;

          // Guardar el creador del grupo como único autorizado para onboarding
          try {
            const admins = await ctx.getChatAdministrators();
            const creator = admins.find((a: any) => a.status === "creator");
            const inviterId = creator ? BigInt(creator.user.id) : BigInt(ctx.from.id);
            await prisma.tree.update({
              where: { id: treeId },
              data: { onboardingInviterId: inviterId },
            });
          } catch {
            // Fallback: usar quien seleccionó el idioma
            await prisma.tree.update({
              where: { id: treeId },
              data: { onboardingInviterId: BigInt(ctx.from.id) },
            });
          }
        }
      }
      return;
    }

    // XR-7: Monthly reports toggle callbacks (onboarding Si/No)
    if (data.startsWith("informe_si:") || data.startsWith("informe_no:")) {
      const enabled = data.startsWith("informe_si:");
      const treeId = data.split(":")[1];

      if (!treeId) {
        await ctx.answerCallbackQuery();
        return;
      }

      try {
        await prisma.tree.update({
          where: { id: treeId },
          data: { monthlyReportsEnabled: enabled },
        });
      } catch (err: any) {
        console.error("[informe_si/no] Failed to update tree:", err.message);
      }

      // Remove inline keyboard
      try { await ctx.editMessageReplyMarkup({ reply_markup: undefined }); } catch { /* ok */ }

      // Load tree language for confirmation message
      let lang = "es";
      try {
        const t = await prisma.tree.findUnique({
          where: { id: treeId },
          select: { language: true },
        });
        if (t?.language) lang = t.language;
      } catch { /* default es */ }

      await ctx.answerCallbackQuery({
        text: enabled
          ? t("onboarding.monthly_reports_enabled", lang)
          : t("onboarding.monthly_reports_disabled", lang),
      });

      return;
    }

    // T2: Early subtree question callbacks (group onboarding, before language selector)
    if (data.startsWith("osub_y:") || data.startsWith("osub_n:")) {
      const isYes = data.startsWith("osub_y:");
      const treeId = data.split(":")[1]; // treeId follows the prefix

      // Validate treeId is present (session may not be available in my_chat_member context)
      if (!treeId) {
        await ctx.answerCallbackQuery();
        return;
      }

      // Remove inline keyboard from the question message
      try { await ctx.editMessageReplyMarkup({ reply_markup: undefined }); } catch { /* ok */ }

      if (!isYes) {
        // No → language already selected, go to org question
        await ctx.answerCallbackQuery();

        // Read language from tree
        let lang = "es";
        try {
          const t = await prisma.tree.findUnique({
            where: { id: treeId },
            select: { language: true },
          });
          if (t?.language) lang = t.language;
        } catch { /* default es */ }

        await ctx.reply(
          t("onboarding.org_question", lang) + "\n\n" +
          t("onboarding.org_examples", lang) + "\n\n" +
          "_" + t("onboarding.org_prompt", lang) + "_",
          {
            parse_mode: "Markdown",
            reply_markup: {
              force_reply: true,
              input_field_placeholder: t("onboarding.org_placeholder", lang),
            },
          }
        );

        // Set onboarding session state for org reply handling
        const session = (ctx as BotContext).session;
        session.onboardingTreeId = treeId;
        session.onboardingStep = 1;
        return;
      }

      // Yes → fetch user's memberships and show parent tree selector
      await ctx.answerCallbackQuery();

      const tgId = ctx.from!.id;
      const user = await prisma.user.findUnique({
        where: { telegramUserId: BigInt(tgId) },
        select: { id: true },
      });

      if (!user) {
        await ctx.api.sendMessage(ctx.chat!.id, "⚠️ No se encontró tu cuenta. Continuando con el selector de idioma...");
        return;
      }

      const memberships = await prisma.treeMember.findMany({
        where: {
          userId: user.id,
          status: "ACTIVE",
          treeId: { not: treeId }, // exclude current tree
        },
          include: {
            tree: { select: { id: true, name: true, icono: true, createdAt: true } },
          },
          orderBy: { tree: { createdAt: 'desc' } },
        take: 50, // show all trees
      });

      if (memberships.length === 0) {
        await ctx.api.sendMessage(
          ctx.chat!.id,
          "No tienes otros árboles donde seas miembro. Continuando...",
        );

        // Language already selected, go to org question
        let lang = "es";
        try {
          const t = await prisma.tree.findUnique({
            where: { id: treeId },
            select: { language: true },
          });
          if (t?.language) lang = t.language;
        } catch { /* default es */ }

        await ctx.reply(
          t("onboarding.org_question", lang) + "\n\n" +
          t("onboarding.org_examples", lang) + "\n\n" +
          "_" + t("onboarding.org_prompt", lang) + "_",
          {
            parse_mode: "Markdown",
            reply_markup: {
              force_reply: true,
              input_field_placeholder: t("onboarding.org_placeholder", lang),
            },
          }
        );

        const session = (ctx as BotContext).session;
        session.onboardingTreeId = treeId;
        session.onboardingStep = 1;
        return;
      }

      // T3: Parent tree selector — inline keyboard with tree icon + name
      // Use short callback_data: "psel:<idx>" with idx referencing memberships array
      const parentMap = new Map<string, string>();
      const keyboard = memberships.map((m, i) => {
        const key = `psel:${i}`;
        parentMap.set(key, JSON.stringify({ childId: treeId, parentId: m.tree.id }));
        return [{
          text: `${m.tree.icono || "\uD83C\uDF33"} ${m.tree.name}`,
          callback_data: key, // ~7 chars, well within 64-byte limit
        }];
      });
      // Store mapping keyed by chatId for retrieval in callback handler
      parentTreeSelectors.set(ctx.chat!.id.toString(), parentMap);

      try {
        await ctx.api.sendMessage(
          ctx.chat!.id,
          "Selecciona el árbol padre:",
          { reply_markup: { inline_keyboard: keyboard } },
        );
      } catch (err: any) {
        console.error("[parent_selector] sendMessage error:", err.message);
        await ctx.api.sendMessage(ctx.chat!.id, "⚠️ Error al mostrar el selector. Continuando con el idioma...");
      }
      return;
    }

    // T3: Parent tree selection callback (subtree early onboarding)
    if (data.startsWith("psel:")) {
      const chatId = ctx.chat!.id.toString();
      const chatMap = parentTreeSelectors.get(chatId);
      if (!chatMap) {
        await ctx.answerCallbackQuery({ text: "Selector expirado. Reintenta." });
        return;
      }
      const payload = chatMap.get(data);
      if (!payload) {
        await ctx.answerCallbackQuery({ text: "Opción no encontrada." });
        return;
      }
      const { childId, parentId } = JSON.parse(payload) as { childId: string; parentId: string };

      const tgId = ctx.from!.id;
      const user = await prisma.user.findUnique({
        where: { telegramUserId: BigInt(tgId) },
        select: { id: true },
      });

      if (!user) {
        await ctx.editMessageText(
          "⚠️ No se encontró tu cuenta. Contacta a @TrustHelpDeskBot.",
          { reply_markup: undefined },
        );
        await ctx.answerCallbackQuery();
        return;
      }

      const parentMembership = await prisma.treeMember.findFirst({
        where: {
          userId: user.id,
          treeId: parentId,
          status: "ACTIVE",
        },
      });

      if (!parentMembership) {
        await ctx.editMessageText(
          "⚠️ No eres miembro activo de ese árbol. Selecciona otro o continúa con el selector de idioma.",
          { reply_markup: undefined },
        );
        await ctx.answerCallbackQuery();
        return;
      }

      // Link child tree to parent
      try {
        await prisma.tree.update({
          where: { id: childId },
          data: { parentTreeId: parentId },
        });

        // T4: Notify parent chat about new sub-tree linkage
        const parentTree = await prisma.tree.findUnique({
          where: { id: parentId },
          select: { telegramChatId: true, name: true },
        });
        const childTree = await prisma.tree.findUnique({
          where: { id: childId },
          select: { name: true },
        });

        if (parentTree?.telegramChatId && childTree) {
          const bridgeMsg = `🌿 *Nuevo sub-árbol vinculado:* 🌳 ${childTree.name}\nAhora las IAs de ambos árboles pueden colaborar.`;
          try {
            await ctx.api.sendMessage(parentTree.telegramChatId, bridgeMsg, {
              parse_mode: "Markdown",
            });
          } catch (sendErr: any) {
            console.error("[parent_select] Failed to notify parent chat:", sendErr.message);
          }
        }

        await ctx.editMessageText("✅ Vinculado como sub-árbol.", { reply_markup: undefined });

        // RG5: Warning for deep sub-trees (depth ≥ 2)
        const parentDepth = await getTreeDepth(prisma, parentId);
        const childDepth = parentDepth + 1;
        if (childDepth >= 2) {
          await ctx.reply(
            `⚠️ Este sub-árbol tendrá ${childDepth} niveles de profundidad. La latencia de coordinación entre Aris aumenta con cada nivel.`,
          );
        }
      } catch (err: any) {
        console.error("[parent_select] Failed to link parent tree:", err.message);
        await ctx.editMessageText("❌ Error al vincular. Intenta de nuevo.", { reply_markup: undefined });
      }
      await ctx.answerCallbackQuery();

      // Language already selected, go to org question
      let lang = "es";
      try {
        const t = await prisma.tree.findUnique({
          where: { id: childId },
          select: { language: true },
        });
        if (t?.language) lang = t.language;
      } catch { /* default es */ }

      await ctx.reply(
        t("onboarding.org_question", lang) + "\n\n" +
        t("onboarding.org_examples", lang) + "\n\n" +
        "_" + t("onboarding.org_prompt", lang) + "_",
        {
          parse_mode: "Markdown",
          reply_markup: {
            force_reply: true,
            input_field_placeholder: t("onboarding.org_placeholder", lang),
          },
        }
      );

      const session = (ctx as BotContext).session;
      session.onboardingTreeId = childId;
      session.onboardingStep = 1;
      return;
    }

    // Onboarding multi-step: Paso 2 → tree type (gremio/academia/empresa)
    if (data.startsWith("onboarding:tree_type_")) {
      const session = (ctx as BotContext).session;
      if (!session.onboardingTreeId || session.onboardingStep !== 2) {
        await ctx.answerCallbackQuery();
        return;
      }

      const treeType = data.slice("onboarding:tree_type_".length); // "gremio" | "academia" | "empresa"
      if (!["gremio", "academia", "empresa"].includes(treeType)) {
        await ctx.answerCallbackQuery({ text: "⚠️ Tipo inválido" });
        return;
      }

      // Resolve language
      let lang: string | null = null;
      const chatType = ctx.chat?.type;
      if ((chatType === "group" || chatType === "supergroup") && session.onboardingTreeId) {
        lang = await resolveTreeLanguage(prisma, session.onboardingTreeId);
      }
      if (!lang) {
        lang = await resolveUserLanguage(prisma, ctx);
      }
      if (!lang) lang = "es";

      // Remove inline keyboard from the question message
      try { await ctx.editMessageReplyMarkup({ reply_markup: undefined }); } catch { /* ok */ }

      // Save classification to tree DB field
      const classificationData = {
        type: treeType,
        skills: [] as string[],
        source: "onboarding",
        classifiedAt: new Date().toISOString(),
      };

      try {
        await prisma.tree.update({
          where: { id: session.onboardingTreeId },
          data: {
            classification: classificationData,
            classificationUpdatedAt: new Date(),
          },
        });
      } catch (err: any) {
        console.error("[onboarding:tree_type] Failed to save classification:", err.message);
      }

      // Save to sandbox tree-classification.json (non-blocking)
      try {
        const SANDBOX_BASE = process.env.SANDBOX_BASE_DIR || "/home/trustmaker/trees";
        const sandboxDir = require("path").join(SANDBOX_BASE, session.onboardingTreeId);
        require("fs").mkdirSync(sandboxDir, { recursive: true });
        const filePath = require("path").join(sandboxDir, "tree-classification.json");
        require("fs").writeFileSync(filePath, JSON.stringify(classificationData, null, 2), "utf-8");
      } catch { /* non-blocking: sandbox may not exist yet */ }

      // Confirm and advance to payment mode (step 3)
      const typeLabels: Record<string, string> = {
        gremio: t("onboarding.tree_type_gremio", lang),
        academia: t("onboarding.tree_type_academia", lang),
        empresa: t("onboarding.tree_type_empresa", lang),
      };
      const typeLabel = typeLabels[treeType] || treeType;

      await ctx.reply(
        t("onboarding.tree_type_saved", lang, { type: typeLabel }), {
          parse_mode: "Markdown",
        }
      );

      // Paso 3 → payment mode
      session.onboardingStep = 3;
      await new Promise(r => setTimeout(r, 600));
      await ctx.reply(
        t("onboarding.payment_mode_question", lang), {
          parse_mode: "Markdown",
          reply_markup: {
            inline_keyboard: [[
              { text: t("onboarding.payment_mode_centralized", lang), callback_data: "onboarding:payment_centralized" },
              { text: t("onboarding.payment_mode_individual", lang), callback_data: "onboarding:payment_individual" },
            ]],
          },
        }
      );

      await ctx.answerCallbackQuery();
      return;
    }

    // Onboarding multi-step callbacks (Paso 3: payment mode)
    if (data === "onboarding:payment_centralized" || data === "onboarding:payment_individual") {
      const session = (ctx as BotContext).session;
      if (!session.onboardingTreeId || session.onboardingStep !== 3) {
        await ctx.answerCallbackQuery();
        return;
      }

      // Resolve language
      let lang: string | null = null;
      const chatType = ctx.chat?.type;
      if ((chatType === "group" || chatType === "supergroup") && session.onboardingTreeId) {
        lang = await resolveTreeLanguage(prisma, session.onboardingTreeId);
      }
      if (!lang) {
        lang = await resolveUserLanguage(prisma, ctx);
      }
      if (!lang) lang = "es";

      // Remove inline keyboard from the question message
      try { await ctx.editMessageReplyMarkup({ reply_markup: undefined }); } catch { /* ok */ }

      const paymentMode: "CENTRALIZED" | "INDIVIDUAL" =
        data === "onboarding:payment_centralized" ? "CENTRALIZED" : "INDIVIDUAL";

      if (paymentMode === "CENTRALIZED") {
        // Find the user to set as sponsor
        const tgId = BigInt(ctx.from!.id);
        const sponsorUser = await prisma.user.findUnique({
          where: { telegramUserId: tgId },
          select: { id: true },
        });

        await prisma.tree.update({
          where: { id: session.onboardingTreeId },
          data: {
            paymentMode: "CENTRALIZED",
            sponsorId: sponsorUser?.id || null,
          },
        });

        await ctx.reply(t("onboarding.payment_mode_centralized_selected", lang) +
          "\n\n💳 Configura tu método de pago con /pagar", {
            parse_mode: "Markdown",
          });

        // Centralized: done with onboarding (no parent code or WhatsApp for now)
        session.onboardingStep = null;
        session.onboardingTreeId = null;
        await new Promise(r => setTimeout(r, 500));
        await ctx.reply(t("onboarding.onboarding_complete", lang), {
          parse_mode: "Markdown",
        });
      } else {
        // Individual mode
        await prisma.tree.update({
          where: { id: session.onboardingTreeId },
          data: { paymentMode: "INDIVIDUAL" },
        });

        await ctx.reply(t("onboarding.payment_mode_individual_selected", lang), {
          parse_mode: "Markdown",
        });

        // T7: Parent code step removed — both paths go directly to WhatsApp (step 4)
        session.onboardingStep = 4;
        await new Promise(r => setTimeout(r, 600));
        await ctx.reply(
          t("onboarding.whatsapp_prompt", lang), {
            parse_mode: "Markdown",
            reply_markup: { force_reply: true, input_field_placeholder: t("onboarding.whatsapp_placeholder", lang) },
          }
        );
      }
      await ctx.answerCallbackQuery();
      return;
    }

    // Kanban vote callbacks (DM inline buttons: kanban_vote:PROPOSAL_ID:yes|no)
    if (data.startsWith("kanban_vote:")) {
      const parts = data.split(":");
      // parts = ["kanban_vote", "PROPOSAL_ID", "yes"|"no"]
      if (parts.length >= 3) {
        const proposalId = parts.slice(1, -1).join(":"); // handle UUIDs with dashes
        const vote = parts[parts.length - 1] as "yes" | "no";
        await handleKanbanVote(prisma, ctx as BotContext, proposalId, vote);
      } else {
        await ctx.answerCallbackQuery({ text: "⚠️ Datos de votación inválidos" });
      }
      return;
    }

    // Attach:link_confirm — user picks from multiple matching tasks
    if (data.startsWith("attach:link_confirm:")) {
      const parts = data.split(":");
      // parts = ["attach", "link_confirm", todoId, ...filePathParts]
      const todoId = parts[2];
      const filePath = parts.slice(3).join(":");

      if (!todoId || !filePath) {
        await ctx.answerCallbackQuery({ text: "⚠️ Datos inválidos" });
        return;
      }

      try {
        const todo = await prisma.todo.findUnique({
          where: { id: todoId },
          select: { id: true, text: true, summary: true },
        });
        if (!todo) {
          await ctx.editMessageText("⚠️ La tarea ya no existe.");
          return;
        }
        const fileNote = `\n📎 Archivo vinculado: ${filePath}`;
        await prisma.todo.update({
          where: { id: todo.id },
          data: { text: (todo.text || "") + fileNote },
        });
        await ctx.editMessageText(
          `🔗 Archivo vinculado a la tarea *${todo.summary}*.`,
          { parse_mode: "Markdown" }
        );
      } catch (err: any) {
        console.error("[attach:link_confirm] Error:", err.message);
        await ctx.answerCallbackQuery({ text: "⚠️ Error al vincular" });
      }
      return;
    }

    // Worker callbacks (onboarding currency/confirm/edit/toggle/claim)
    if (data.startsWith("worker_")) {
      await handleWorkerCallback(prisma, ctx as BotContext);
      return;
    }

    // External task callbacks (claim/deliver)
    if (data.startsWith("external_")) {
      const { handleExternalCallback } = await import("../worker");
      await handleExternalCallback(prisma, ctx as BotContext);
      return;
    }

    // Attach file callbacks (sandbox file buttons: photo/document uploads)
    if (data.startsWith("attach:")) {
      const parts = data.split(":");
      // parts = ["attach", action, treeId, ...filePathParts]
      const action = parts[1];
      const treeId = parts[2];
      const filePath = parts.slice(3).join(":");

      if (!action || !treeId || !filePath) {
        await ctx.answerCallbackQuery({ text: "⚠️ Datos inválidos" });
        return;
      }

      await ctx.answerCallbackQuery();

      switch (action) {
        case "link": {
          // Step 1: save state, ask user which task to link
          const session = (ctx as BotContext).session;
          session.awaitingLinkFile = filePath;
          session.awaitingLinkTreeId = treeId;
          await ctx.editMessageText(
            "🔗 ¿A qué tarea quieres vincular este archivo?\nResponde con el nombre o ID de la tarea."
          );
          break;
        }
        case "analyze": {
          try {
            await ctx.editMessageText("🔍 Enviando a Ari para análisis...");
            const chatHistory = ctx.chat?.id
              ? await getChatHistory(ctx.chat.id, treeId, 20)
              : [];
            await routeToHermes(
              `Analiza el archivo "${filePath}" en el sandbox del árbol ${treeId}. Describe su contenido, utilidad y si detectas algo relevante para las necesidades del árbol.`,
              treeId,
              ctx.from?.id?.toString() ?? "0",
              chatHistory,
              ctx.from?.first_name,
              ctx.chat?.id,
              ctx.callbackQuery?.message?.message_id,
            );
          } catch (err: any) {
            console.error("[attach:analyze] Error routing to Hermes:", err.message);
          }
          break;
        }
        case "keep": {
          await ctx.editMessageText("💾 Archivo guardado en el sandbox del árbol.");
          break;
        }
        case "discard": {
          try {
            const TREES_BASE = process.env.SANDBOX_BASE_DIR || "/home/leo/trees";
            const fullPath = require("path").join(TREES_BASE, treeId, filePath);
            const resolved = require("path").resolve(fullPath);
            // Safety: ensure path is inside the tree's sandbox
            const sandboxRoot = require("path").resolve(TREES_BASE, treeId);
            if (!resolved.startsWith(sandboxRoot)) {
              await ctx.editMessageText("⚠️ Ruta insegura, descarte cancelado.");
              return;
            }
            require("fs").unlinkSync(resolved);
            await ctx.editMessageText("🗑 Archivo descartado.");
          } catch (err: any) {
            console.error("[attach:discard] Error deleting file:", err.message);
            await ctx.editMessageText(
              err.code === "ENOENT"
                ? "⚠️ El archivo ya no existe."
                : "⚠️ Error al descartar el archivo."
            );
          }
          break;
        }
        default: {
          await ctx.answerCallbackQuery({ text: "⚠️ Acción no reconocida" });
        }
      }
      return;
    }

    // ── Candidate: "Yo puedo" button (tree-first hiring, V4 i18n) ────────────
    // Callback format: candidate:apply:<treeId>:<taskId>
    if (data.startsWith("candidate:apply:")) {
      const rest = data.slice("candidate:apply:".length);
      const colonIdx = rest.indexOf(":");
      if (colonIdx === -1) {
        await ctx.answerCallbackQuery({ text: t("v1_candidate.callback_invalid", "es") });
        return;
      }
      const treeId = rest.slice(0, colonIdx);
      const taskId = rest.slice(colonIdx + 1);

      if (!treeId || !taskId) {
        await ctx.answerCallbackQuery({ text: t("v1_candidate.callback_incomplete", "es") });
        return;
      }

      const tgUser = ctx.from;
      if (!tgUser) {
        await ctx.answerCallbackQuery({ text: t("v1_candidate.callback_no_user", "es") });
        return;
      }

      const lng = await resolveUserLanguage(prisma, ctx) ?? tgUser.language_code ?? "es";

      const user = await prisma.user.findUnique({
        where: { telegramUserId: BigInt(tgUser.id) },
        select: { id: true, firstName: true },
      });
      if (!user) {
        await ctx.answerCallbackQuery({ text: t("v1_candidate.callback_no_account", lng) });
        return;
      }

      // Verify user is active member of the tree (treeId from callback, no ExternalTask needed)
      const member = await prisma.treeMember.findUnique({
        where: { userId_treeId: { userId: user.id, treeId } },
        select: { status: true },
      });
      if (!member || member.status !== "ACTIVE") {
        await ctx.answerCallbackQuery({ text: t("v1_candidate.callback_not_member", lng) });
        return;
      }

      // Check for duplicate application
      const existing = await prisma.candidate.findFirst({
        where: { userId: user.id, taskId },
      });
      if (existing) {
        await ctx.answerCallbackQuery({ text: t("v1_candidate.callback_already_applied", lng) });
        return;
      }

      // Register candidate
      try {
        await prisma.candidate.create({
          data: { userId: user.id, taskId, treeId },
        });
        await ctx.answerCallbackQuery({ text: t("v1_candidate.applied_ok", lng) });

        // Get updated candidate count
        const candidateCount = await prisma.candidate.count({
          where: { taskId },
        });

        // Group notification: "@user se postulo (N candidatos)"
        const userMention = tgUser.first_name || tgUser.username || `tg${tgUser.id}`;
        const plural = candidateCount !== 1 ? "s" : "";
        try {
          await ctx.reply(
            t("v1_candidate.group_notify", lng, { name: userMention, count: candidateCount, plural }),
            { parse_mode: "MarkdownV2" },
          );
        } catch (notifyErr: any) {
          console.error("[candidate:apply] Group notify error:", notifyErr.message);
        }

        // Edit the button to show updated candidate count
        try {
          const buttonLabel = t("v1.button_apply_count", lng, { count: candidateCount });
          await ctx.editMessageReplyMarkup({
            reply_markup: {
              inline_keyboard: [[
                { text: buttonLabel, callback_data: `candidate:apply:${treeId}:${taskId}` },
              ]],
            },
          });
        } catch { /* message may already be edited */ }
      } catch (err: any) {
        console.error("[candidate:apply] Error:", err.message);
        await ctx.answerCallbackQuery({ text: t("v1_candidate.callback_error", lng) });
      }
      return;
    }

    // ── Hiring DM callbacks: Postular / Ignorar (D3) ──────────────────────
    // Callback format: post_<taskId>  or  ignr_<taskId>
    if (data.startsWith("post_") || data.startsWith("ignr_")) {
      const isApply = data.startsWith("post_");
      const prefix = isApply ? "post_" : "ignr_";
      const taskId = data.slice(prefix.length);

      if (!taskId) {
        await ctx.answerCallbackQuery({ text: "⚠️ Datos inválidos" });
        return;
      }

      const tgUser = ctx.from;
      if (!tgUser) {
        await ctx.answerCallbackQuery({ text: t("hiring.callback_no_user", "es") });
        return;
      }

      const user = await prisma.user.findUnique({
        where: { telegramUserId: BigInt(tgUser.id) },
        select: { id: true, firstName: true },
      });
      if (!user) {
        await ctx.answerCallbackQuery({ text: "⚠️ No tienes cuenta vinculada. Usa /start en @TrustMakerBot." });
        return;
      }

      // Resolve language from the user or fallback to es
      const userLang = (user as any).language ?? "es";
      const lng = (userLang === "en" ? "en" : "es") as "es" | "en";

      // Check for duplicate
      const existing = await prisma.hiringApplicant.findUnique({
        where: { taskId_userId: { taskId, userId: user.id } },
      });
      if (existing) {
        const label = existing.status === "APPLIED"
          ? t("hiring.callback_already_applied", lng)
          : t("hiring.ignorar_discarded", lng);
        await ctx.answerCallbackQuery({ text: label });
        return;
      }

      // Resolve treeId and endDate — try ExternalTask first, fall back to sandbox
      let treeId = "";
      let endDate: string | null = null;

      const externalTask = await prisma.externalTask.findFirst({
        where: { kanbanTaskId: taskId },
        select: { id: true, endDate: true, treeId: true },
      });

      if (externalTask) {
        treeId = externalTask.treeId;
        endDate = externalTask.endDate;
      } else {
        // Fallback: scan sandboxes for hiring-request-<taskId>.json
        try {
          const fsSync = require("fs");
          const pathMod = require("path");
          const sandboxBase = process.env.SANDBOX_BASE_DIR || "/home/trustmaker/trees";
          if (fsSync.existsSync(sandboxBase)) {
            const dirs = fsSync.readdirSync(sandboxBase, { withFileTypes: true });
            for (const dir of dirs) {
              if (!dir.isDirectory() || dir.name.startsWith(".")) continue;
              const reqPath = pathMod.join(sandboxBase, dir.name, `hiring-request-${taskId}.json`);
              if (fsSync.existsSync(reqPath)) {
                const raw = fsSync.readFileSync(reqPath, "utf-8");
                const reqData = JSON.parse(raw);
                treeId = reqData.treeId || dir.name;
                endDate = reqData.endDate || null;
                break;
              }
            }
          }
        } catch (scanErr: any) {
          console.error("[hiring callback] Sandbox scan error:", scanErr.message);
        }
      }

      // Format endDate for display
      const endDateStr = endDate
        ? new Date(endDate).toLocaleDateString(lng === "en" ? "en-US" : "es-CL", {
            day: "numeric", month: "short", year: "numeric",
          })
        : "TBD";

      // If applying, check deadline
      if (isApply && endDate) {
        const now = new Date();
        if (now > new Date(endDate)) {
          await ctx.answerCallbackQuery({
            text: t("hiring.postular_closed", lng, { endDate: endDateStr }),
            show_alert: true,
          });
          return;
        }
      }

      if (isApply) {
        // Verify user is in the filtered candidates list (ExternalTaskNotification)
        if (externalTask) {
          const notified = await prisma.externalTaskNotification.findUnique({
            where: { externalTaskId_userId: { externalTaskId: externalTask.id, userId: user.id } },
          });
          if (!notified) {
            await ctx.answerCallbackQuery({ text: t("hiring.callback_not_candidate", lng) });
            return;
          }
        }
      }

      const newStatus = isApply ? "APPLIED" : "IGNORED";

      try {
        await prisma.hiringApplicant.create({
          data: {
            taskId,
            userId: user.id,
            treeId: treeId,
            status: newStatus,
          },
        });

        // Edit the DM message and remove inline keyboard
        const newText = isApply
          ? t("hiring.postular_registered", lng, { endDate: endDateStr })
          : t("hiring.ignorar_discarded", lng);

        try {
          await ctx.editMessageText(newText, {
            reply_markup: undefined,
          });
        } catch (editErr: any) {
          // Fallback: edit only the reply markup, then answer with alert
          console.error("[hiring callback] editMessageText failed:", editErr.message);
          try {
            await ctx.editMessageReplyMarkup({ reply_markup: undefined });
          } catch { /* DM may not be editable at all */ }
          await ctx.answerCallbackQuery({ text: newText, show_alert: true });
          return;
        }

        await ctx.answerCallbackQuery();
        console.log(
          `[hiring callback] User ${user.id} ${isApply ? "APPLIED" : "IGNORED"} to task ${taskId}`,
        );
      } catch (err: any) {
        // Prisma unique constraint violation → race condition safety net
        if (err?.code === "P2002") {
          await ctx.answerCallbackQuery({ text: t("hiring.callback_already_applied", lng) });
          return;
        }
        console.error("[hiring callback] Error:", err.message);
        await ctx.answerCallbackQuery({ text: t("hiring.callback_error", lng) });
      }
      return;
    }

    // ── Unlink child tree callback (🗑️ Desvincular button) ──
    if (data.startsWith("unlink_child:")) {
      const childTreeId = data.slice("unlink_child:".length);
      if (!childTreeId) {
        await ctx.answerCallbackQuery();
        return;
      }

      // Find parent tree by telegramChatId
      const parentTree = await prisma.tree.findFirst({
        where: { telegramChatId: ctx.chat!.id.toString() },
        select: { id: true, name: true },
      });
      if (!parentTree) {
        await ctx.answerCallbackQuery();
        return;
      }

      // Verify user exists
      const tgUser = ctx.from;
      if (!tgUser) {
        await ctx.answerCallbackQuery();
        return;
      }
      const user = await prisma.user.findUnique({
        where: { telegramUserId: BigInt(tgUser.id) },
        select: { id: true },
      });
      if (!user) {
        await ctx.answerCallbackQuery({ text: "⚠️ Sin cuenta" });
        return;
      }

      // Check admin role
      const isAdmin = await prisma.treeMember.findFirst({
        where: { treeId: parentTree.id, userId: user.id, role: "ADMIN" },
      });
      if (!isAdmin) {
        await ctx.answerCallbackQuery({
          text: "Solo los administradores pueden desvincular subárboles",
        });
        return;
      }

      // Verify child tree exists and is actually a child of this parent
      const childTree = await prisma.tree.findFirst({
        where: { id: childTreeId, parentTreeId: parentTree.id },
        select: { id: true, name: true, telegramChatId: true },
      });
      if (!childTree) {
        await ctx.answerCallbackQuery({
          text: "Este subárbol ya no existe o ya fue desvinculado.",
        });
        return;
      }

      // Unlink: set parentTreeId to null
      try {
        await prisma.tree.update({
          where: { id: childTreeId },
          data: { parentTreeId: null },
        });

        // Notify child group
        if (childTree.telegramChatId) {
          try {
            await ctx.api.sendMessage(
              childTree.telegramChatId,
              `Tu árbol ha sido desvinculado de *${parentTree.name}*.`,
              { parse_mode: "Markdown" },
            );
          } catch (tgErr: any) {
            console.error(
              `[unlink_child] Telegram notify failed for child ${childTreeId}:`,
              tgErr.message,
            );
          }
        }

        // Edit the original message to show confirmation
        const userName = tgUser.first_name || tgUser.username || `tg${tgUser.id}`;
        try {
          const originalText = ctx.callbackQuery?.message?.text ?? "";
          await ctx.editMessageText(
            `${originalText}\n\n✅ Desvinculado por ${userName}`,
            { reply_markup: undefined },
          );
        } catch (editErr: any) {
          // Fallback: answer with alert if message can't be edited
          console.error("[unlink_child] editMessageText failed:", editErr.message);
          await ctx.answerCallbackQuery({
            text: `✅ Desvinculado por ${userName}`,
          });
          return;
        }

        await ctx.answerCallbackQuery();
        console.log(
          `[unlink_child] ${userName} unlinked child ${childTreeId} from parent ${parentTree.id}`,
        );
      } catch (err: any) {
        console.error("[unlink_child] Error:", err.message);
        await ctx.answerCallbackQuery({
          text: "Error al desvincular. Intenta de nuevo.",
        });
      }
      return;
    }

    // ── Encuesta callbacks (target selection, survey selector, voting) ──
    let handled = await handleEncuestaCallback(prisma, bot, ctx as BotContext);
    if (handled) return;

    handled = await handleVotarCallback(prisma, bot, ctx as BotContext);
    if (handled) return;

    handled = await handleProfileCallback(prisma, ctx as BotContext);
    if (!handled) {
      // Unknown callback — acknowledge silently
      await ctx.answerCallbackQuery();
    }
  });

}
