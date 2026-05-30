import { Bot } from "grammy";
import { PrismaClient } from "@prisma/client";
import { BotContext } from "../types";
import { t } from "../i18n";
import { extractSimpleKeywords, resolveTreeLanguage } from "../helpers";
import { resolveUserLanguage } from "../messages";


export function register(bot: Bot<BotContext>, prisma: PrismaClient): void {
  // Paso 1: objetivos → Paso 2: subárbol? (inline buttons) → Paso 3: payment mode → Paso 4: árbol padre → Paso 5: WhatsApp

  async function handleOnboardingResponse(ctx: any, prisma: PrismaClient) {
    const session = (ctx as BotContext).session;
    const text: string | undefined = ctx.message.text?.trim();

    // Resolve language: prefer tree.language for groups, user.language for DMs
    let lang: string | null = null;
    const chatType = ctx.chat?.type;

    // ── Guard: solo el creador del grupo puede responder al onboarding ──
    if (chatType === "group" || chatType === "supergroup") {
      const chatId = ctx.chat.id.toString();
      const tree = await prisma.tree.findFirst({
        where: { telegramChatId: chatId },
        select: { id: true, onboardingInviterId: true },
      });
      if (tree?.onboardingInviterId) {
        const inviterId = Number(tree.onboardingInviterId);
        if (ctx.from?.id !== inviterId) {
          return; // ignorar silenciosamente — no es el creador
        }
      }
    }

    if ((chatType === "group" || chatType === "supergroup") && session.onboardingTreeId) {
      lang = await resolveTreeLanguage(prisma, session.onboardingTreeId);
    }
    if (!lang) {
      lang = await resolveUserLanguage(prisma, ctx);
    }
    // Fallback: default to Spanish
    if (!lang) lang = "es";

    // Resolver el árbol si no está en sesión (primera respuesta)
    if (!session.onboardingTreeId) {
      const chatId = ctx.chat.id.toString();
      const tree = await prisma.tree.findFirst({
        where: { telegramChatId: chatId },
      });
      if (!tree) {
        return ctx.reply('❌ ' + t('errors.tree_not_found', lang));
      }
      session.onboardingTreeId = tree.id;
      session.onboardingStep = 1;
    }

    const step = session.onboardingStep;

    if (step === 1) {
      // ── Paso 1: Guardar objetivos ──────────────────────────────────────
      if (!text || text.length < 10) {
        return ctx.reply(t('onboarding.org_tell_more', lang), {
          reply_markup: { force_reply: true, input_field_placeholder: t('onboarding.org_placeholder_detail', lang) },
        });
      }

      const treeId = session.onboardingTreeId;

      // Guardar descripción y objetivos
      await prisma.tree.update({
        where: { id: treeId },
        data: { description: text, objectives: text },
      });

      // Extraer keywords para feedback
      const keywords = extractSimpleKeywords(text);

      let step1Msg = t('onboarding.org_configured', lang) + '\n\n' +
        t('onboarding.org_understood', lang) + '\n' +
        `_"${text}"_\n\n`;

      if (keywords.length > 0) {
        step1Msg += t('onboarding.org_skills_detected', lang, { skills: keywords.slice(0, 5).join(', ') }) + '\n\n';
      }

      // T23: recomendar estructura
      if (text.length > 30) {
        try {
          const recommender = await import('../../services/treeRecommenderService');
          if (recommender.generateRecommendationForNewTree) {
            const recommendation = await recommender.generateRecommendationForNewTree(text);
            if (recommendation) {
              await new Promise(r => setTimeout(r, 2000));
              await ctx.reply(recommendation, { parse_mode: 'Markdown' });
            }
          }
        } catch { /* not implemented yet */ }
      }

      // T26: recomendar tech stack
      if (text.length > 20) {
        try {
          const techStack = await import('../../services/techStackService');
          if (techStack.recommendTechStack && techStack.formatTechStackRecommendation) {
            const ranked = await techStack.recommendTechStack(text);
            if (ranked.length > 0) {
              const successful = await import('../../services/treeRecommenderService');
              const allTrees = await successful.findSuccessfulTrees();
              const similar = await successful.findSimilarTrees(text, allTrees);
              const formatted = techStack.formatTechStackRecommendation(ranked, similar.length);
              if (formatted) {
                await new Promise(r => setTimeout(r, 1500));
                await ctx.reply(formatted, { parse_mode: 'Markdown' });
              }
            }
          }
        } catch { /* not implemented yet */ }
      }

      // Send confirmation, then ask for tree type
      await ctx.reply(step1Msg, { parse_mode: 'Markdown' });

      // Paso 2 → tree type (inline buttons: gremio/academia/empresa)
      session.onboardingStep = 2;
      await new Promise(r => setTimeout(r, 800));
      await ctx.reply(
        t('onboarding.tree_type_question', lang), {
          parse_mode: 'Markdown',
          reply_markup: {
            inline_keyboard: [
              [{ text: t('onboarding.tree_type_gremio', lang), callback_data: 'onboarding:tree_type_gremio' }],
              [{ text: t('onboarding.tree_type_academia', lang), callback_data: 'onboarding:tree_type_academia' }],
              [{ text: t('onboarding.tree_type_empresa', lang), callback_data: 'onboarding:tree_type_empresa' }],
            ],
          },
        }
      );
      return;
    }

    if (step === 4) {
      // ── Paso 4: WhatsApp group ID (T7: renumerado de step 5) ───────────
      if (!text || text === '/skip') {
        // Skip WhatsApp
        session.onboardingStep = null;
        session.onboardingTreeId = null;
        await ctx.reply(t('onboarding.whatsapp_skipped', lang) + '\n\n' + t('onboarding.onboarding_complete', lang), {
          parse_mode: 'Markdown',
        });
        return;
      }

      // Guardar WhatsApp group ID
      await prisma.tree.update({
        where: { id: session.onboardingTreeId },
        data: { whatsappGroupId: text },
      });

      session.onboardingStep = null;
      session.onboardingTreeId = null;
      await ctx.reply(t('onboarding.whatsapp_saved', lang) + '\n\n' + t('onboarding.onboarding_complete', lang), {
        parse_mode: 'Markdown',
      });
      return;
    }
  }


  bot.on("message:text", async (ctx, next) => {
    const msg = ctx.message;
    if (!msg || !("text" in msg)) return next();

    // Check if this is a reply to the onboarding question
    const session = (ctx).session; if (msg.reply_to_message?.from?.id === ctx.me.id && session.onboardingStep > 0) {
      await handleOnboardingResponse(ctx, prisma);
      return;
    }

    return next();
  });

}
