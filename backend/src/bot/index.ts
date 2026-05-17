import https from "https";
import { Bot, session, InputFile } from "grammy";
import { PrismaClient } from "@prisma/client";
import { BotContext, BotSessionData } from "./types";
import { handleMessage, extractCommandText } from "./commands";
import { handleNaturalMessage, showLanguageSelector, handleLanguageCallback, resolveUserLanguage } from "./messages";
import { handleDM, handleProfileCallback } from "./dm";
import { analyzeMessage } from "./analyzer";
import { registerReactionHandler, handleNeedPollAnswer } from "./voting";
import { findTreeByChat } from "./treeResolver";
import {
  sendSatisfactionPoll,
  handleSatisfactionPollAnswer,
  handleSatisfactionCommentReply,
} from "./satisfaction";
import { recoverPendingApprovals } from "./approval";
import { checkPaymentAccess } from "./payment";
import { initPaymentService, computePaymentObligations, formatPagarResult } from "../services/telegramBotService";
import { formatForChannel, sendViaTelegram } from "./channelAdapter";
import { textToSpeech } from "../services/ttsService";
import { TreeSandbox } from "../services/treeSandbox";
import { initI18n, t } from "./i18n";
import { routeToHermes } from "./hermesBridge";
import { parseDeadline } from "./deadlineParser";
import { checkTodoReminders } from "./todoReminders";
import { detectNaturalAddIntent } from "./todoNaturalAdd";
import { summarizeTodo } from "./formatters";

// ── IPv4 fetch wrapper: undici (Node fetch) no respeta dns.setDefaultResultOrder ──
// para api.telegram.org. Usamos https.get con family:4 como fallback.
function httpsDownload(url: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const req = https.get(url, (res) => {
      if (res.statusCode && res.statusCode >= 400) {
        reject(new Error(`HTTP ${res.statusCode}`));
        return;
      }
      const chunks: Buffer[] = [];
      res.on("data", (chunk: Buffer) => chunks.push(chunk));
      res.on("end", () => resolve(Buffer.concat(chunks)));
      res.on("error", reject);
    });
    req.on("error", reject);
    req.setTimeout(30_000, () => {
      req.destroy();
      reject(new Error("Request timeout"));
    });
  });
}

// ── TTS: generate voice buffer for a text response ──────────────────────

async function generateVoice(text: string, lang?: string): Promise<Buffer | null> {
  try {
    return await textToSpeech(text, lang);
  } catch (err: any) {
    console.warn("[TTS] Voice generation failed:", err.message);
    return null; // non-blocking — text still gets sent
  }
}

/** Resolve user language for TTS voice selection. Returns null if not found. */
async function getUserLanguage(prisma: PrismaClient, telegramId: number): Promise<string | undefined> {
  try {
    const user = await (prisma as any).user.findUnique({
      where: { telegramUserId: BigInt(telegramId) },
      select: { language: true },
    });
    return user?.language ?? undefined;
  } catch {
    return undefined;
  }
}

// ── Simple keyword extraction for onboarding ───────────────────────────

function extractSimpleKeywords(text: string): string[] {
  const commonKeywords: Record<string, string[]> = {
    agricultura: ['agricultura', 'cultivo', 'campo', 'siembra', 'cosecha'],
    tecnologia: ['software', 'tech', 'app', 'web', 'datos', 'ia'],
    salud: ['salud', 'médico', 'clínica', 'paciente'],
    educacion: ['educación', 'escuela', 'curso', 'enseñar'],
    musica: ['música', 'banda', 'componer', 'tocar'],
    comercio: ['vender', 'venta', 'comercio', 'tienda'],
    construccion: ['construir', 'obra', 'edificar'],
    comida: ['comida', 'restaurante', 'cocina', 'alimento'],
    arte: ['arte', 'diseño', 'dibujo', 'pintar'],
    comunidad: ['vecinos', 'comunidad', 'barrio', 'junta'],
  };

  const found: string[] = [];
  const lower = text.toLowerCase();
  for (const [category, keywords] of Object.entries(commonKeywords)) {
    if (keywords.some(k => lower.includes(k))) {
      found.push(category);
    }
  }
  return found;
}

// ── Message counter per tree: track intro message for new member welcomes ──
const treeMessageCounter = new Map<string, number>();

async function trackBotMessage(
  prisma: PrismaClient,
  treeId: string,
  messageId: number
): Promise<void> {
  const count = (treeMessageCounter.get(treeId) ?? 0) + 1;
  treeMessageCounter.set(treeId, count);

  if (count === 2 || count === 3) {
    try {
      await (prisma as any).tree.update({
        where: { id: treeId },
        data: { introMessageId: BigInt(messageId) },
      });
      console.log(
        `[Telegram Bot] Intro message #${count} saved for tree ${treeId}: msg_id=${messageId}`
      );
    } catch (err: any) {
      console.warn(
        `[Telegram Bot] Failed to save introMessageId for tree ${treeId}:`,
        err.message
      );
    }
  }
}

export async function createBot(prisma: PrismaClient): Promise<Bot<BotContext> | null> {
  const token = process.env.TELEGRAM_BOT_TOKEN || "";

  if (!token) {
    console.warn(
      "[Telegram Bot] TELEGRAM_BOT_TOKEN no configurado — el bot no se iniciará."
    );
    return null;
  }

  const bot = new Bot<BotContext>(token);

  // ── Session middleware ──────────────────────────────────────────────────
  bot.use(
    session({
      initial(): BotSessionData {
        return { userId: null, authenticatedAt: null, awaitingEvidenceTaskId: null, awaitingEvidenceBotMsgId: null, onboardingStep: null, onboardingTreeId: null };
      },
    })
  );

  // ── Comandos ───────────────────────────────────────────────────────────
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
        "/help — Mostrar esta ayuda\n\n" +
        "En grupos, menciona @TrustMakerBot:\n" +
        "  @TrustMakerBot /info\n" +
        "  @TrustMakerBot /lista necesidades\n" +
        "  @TrustMakerBot /crea necesidad \"título\" — descripción\n" +
        "  @TrustMakerBot /ideas para \"título\"\n" +
        "  @TrustMakerBot /vota <id>\n\n" +
        "También puedes conversar naturalmente mencionando al bot."
    );
  });

  // ── /cuota: mostrar cuota mensual ──────────────────────────────────────
  bot.command("cuota", async (ctx) => {
    const tgUser = ctx.from;
    if (!tgUser) {
      await ctx.reply("⚠️ No se pudo identificar tu cuenta de Telegram.");
      return;
    }

    const telegramId = BigInt(tgUser.id);
    const user = await (prisma as any).user.findUnique({
      where: { telegramUserId: telegramId },
      select: { id: true },
    });

    if (!user) {
      await ctx.reply(
        "⚠️ No tienes una cuenta vinculada. Usa /start para vincularte a Trust Maker."
      );
      return;
    }

    const memberships = await (prisma as any).treeMember.findMany({
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

  // ── /pagar: mostrar info de pago (centralizado + individual) ──────────
  bot.command("pagar", async (ctx) => {
    const tgUser = ctx.from;
    if (!tgUser) {
      await ctx.reply(t("common:not_identified", "es"));
      return;
    }

    // Resolve user language for i18n
    const lng = await resolveUserLanguage(prisma, ctx) ?? "es";

    const user = await (prisma as any).user.findUnique({
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

  // ── Welcome / rejoin messages ─────────────────────────────────────────

  function rejoinMessage(treeName: string): string {
    return `🌳 ¡He vuelto! El árbol "${treeName}" sigue activo.`;
  }

  /**
   * Resuelve el idioma desde el Tree (usado en grupo en vez de resolveUserLanguage).
   * Retorna el language del árbol, o null si no está configurado (nuevo árbol sin selector aún).
   */
  async function resolveTreeLanguage(prisma: PrismaClient, treeId: string): Promise<string | null> {
    try {
      const tree = await (prisma as any).tree.findUnique({
        where: { id: treeId },
        select: { language: true },
      });
      return tree?.language ?? null;
    } catch {
      return null;
    }
  }

  /** Track Ari's 2nd/3rd message per tree — used as welcome-reply anchor. */
  const _introCounts = new Map<string, number>();
  async function trackIntroMessage(
    prisma: PrismaClient,
    treeId: string,
    messageId: number,
  ) {
    const count = (_introCounts.get(treeId) || 0) + 1;
    _introCounts.set(treeId, count);
    if (count === 2 || count === 3) {
      // Save if not already set
      const tree = await (prisma as any).tree.findUnique({
        where: { id: treeId },
        select: { introMessageId: true },
      });
      if (!tree?.introMessageId) {
        await (prisma as any).tree.update({
          where: { id: treeId },
          data: { introMessageId: BigInt(messageId) },
        });
      }
    }
  }

  // ── Onboarding multi-step: flujo de configuración del árbol ──────────
  // Paso 1: objetivos → Paso 2: subárbol? (inline buttons) → Paso 3: árbol padre → Paso 4: WhatsApp

  async function handleOnboardingResponse(ctx: any, prisma: PrismaClient) {
    const session = (ctx as BotContext).session;
    const text: string | undefined = ctx.message.text?.trim();

    // Resolve language: prefer tree.language for groups, user.language for DMs
    let lang: string | null = null;
    const chatType = ctx.chat?.type;
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
      const tree = await (prisma as any).tree.findFirst({
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
      await (prisma as any).tree.update({
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
          const recommender = await import('../services/treeRecommenderService');
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
          const techStack = await import('../services/techStackService');
          if (techStack.recommendTechStack && techStack.formatTechStackRecommendation) {
            const ranked = await techStack.recommendTechStack(text);
            if (ranked.length > 0) {
              const successful = await import('../services/treeRecommenderService');
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

      // Preguntar si es sub-árbol (Paso 2)
      session.onboardingStep = 2;
      await new Promise(r => setTimeout(r, 1000));
      await ctx.reply(step1Msg + t('onboarding.subtree_question', lang), {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [[
            { text: t('onboarding.subtree_yes', lang), callback_data: 'onboarding:subtree_yes' },
            { text: t('onboarding.subtree_no', lang), callback_data: 'onboarding:subtree_no' },
          ]],
        },
      });
      return;
    }

    if (step === 3) {
      // ── Paso 3: Código del árbol padre ─────────────────────────────────
      if (!text || text === '/skip') {
        // Skip parent tree linking
        session.onboardingStep = 4;
        await ctx.reply(
          t('onboarding.parent_skipped', lang) + '\n\n' + t('onboarding.whatsapp_prompt', lang), {
            parse_mode: 'Markdown',
            reply_markup: { force_reply: true, input_field_placeholder: t('onboarding.whatsapp_placeholder', lang) },
          }
        );
        return;
      }

      // Buscar árbol padre por código, id o nombre
      const parentTree = await (prisma as any).tree.findFirst({
        where: {
          OR: [
            { code: text },
            { id: text },
            { name: { contains: text } },
          ],
        },
        select: { id: true, name: true, icono: true },
      });

      if (!parentTree) {
        return ctx.reply(t('onboarding.parent_not_found', lang), {
          reply_markup: { force_reply: true, input_field_placeholder: t('onboarding.parent_code_placeholder', lang) },
        });
      }

      // Vincular como sub-árbol
      await (prisma as any).tree.update({
        where: { id: session.onboardingTreeId },
        data: { parentTreeId: parentTree.id },
      });

      session.onboardingStep = 4;
      await ctx.reply(
        t('onboarding.parent_linked', lang, { treeName: (parentTree.icono || '🌳') + ' ' + parentTree.name }) + '\n\n' +
        t('onboarding.whatsapp_prompt', lang), {
          parse_mode: 'Markdown',
          reply_markup: { force_reply: true, input_field_placeholder: t('onboarding.whatsapp_placeholder', lang) },
        }
      );
      return;
    }

    if (step === 4) {
      // ── Paso 4: WhatsApp group ID ──────────────────────────────────────
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
      await (prisma as any).tree.update({
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

  // ── Grupo: auto-crear árbol cuando el bot es agregado ─────────────────
  bot.on("my_chat_member", async (ctx) => {
    const chat = ctx.chat;
    const newStatus = ctx.update.my_chat_member.new_chat_member.status;

    if (chat.type === "group" || chat.type === "supergroup") {
      if (newStatus === "member" || newStatus === "administrator") {
        const chatId = chat.id.toString();
        const adderId = ctx.update.my_chat_member.from.id.toString();
        try {
          // ── Beta admin bypass ──────────────────────────────────────────
          const BETA_ADMIN_IDS = (process.env.BETA_ADMIN_TELEGRAM_IDS || "")
            .split(",")
            .map((id) => id.trim())
            .filter(Boolean);

          const isBetaAdmin = BETA_ADMIN_IDS.includes(adderId);

          // ── Gate: capacity limit (MAX_TREES) ──────────────────────────
          const MAX_TREES = parseInt(process.env.MAX_TREES || "5", 10);
          const treeCount = await (prisma as any).tree.count({
            where: { telegramChatId: { not: null } },
          });

          if (!isBetaAdmin && treeCount >= MAX_TREES) {
            // Check if tree already exists (rejoin case — don't block re-adds)
            const existingTree = await (prisma as any).tree.findUnique({
              where: { telegramChatId: chatId },
            });
            if (existingTree) {
              // Rejoin: existing tree, skip capacity gate
              await ctx.api.sendMessage(chatId, rejoinMessage(existingTree.name), {
                parse_mode: "Markdown",
              });
              return;
            }

            // No slots — reject with friendly message
            const fallbackLang = "es";
            const CAREERS_URL = process.env.CAREERS_URL || "https://trustmaker.app/careers";
            const CONTACT_EMAIL = process.env.CONTACT_EMAIL || "hello@trustmaker.app";

            const msg = t("common.beta_closed", fallbackLang, {
              careersUrl: CAREERS_URL,
              contactEmail: CONTACT_EMAIL,
            });
            await ctx.api.sendMessage(chatId, msg, { parse_mode: "Markdown" });

            // Optional: save to waitlist
            try {
              await (prisma as any).waitlist.create({
                data: {
                  treeName: chat.title || `Grupo ${chatId}`,
                  telegramChatId: chatId,
                  contactUserId: adderId,
                },
              });
            } catch (wlErr: any) {
              console.warn("[Telegram Bot] Waitlist save failed:", wlErr.message);
            }

            console.log(
              `[Telegram Bot] Capacity gate: rejected group ${chatId} (${chat.title || "unnamed"}) — ${treeCount}/${MAX_TREES} trees`
            );
            return;
          }

          // ── Gate: 1 group per user during beta ──────────────────────────
          // Check if the adder already administers a tree
          const adderTgId = BigInt(adderId);
          const adderUser = await (prisma as any).user.findUnique({
            where: { telegramUserId: adderTgId },
            select: { id: true },
          });

          if (adderUser) {
            const adminTrees = await (prisma as any).treeMember.count({
              where: {
                userId: adderUser.id,
                role: "ADMIN",
                status: "ACTIVE",
              },
            });

            const MAX_USER_TREES = parseInt(process.env.MAX_TREES_PER_USER || "2", 10);
            if (!isBetaAdmin && adminTrees >= MAX_USER_TREES) {
              // Check if tree already exists (rejoin to same tree)
              const existingTree = await (prisma as any).tree.findUnique({
                where: { telegramChatId: chatId },
              });
              if (!existingTree) {
                const fallbackLang = "es";
                const CONTACT_EMAIL = process.env.CONTACT_EMAIL || "hello@trustmaker.app";

                const msg = t("common.one_tree_per_user", fallbackLang, {
                  contactEmail: CONTACT_EMAIL,
                });
                await ctx.api.sendMessage(chatId, msg, { parse_mode: "Markdown" });
                console.log(
                  `[Telegram Bot] 1-per-user gate: rejected group ${chatId} — user ${adderId} already admins a tree`
                );
                return;
              }
            }
          }

          // Check if tree already exists for this group
          let tree = await (prisma as any).tree.findUnique({
            where: { telegramChatId: chatId },
          });
          let isNewTree = false;
          if (!tree) {
            tree = await (prisma as any).tree.create({
              data: {
                name: chat.title || `Grupo ${chatId}`,
                telegramChatId: chatId,
                description: `Árbol automático para el grupo de Telegram "${chat.title || chatId}"`,
                icono: "💬",
                admissionPolicy: "INVITE_ONLY",
              },
            });
            console.log(
              `[Telegram Bot] Árbol creado: "${tree.name}" (${tree.id}) para grupo ${chatId}`
            );

            // SPEC-4: auto-create sandbox — non-blocking
            try {
              TreeSandbox.create(tree.id).catch((err: any) =>
                console.error("[Telegram Bot] Sandbox auto-create failed:", err?.message || err)
              );
            } catch {
              // Non-blocking
            }
            isNewTree = true;
          }

          // Auto-add the user who invited the bot
          try {
            // Resolve or create user by telegram ID
            const tgId = BigInt(adderId);
            let user = await prisma.user.findUnique({ where: { telegramUserId: tgId } });
            if (!user) {
              user = await prisma.user.create({
                data: { username: `tg_${adderId}`, telegramUserId: tgId, language: null },
              });
            }
            await prisma.treeMember.upsert({
              where: { userId_treeId: { userId: user.id, treeId: tree.id } },
              update: { status: "ACTIVE" },
              create: { userId: user.id, treeId: tree.id, status: "ACTIVE", role: "ADMIN" },
            });
            console.log(
              `[Telegram Bot] Miembro agregado: ${user.username || adderId} al árbol ${tree.id}`
            );
          } catch (memberErr: any) {
            console.error(`[Telegram Bot] Error al agregar miembro ${adderId}:`, memberErr.message);
          }

          // Send welcome / rejoin message
          try {
            if (isNewTree) {
              // New tree: show language selector first (bilingual prompt + TTS in English)
              const langMsg = await ctx.api.sendMessage(
                chatId,
                "\uD83C\uDF10 Select your language / Selecciona tu idioma",
                {
                  reply_markup: {
                    inline_keyboard: [[
                      {
                        text: "\uD83C\uDDFA\uD83C\uDDF8 English",
                        callback_data: "lang_group:en:" + tree.id,
                      },
                      {
                        text: "\uD83C\uDDF2\uD83C\uDDFD Español",
                        callback_data: "lang_group:es:" + tree.id,
                      },
                    ]],
                  },
                }
              );
              // Track message #1 for intro capture
              trackBotMessage(prisma, tree.id, langMsg.message_id);

              // Send TTS audio in English (non-blocking)
              try {
                const voiceBuffer = await textToSpeech("Select your language", "en");
                const voiceMsg = await ctx.api.sendVoice(chatId, new InputFile(voiceBuffer));
                // Track message #2 for intro capture
                trackBotMessage(prisma, tree.id, voiceMsg.message_id);
              } catch {
                // Non-blocking — voice is a nice-to-have
              }
            } else {
              // Rejoin: existing tree
              await ctx.api.sendMessage(chatId, rejoinMessage(tree!.name), {
                parse_mode: "Markdown",
              });
            }
          } catch (msgErr: any) {
            console.error(`[Telegram Bot] Error al enviar mensaje de bienvenida:`, msgErr.message);
          }
        } catch (err: any) {
          console.error(`[Telegram Bot] Error al crear árbol para grupo ${chatId}:`, err.message);
        }
      }
    }
  });

  // ── New member welcome: greet members joining the group ─────────────────
  bot.on("chat_member", async (ctx) => {
    const chat = ctx.chat;
    if (chat.type !== "group" && chat.type !== "supergroup") return;

    const oldStatus = ctx.chatMember.old_chat_member.status;
    const newMember = ctx.chatMember.new_chat_member;

    // Only greet on join (left/kicked → member)
    if (
      (oldStatus !== "left" && oldStatus !== "kicked") ||
      newMember.status !== "member"
    ) {
      return;
    }

    // Don't greet the bot itself
    if (newMember.user.is_bot) return;

    const chatId = chat.id.toString();
    // Mention with @username if available; first_name otherwise (user spec)
    const newUserName = newMember.user.username
      ? "@" + newMember.user.username
      : newMember.user.first_name || "nuevo miembro";

    try {
      // Find tree for this group
      const tree = await (prisma as any).tree.findUnique({
        where: { telegramChatId: chatId },
        select: { id: true, introMessageId: true, language: true },
      });

      if (!tree) return; // Not a TrustMaker group

      const lang = tree.language || "es";
      const welcomeText = t("common.welcome_new_member", lang, { name: newUserName });

      if (tree.introMessageId) {
        // Reply to the intro message with reply_parameters (modern API)
        await ctx.api.sendMessage(chatId, welcomeText, {
          reply_parameters: { message_id: Number(tree.introMessageId) },
          parse_mode: "Markdown",
        });
      } else {
        // No intro saved — send normal welcome
        await ctx.api.sendMessage(chatId, welcomeText, {
          parse_mode: "Markdown",
        });
      }
    } catch (err: any) {
      console.error(
        `[Telegram Bot] Error greeting new member in group ${chatId}:`,
        err.message,
      );
    }
  });

  // ── Onboarding reply handler (T24): detecta respuestas a la pregunta inicial ──
  // Se ejecuta antes del handler normal de mensajes. Si es respuesta al
  // force_reply de "¿Qué tipo de organización son...", captura y guarda.
  bot.on("message:text", async (ctx, next) => {
    const msg = ctx.message;
    if (!msg || !("text" in msg)) return next();

    // Check if this is a reply to the onboarding question
    if (msg.reply_to_message?.text?.includes('[T24_ONBOARDING]')) {
      await handleOnboardingResponse(ctx, prisma);
      return;
    }

    return next();
  });

  // ── DM: Mensajes privados (perfil personal, comandos, concierge) ────
  bot.on("message:text", async (ctx, next) => {
    const chatType = ctx.chat?.type;
    if (chatType !== "private") return next();

    if (process.env.HERMES_BRIDGE_ENABLED === "true") {
      // ── Hermes Bridge: enrutar DM al agente ───────────────────────────
      const msg = ctx.message;
      if (!msg || !("text" in msg) || !msg.text) return;
      const text = msg.text.trim();
      const tgUser = ctx.from;
      if (!tgUser) return;

      // Find first active tree membership
      const user = await (prisma as any).user.findUnique({
        where: { telegramUserId: BigInt(tgUser.id) },
        select: { id: true, username: true, language: true },
      });
      if (!user) {
        await ctx.reply("⚠️ No tienes una cuenta vinculada. Usa /start en un grupo para vincularte a Trust Maker.");
        return;
      }

      const membership = await (prisma as any).treeMember.findFirst({
        where: { userId: user.id, status: "ACTIVE" },
        include: { tree: { select: { id: true, name: true } } },
        orderBy: { joinedAt: "desc" },
      });

      if (!membership) {
        await ctx.reply("🌳 No eres miembro activo de ningún árbol. Únete a un grupo de Trust Maker para empezar.");
        return;
      }

      const treeId = membership.tree.id;
      const userId = tgUser.id.toString();
      const displayName = tgUser.first_name || userId;
      const fullMessage = `${displayName}: ${text}`;

      // Typing indicator
      ctx.replyWithChatAction("typing").catch(() => {});

      const response = await routeToHermes(fullMessage, treeId, userId, undefined, displayName);
      if (response) {
        await ctx.reply(response.text, { parse_mode: "Markdown" });

        // Voice generation: fire-and-forget (TTS se mantiene)
        const userLang = user.language ?? undefined;
        generateVoice(response.text, userLang).then((vb) => {
          if (vb) {
            const vmsgs = formatForChannel({ text: "", voiceBuffer: vb }, "telegram");
            sendViaTelegram(ctx, vmsgs).catch(() => {});
          }
        });
      } else {
        await ctx.reply("⚠️ El agente no está disponible en este momento. Intenta de nuevo más tarde.");
      }
      return;
    }

    await handleDM(prisma, ctx as BotContext);
    // Don't call next() — DM handled, group handler won't fire
  });

  // ── Mensajes de texto: comandos @TrustMakerBot + conversación natural ──
  bot.on("message:text", async (ctx) => {
    const msg = ctx.message;
    if (!msg || !("text" in msg) || !msg.text) return;

    const chatType = ctx.chat?.type;
    // Skip DM — already handled above
    if (chatType === "private") return;

    const chatId = ctx.chat?.id.toString();

    // 1. Análisis pasivo: fire-and-forget para todo mensaje de grupo
    if (chatId) {
      analyzeMessage(prisma, ctx, chatId).catch((err: Error) => {
        console.error("[analyzer] Unhandled rejection:", err.message);
      });
    }

    // ── Todo scanner: detect /todo anywhere in group messages ──
    const todoMatch = msg.text.match(/\/todo\b\s*(.*)/i);
    if (todoMatch && chatId && chatType !== "private") {
      const todoText = todoMatch[1]?.trim();
      const tree = await findTreeByChat(prisma, chatId);
      if (tree) {
        if (!todoText) {
          // Show ranked list — urgent unassigned first, then by likes
          const todos = await (prisma as any).todo.findMany({
            where: { treeId: tree.id, status: "PENDING" },
            orderBy: { likeCount: "desc" },
            take: 20,
          });
          if (todos.length === 0) {
            await ctx.reply("📋 No hay tareas pendientes. Agrega una con /todo <texto>");
          } else {
            const now = new Date();
            // Sort: unassigned tasks with deadline <6h first, then by likes
            const sorted = [...todos].sort((a: any, b: any) => {
              const aUrgent = a.deadline && !a.assignedTo
                && new Date(a.deadline).getTime() - now.getTime() < 6 * 3600_000 ? 1 : 0;
              const bUrgent = b.deadline && !b.assignedTo
                && new Date(b.deadline).getTime() - now.getTime() < 6 * 3600_000 ? 1 : 0;
              if (aUrgent !== bUrgent) return bUrgent - aUrgent;
              return (b.likeCount ?? 0) - (a.likeCount ?? 0);
            });
            const list = sorted.map((t: any, i: number) => {
              let suffix = "";
              if (t.deadline) {
                const dl = new Date(t.deadline);
                const isOverdue = dl < now;
                const isUrgent = !isOverdue && !t.assignedTo
                  && dl.getTime() - now.getTime() < 6 * 3600_000;
                const dateStr = dl.toLocaleDateString("es-CL", {
                  day: "numeric", month: "short",
                });
                suffix = isOverdue ? ` ⚠️ vencía ${dateStr}`
                  : isUrgent ? ` 🚨 ${dateStr}`
                  : ` 📅 ${dateStr}`;
              }
              const assigned = t.assignedToName ? ` 🔒 ${t.assignedToName}` : "";
              return `${i + 1}. ${t.summary}${suffix}${assigned}${t.likeCount ? ` (${t.likeCount} 👍)` : ""}`;
            }).join("\n");
            await ctx.reply(`📋 *Tareas pendientes:*\n\n${list}`, { parse_mode: "Markdown" });
          }
        } else {
          // Add todo item — parse deadline from text
          const deadline = parseDeadline(todoText);
          const summary = summarizeTodo(todoText);
          const todo = await (prisma as any).todo.create({
            data: {
              treeId: tree.id,
              chatId: BigInt(chatId),
              messageId: BigInt(msg.message_id),
              createdBy: BigInt(ctx.from?.id || 0),
              createdByName: ctx.from?.first_name || null,
              text: todoText,
              summary,
              deadline: deadline || undefined,
            },
          });
          await ctx.react("✅");
        }
      }
      return; // Don't continue to command/natural processing
    }

    // ── Natural language todo add: detectar "anota X", "agrega X a la lista", etc. ──
    // Solo si el mensaje menciona a @Ari y NO contiene /todo
    if (chatId) {
      const addIntent = detectNaturalAddIntent(msg.text);
      if (addIntent) {
        const tree = await findTreeByChat(prisma, chatId);
        if (tree) {
          // Resolve tree language for i18n
          let lng = "es";
          try {
            const treeData = await (prisma as any).tree.findUnique({
              where: { id: tree.id },
              select: { language: true },
            });
            if (treeData?.language) lng = treeData.language;
          } catch { /* fallback es */ }

          // Check for duplicate: exact summary match in PENDING todos
          const existing = await (prisma as any).todo.findFirst({
            where: {
              treeId: tree.id,
              status: "PENDING",
              summary: addIntent,
            },
          });
          if (existing) {
            await ctx.reply(
              lng === "en"
                ? "📋 That task is already on the list"
                : "📋 Esa tarea ya está en la lista",
            );
            return;
          }

          // Parse deadline from text
          const deadline = parseDeadline(addIntent);
          const summary = addIntent.length > 80 ? summarizeTodo(addIntent) : addIntent;
          await (prisma as any).todo.create({
            data: {
              treeId: tree.id,
              chatId: BigInt(chatId),
              messageId: BigInt(msg.message_id),
              createdBy: BigInt(ctx.from?.id || 0),
              createdByName: ctx.from?.first_name || null,
              text: addIntent,
              summary,
              deadline: deadline || undefined,
            },
          });

          try { await ctx.react("✅"); } catch { /* react may not be available */ }

          const replyText = lng === "en"
            ? `Added to list: '${summary}'`
            : `Agregado a la lista: '${summary}'`;
          await ctx.reply(replyText);

          return; // Don't continue to claim/unclaim/command processing
        }
      }
    }

    // ── Todo claim/unclaim: detectar frases de asignación/liberación ──
    // Priority: /todo > add NL > claim/unclaim > completar > comando normal
    if (chatId) {
      const tree = await findTreeByChat(prisma, chatId);
      if (tree) {
        // Resolve tree language for i18n
        let lng = "es";
        try {
          const treeData = await (prisma as any).tree.findUnique({
            where: { id: tree.id },
            select: { language: true },
          });
          if (treeData?.language) lng = treeData.language;
        } catch { /* fallback es */ }

        const pendingTodos = await (prisma as any).todo.findMany({
          where: { treeId: tree.id, status: "PENDING" },
          orderBy: { likeCount: "desc" },
          take: 50,
        });

        if (pendingTodos.length > 0) {
          const replyMsgText = msg.reply_to_message?.text
            || msg.reply_to_message?.caption;
          const isReplyBot =
            msg.reply_to_message?.from?.username === "TrustMakerBot"
            || msg.reply_to_message?.from?.is_bot === true;

          const {
            detectClaim, detectUnclaim, checkUrgency,
            formatTimeRemaining, formatDeadlineTime,
            hasClaimLanguage, hasUnclaimLanguage,
          } = await import("./todoCompletion");

          const todos = pendingTodos.map((t: any) => ({
            id: t.id,
            summary: t.summary,
            text: t.text,
            createdByName: t.createdByName,
            status: t.status,
            messageId: t.messageId,
            assignedTo: t.assignedTo,
            assignedToName: t.assignedToName,
            deadline: t.deadline,
            likeCount: t.likeCount,
          }));

          const tgUser = ctx.from;
          const tgUserId = tgUser ? BigInt(tgUser.id) : null;
          const tgUserName = tgUser?.first_name || tgUser?.username || "alguien";

          // ── CLAIM ──────────────────────────────────────────
          if (hasClaimLanguage(msg.text)) {
            const claimResult = detectClaim(
              msg.text, todos, isReplyBot ?? false, replyMsgText,
            );

            if (claimResult) {
              const todo = claimResult.todo;

              // Already claimed by someone else → warn
              if (todo.assignedTo && todo.assignedTo !== tgUserId) {
                const assignee = todo.assignedToName || "alguien";
                await ctx.reply(
                  lng === "en"
                    ? `👀 That task is already assigned to ${assignee}`
                    : `👀 Esa tarea ya la tiene asignada ${assignee}`,
                );
                return;
              }

              // Already claimed by same user → notify
              if (todo.assignedTo === tgUserId) {
                await ctx.reply(
                  lng === "en"
                    ? "👀 You already claimed that task"
                    : "👀 Ya te habías apuntado a esa tarea",
                );
                return;
              }

              // Assign
              await (prisma as any).todo.update({
                where: { id: todo.id },
                data: {
                  assignedTo: tgUserId,
                  assignedToName: tgUserName,
                },
              });

              try { await ctx.react("👍"); } catch { /* react may not be available */ }

              await ctx.reply(
                lng === "en"
                  ? `👍 ${tgUserName} volunteered for '*${todo.summary}*'`
                  : `👍 ${tgUserName} se apuntó a '*${todo.summary}*'`,
                { parse_mode: "Markdown" },
              );
              return;
            }
          }

          // ── UNCLAIM ────────────────────────────────────────
          if (hasUnclaimLanguage(msg.text)) {
            const unclaimResult = detectUnclaim(
              msg.text, todos, isReplyBot ?? false, replyMsgText,
            );

            if (unclaimResult) {
              const todo = unclaimResult.todo;

              // Not assigned to anyone
              if (!todo.assignedTo) {
                await ctx.reply(
                  lng === "en"
                    ? "🤷 That task isn't assigned to anyone"
                    : "🤷 Esa tarea no está asignada a nadie",
                );
                return;
              }

              // Not assigned to this user — only release your own
              if (todo.assignedTo !== tgUserId) {
                const assignee = todo.assignedToName || "alguien";
                await ctx.reply(
                  lng === "en"
                    ? `🤷 That task is assigned to ${assignee}, not you`
                    : `🤷 Esa tarea está asignada a ${assignee}, no a ti`,
                );
                return;
              }

              // Check urgency before releasing
              const urgency = checkUrgency(todo.deadline);

              // Release
              await (prisma as any).todo.update({
                where: { id: todo.id },
                data: {
                  assignedTo: null,
                  assignedToName: null,
                },
              });

              try { await ctx.react("🔄"); } catch { /* react may not be available */ }

              await ctx.reply(
                lng === "en"
                  ? `🔄 ${tgUserName} dropped '*${todo.summary}*'`
                  : `🔄 ${tgUserName} se bajó de '*${todo.summary}*'`,
                { parse_mode: "Markdown" },
              );

              // ── URGENCY ESCALATION ────────────────────────
              if (urgency) {
                const timeFmt = formatDeadlineTime(urgency.deadlineDate, lng);
                const remainingFmt = formatTimeRemaining(urgency.hoursRemaining, lng);

                // Get tree member count
                let memberCount = 0;
                try {
                  memberCount = await (prisma as any).treeMember.count({
                    where: { treeId: tree.id, status: "ACTIVE" },
                  });
                } catch { /* fallback */ }

                if (memberCount < 15 && memberCount > 0) {
                  // Get member Telegram IDs for mentions
                  let members: any[] = [];
                  try {
                    members = await (prisma as any).treeMember.findMany({
                      where: { treeId: tree.id, status: "ACTIVE" },
                      include: {
                        user: { select: { telegramUserId: true, username: true } },
                      },
                      take: 15,
                    });
                  } catch { /* fallback */ }

                  // Build mention string
                  const mentionNames: string[] = [];
                  for (const m of members) {
                    const u = m.user;
                    if (u?.telegramUserId && BigInt(u.telegramUserId) !== tgUserId) {
                      mentionNames.push(`[${u.username || "miembro"}](tg://user?id=${u.telegramUserId})`);
                    }
                  }

                  const mentions = mentionNames.slice(0, 14).join(" "); // max 14 mentions
                  await ctx.reply(
                    (lng === "en"
                      ? `🚨 Urgent! ${tgUserName} can't do '*${todo.summary}*' by ${timeFmt} (${remainingFmt}). Who can take it? ${mentions}`
                      : `🚨 ¡Urgente! ${tgUserName} no puede '*${todo.summary}*' para ${timeFmt} (${remainingFmt}). ¿Quién puede hacerla? ${mentions}`),
                    { parse_mode: "Markdown" },
                  );
                } else {
                  // Large group — no individual mentions
                  await ctx.reply(
                    lng === "en"
                      ? `🚨 Urgent! ${tgUserName} can't do '*${todo.summary}*' by ${timeFmt} (${remainingFmt}). Anyone from the group?`
                      : `🚨 ¡Urgente! ${tgUserName} no puede '*${todo.summary}*' para ${timeFmt} (${remainingFmt}). ¿Alguien del grupo puede hacerla?`,
                    { parse_mode: "Markdown" },
                  );
                }
              }

              return;
            }
          }
        }
      }
    }

    // ── Todo completion: detectar lenguaje de completitud natural ──
    // Solo si NO contiene /todo (el scanner tiene prioridad)
    if (chatId) {
      const tree = await findTreeByChat(prisma, chatId);
      if (tree) {
        const pendingTodos = await (prisma as any).todo.findMany({
          where: { treeId: tree.id, status: "PENDING" },
          orderBy: { likeCount: "desc" },
          take: 50,
        });

        if (pendingTodos.length > 0) {
          const replyMsgText = msg.reply_to_message?.text
            || msg.reply_to_message?.caption;
          const isReplyBot =
            msg.reply_to_message?.from?.username === "TrustMakerBot"
            || msg.reply_to_message?.from?.is_bot === true;

          const { detectCompletion } = await import("./todoCompletion");
          const result = detectCompletion(
            msg.text,
            pendingTodos.map((t: any) => ({
              id: t.id,
              summary: t.summary,
              text: t.text,
              createdByName: t.createdByName,
              status: t.status,
              messageId: t.messageId,
            })),
            isReplyBot ?? false,
            replyMsgText,
          );

          if (result) {
            if (result.ambiguous && result.ambiguous.length > 1) {
              // Ambiguity: ask for clarification
              const options = result.ambiguous
                .map((t: any, i: number) => `${i + 1}) ${t.summary}`)
                .join("\n");
              await ctx.reply(
                `🤔 ¿Te refieres a...\n\n${options}\n\n_Responde con el número._`,
                { parse_mode: "Markdown" },
              );
              return;
            }

            // Mark as DONE
            await (prisma as any).todo.update({
              where: { id: result.todoId },
              data: { status: "DONE" },
            });

            // React
            try {
              await ctx.react("🎉");
            } catch { /* react may not be available */ }

            // Reply with stats
            const remaining = pendingTodos.length - 1;
            const name = result.createdByName || "Alguien";
            const msgText = `✅ ¡${name} completó *${result.summary}*!\n\n📋 Quedan ${remaining} pendiente${remaining !== 1 ? "s" : ""}`;
            await ctx.reply(msgText, { parse_mode: "Markdown" });
            return;
          }
        }
      }
    }

    // 2. Verificar si el mensaje menciona al bot o es reply o es comando directo
    // Priority: reply to bot → direct command → mention (@TrustMakerBot)
    let cmdText: string | null = null;
    let isReplyToBot = false;

    // Check 1: reply a un mensaje del bot
    if (
      msg.reply_to_message &&
      (msg.reply_to_message.from?.username === "TrustMakerBot" ||
       msg.reply_to_message.from?.is_bot === true)
    ) {
      cmdText = msg.text.trim();
      isReplyToBot = true;
    }

    // Check 2-3: comando directo (/) o mención (@TrustMakerBot)
    if (cmdText === null) {
      cmdText = extractCommandText(msg.text);
    }

    // 3. Si no hay comando ni mención → solo análisis pasivo, no responder
    if (cmdText === null || cmdText === "") return;

    // 3.5 Payment check: verificar acceso antes de procesar
    if (chatId) {
      const paymentResult = await checkPaymentAccess(prisma, ctx, chatId, cmdText);
      if (paymentResult.blocked) {
        await ctx.reply(paymentResult.reply, { parse_mode: "Markdown" });
        return;
      }
    }

    // ── Hermes Bridge: si está habilitado, enrutar todo al agente ──────
    if (process.env.HERMES_BRIDGE_ENABLED === "true") {
      const tree = await findTreeByChat(prisma, chatId!);
      if (!tree) {
        await ctx.reply("⚠️ Este grupo no está vinculado a ningún árbol de Trust Maker.");
        return;
      }

      const userId = ctx.from?.id.toString() ?? "unknown";
      const displayName = ctx.from?.first_name || userId;

      // ── Prepend display name so the agent knows who is speaking ──────
      const fullMessage = `${displayName}: ${cmdText}`;

      // Fetch recent chat history for context
      let chatHistory: any[] | undefined;
      try {
        const recentMessages = await (prisma as any).chatMessage.findMany({
          where: { treeId: tree.id },
          orderBy: { createdAt: "desc" },
          take: 10,
          select: { role: true, content: true },
        });
        if (recentMessages.length > 0) {
          chatHistory = recentMessages.reverse().map((m: any) => ({
            role: m.role,
            content: m.content,
          }));
        }
      } catch { /* non-critical */ }

      // Show typing indicator while Hermes processes (refresh every 4s)
      const typingInterval = setInterval(() => {
        ctx.replyWithChatAction("typing").catch(() => {});
      }, 4000);
      ctx.replyWithChatAction("typing").catch(() => {});

      let response;
      try {
        response = await routeToHermes(fullMessage, tree.id, userId, chatHistory, displayName);
      } finally {
        // Stop typing indicator
        clearInterval(typingInterval);
      }

      if (response) {
        // Send text immediately (with Markdown fallback + intro tracking)
        let sentMsg: any;
        try {
          sentMsg = await ctx.reply(response.text, { parse_mode: "Markdown" });
        } catch (markdownErr: any) {
          if (markdownErr.message?.includes("can't parse entities")) {
            sentMsg = await ctx.reply(response.text);
          } else {
            throw markdownErr;
          }
        }

        // Track Ari's intro message ID (2nd or 3rd msg per tree → reply anchor)
        if (sentMsg?.message_id) {
          trackIntroMessage(prisma, tree.id, sentMsg.message_id).catch(() => {});
        }

        // Voice generation: fire-and-forget (TTS se mantiene)
        const userLang = ctx.from ? await getUserLanguage(prisma, ctx.from.id) : undefined;
        generateVoice(response.text, userLang).then((vb) => {
          if (vb) {
            const vmsgs = formatForChannel({ text: "", voiceBuffer: vb }, "telegram");
            sendViaTelegram(ctx, vmsgs).catch(() => {});
          }
        });
      } else {
        await ctx.reply("⚠️ El agente no está disponible en este momento. Intenta de nuevo más tarde.");
      }
      return;
    }

    // If reply-to-bot and not using Hermes Bridge: prepend mention so
    // handleNaturalMessage/handleMessage can parse it (they call
    // extractCommandText internally which needs a mention or / prefix).
    if (isReplyToBot) {
      (msg as any).text = `@TrustMakerBot ${cmdText}`;
    }

    // 4. Si menciona — rutear a comando o conversación natural
    const isCommand = cmdText.startsWith("/");
    const isHelpAlias = /^(help|ayuda)$/i.test(cmdText);

    if (isCommand || isHelpAlias) {
      // ── Modo comando ──
      const result = await handleMessage(prisma, ctx);

      if (result) {
        // Send text immediately (non-blocking for voice)
        const messages = formatForChannel(
          { text: result.text, react: result.react },
          "telegram",
        );
        await sendViaTelegram(ctx, messages);

        if (result.react) {
          try {
            await ctx.react("❤");
          } catch {
            // React API may not be available (older Telegram clients / bot API)
          }
        }

        // Voice generation: fire-and-forget (don't block text delivery)
        const userLang = ctx.from ? await getUserLanguage(prisma, ctx.from.id) : undefined;
        generateVoice(result.text, userLang).then((vb) => {
          if (vb) {
            const vmsgs = formatForChannel({ text: "", voiceBuffer: vb }, "telegram");
            sendViaTelegram(ctx, vmsgs).catch(() => {});
          }
        });
      }
    } else {
      // ── Modo conversación natural (SPEC-2) ──
      const naturalResult = await handleNaturalMessage(prisma, ctx);
      if (naturalResult) {
        // Send text immediately (non-blocking for voice)
        const messages = formatForChannel(
          { text: naturalResult.text },
          "telegram",
        );
        await sendViaTelegram(ctx, messages);

        // Voice generation: fire-and-forget (don't block text delivery)
        const natLang = ctx.from ? await getUserLanguage(prisma, ctx.from.id) : undefined;
        generateVoice(naturalResult.text, natLang).then((vb) => {
          if (vb) {
            const vmsgs = formatForChannel({ text: "", voiceBuffer: vb }, "telegram");
            sendViaTelegram(ctx, vmsgs).catch(() => {});
          }
        });
      }
    }
  });

  // ── Mensajes de voz: transcribir + detectar interpelación ──────────────
  // T29: El bot escucha todo pero solo responde si lo mencionan.
  // Flujo: 1) Descargar .ogg vía getFile 2) POST /api/audio/transcribe
  // 3) Verificar si el texto contiene @TrustMakerBot 4) Si sí → pipeline concierge
  bot.on("message:voice", async (ctx) => {
    const msg = ctx.message;
    if (!msg?.voice) return;

    const chatId = ctx.chat?.id.toString();
    const fileId = msg.voice.file_id;

    // Show typing indicator while transcribing
    ctx.replyWithChatAction("typing").catch(() => {});

    try {
      // 1. Download .ogg from Telegram
      const fileInfo = await ctx.api.getFile(fileId);
      if (!fileInfo.file_path) {
        console.error("[Voice] Telegram returned no file_path for", fileId);
        return;
      }

      const tgUrl = `https://api.telegram.org/file/bot${process.env.TELEGRAM_BOT_TOKEN}/${fileInfo.file_path}`;
      const fileBuffer = await httpsDownload(tgUrl);

      // 2. POST to /api/audio/transcribe
      const blob = new Blob([fileBuffer], {
        type: msg.voice.mime_type || "audio/ogg",
      });
      const formData = new FormData();
      formData.append("audio", blob, "voice.ogg");

      const apiKey = process.env.HERMES_API_SERVER_KEY ?? "";
      const transcribeResp = await fetch(
        "http://localhost:3100/api/audio/transcribe",
        {
          method: "POST",
          headers: { Authorization: `Bearer ${apiKey}` },
          body: formData,
        },
      );

      if (!transcribeResp.ok) {
        console.error(
          "[Voice] Transcription endpoint returned:",
          transcribeResp.status,
        );
        return;
      }

      const data = (await transcribeResp.json()) as any;
      const transcribedText: string = data?.text ?? "";
      if (!transcribedText.trim()) return;

      // 3. Solo responder si el audio menciona a Ari.
      //    "Ari" es corto y la transcripción lo captura bien con variaciones mínimas.
      const ariMatch = transcribedText.match(/\b(ari|ari[,!?]?|Ari)\b/i);
      if (!ariMatch) {
        console.log(
          `[Voice] No "Ari" mention — ignoring. Text: "${transcribedText.substring(0, 80)}"`,
        );
        return;
      }
      const cleanText = transcribedText.trim();
      if (!cleanText) return;

      console.log(
        `[Voice] Transcribed + detected mention → routing: "${cleanText.substring(0, 80)}"`,
      );

      // 5. Route through concierge pipeline (same as text messages)
      // 5a. Payment check
      if (chatId) {
        const paymentResult = await checkPaymentAccess(
          prisma,
          ctx,
          chatId,
          cleanText,
        );
        if (paymentResult.blocked) {
          await ctx.reply(paymentResult.reply, { parse_mode: "Markdown" });
          return;
        }
      }

      // 5b. Simulate a text message so the existing handlers work.
      //     Prepend @TrustMakerBot mention so extractCommandText + handleNaturalMessage
      //     can parse it (they require a leading mention to identify the message as addressed).
      const originalText = (msg as any).text;
      (msg as any).text = `@TrustMakerBot ${cleanText}`;

      try {
        const isCommand = cleanText.startsWith("/");
        const isHelpAlias = /^(help|ayuda)$/i.test(cleanText);

        if (isCommand || isHelpAlias) {
          const result = await handleMessage(prisma, ctx);
          if (result) {
            // Send text immediately
            const messages = formatForChannel(
              { text: result.text, react: result.react },
              "telegram",
            );
            await sendViaTelegram(ctx, messages);
            if (result.react) {
              try { await ctx.react("❤"); } catch {}
            }
            // Voice: fire-and-forget
            const voiceLang = ctx.from ? await getUserLanguage(prisma, ctx.from.id) : undefined;
            generateVoice(result.text, voiceLang).then((vb) => {
              if (vb) {
                const vmsgs = formatForChannel({ text: "", voiceBuffer: vb }, "telegram");
                sendViaTelegram(ctx, vmsgs).catch(() => {});
              }
            });
          }
        } else {
          const naturalResult = await handleNaturalMessage(prisma, ctx);
          if (naturalResult) {
            // Send text immediately
            const messages = formatForChannel(
              { text: naturalResult.text },
              "telegram",
            );
            await sendViaTelegram(ctx, messages);
            // Voice: fire-and-forget
            const voiceNatLang = ctx.from ? await getUserLanguage(prisma, ctx.from.id) : undefined;
            generateVoice(naturalResult.text, voiceNatLang).then((vb) => {
              if (vb) {
                const vmsgs = formatForChannel({ text: "", voiceBuffer: vb }, "telegram");
                sendViaTelegram(ctx, vmsgs).catch(() => {});
              }
            });
          }
        }
      } finally {
        // Restore original message state (voice messages have no text)
        if (originalText === undefined) {
          delete (msg as any).text;
        } else {
          (msg as any).text = originalText;
        }
      }
    } catch (err: any) {
      console.error("[Voice] Handler error:", err.message || err);
    }
  });

  // ── Evidencia: fotos y documentos ──────────────────────────────────────
  // Handlers for photo and document uploads as task evidence.
  // When the bot previously asked a user for evidence, it sets
  // session.awaitingEvidenceTaskId + awaitingEvidenceBotMsgId.
  // These handlers detect the upload, download the file from Telegram,
  // and POST it to POST /api/tasks/:id/evidence.

  const EVIDENCE_API_URL = "http://localhost:3100/api/tasks";
  const API_SERVER_KEY = process.env.HERMES_API_SERVER_KEY ?? "";

  async function handleEvidenceUpload(
    ctx: BotContext,
    fileId: string,
    fileName: string,
    mimeType: string,
    taskId: string,
    prisma: PrismaClient,
  ): Promise<string | null> {
    try {
      // 1. Get file path from Telegram
      const fileInfo = await ctx.api.getFile(fileId);
      if (!fileInfo.file_path) {
        console.error("[Evidence] Telegram returned no file_path for", fileId);
        return null;
      }

      // 2. Download file from Telegram
      const tgUrl = `https://api.telegram.org/file/bot${process.env.TELEGRAM_BOT_TOKEN}/${fileInfo.file_path}`;
      const fileBuffer = await httpsDownload(tgUrl);

      // 3. POST to evidence endpoint as multipart
      const formData = new FormData();
      const blob = new Blob([fileBuffer], { type: mimeType });
      formData.append("file", blob, fileName);

      const evidenceResp = await fetch(`${EVIDENCE_API_URL}/${taskId}/evidence`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${API_SERVER_KEY}`,
        },
        body: formData,
      });

      if (!evidenceResp.ok) {
        const errText = await evidenceResp.text();
        console.error("[Evidence] API rejected upload:", evidenceResp.status, errText);
        return null;
      }

      const data = await evidenceResp.json() as any;
      return data.evidenceUrl ?? null;
    } catch (err: any) {
      console.error("[Evidence] Upload exception:", err.message || err);
      return null;
    }
  }

  bot.on("message:photo", async (ctx) => {
    const msg = ctx.message;
    if (!msg?.photo || msg.photo.length === 0) return;

    const session = ctx.session;
    const taskId = session.awaitingEvidenceTaskId;

    // Must be awaiting evidence
    if (!taskId) return;

    // Check reply-to matches the bot message that requested evidence (if set)
    const botMsgId = session.awaitingEvidenceBotMsgId;
    const repliedTo = msg.reply_to_message?.message_id;
    if (botMsgId && repliedTo !== botMsgId) return;

    // Highest resolution photo is the last element
    const photo = msg.photo[msg.photo.length - 1];
    const fileId = photo.file_id;

    await ctx.replyWithChatAction("upload_document");

    const fileName = `photo_${Date.now()}.jpg`;
    const evidenceUrl = await handleEvidenceUpload(
      ctx as BotContext, fileId, fileName, "image/jpeg", taskId, prisma,
    );

    // Clear awaiting state
    session.awaitingEvidenceTaskId = null;
    session.awaitingEvidenceBotMsgId = null;

    if (evidenceUrl) {
      await ctx.reply(
        "✅ Evidencia recibida. La foto fue registrada para la tarea.",
        { reply_to_message_id: msg.message_id },
      );
    } else {
      await ctx.reply(
        "⚠️ No se pudo procesar la foto como evidencia. Intenta de nuevo o contacta al administrador.",
        { reply_to_message_id: msg.message_id },
      );
    }
  });

  bot.on("message:document", async (ctx) => {
    const msg = ctx.message;
    if (!msg?.document) return;

    const session = ctx.session;
    const taskId = session.awaitingEvidenceTaskId;

    // Must be awaiting evidence
    if (!taskId) return;

    // Check reply-to matches the bot message that requested evidence (if set)
    const botMsgId = session.awaitingEvidenceBotMsgId;
    const repliedTo = msg.reply_to_message?.message_id;
    if (botMsgId && repliedTo !== botMsgId) return;

    const doc = msg.document;
    const fileId = doc.file_id;
    const fileName = doc.file_name ?? `document_${Date.now()}`;
    const mimeType = doc.mime_type ?? "application/octet-stream";

    await ctx.replyWithChatAction("upload_document");

    const evidenceUrl = await handleEvidenceUpload(
      ctx as BotContext, fileId, fileName, mimeType, taskId, prisma,
    );

    // Clear awaiting state
    session.awaitingEvidenceTaskId = null;
    session.awaitingEvidenceBotMsgId = null;

    if (evidenceUrl) {
      await ctx.reply(
        `✅ Evidencia recibida. El documento "${fileName}" fue registrado para la tarea.`,
        { reply_to_message_id: msg.message_id },
      );
    } else {
      await ctx.reply(
        "⚠️ No se pudo procesar el documento como evidencia. Intenta de nuevo o contacta al administrador.",
        { reply_to_message_id: msg.message_id },
      );
    }
  });

  // ── Reaction handler (votos con reacciones) ─────────────────────────
  registerReactionHandler(bot);

  // ── DM: Inline button callbacks (perfil skills/tasks/costs, language selector) ──
  bot.on("callback_query", async (ctx) => {
    const data = ctx.callbackQuery?.data;
    if (!data) {
      await ctx.answerCallbackQuery();
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
            await (prisma as any).tree.update({
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
          // Track as potential intro message (message #3 in new-tree flow)
          trackBotMessage(prisma, treeId, welcomeMsg.message_id);

          // Start onboarding after a brief pause
          await new Promise(r => setTimeout(r, 1500));
          await ctx.reply(
            t("onboarding.org_question", lang) + "\n\n" +
            t("onboarding.org_examples", lang) + "\n\n" +
            "_" + t("onboarding.org_prompt", lang) + "_" +
            "\u200B[T24_ONBOARDING]",
            {
              parse_mode: "Markdown",
              reply_markup: {
                force_reply: true,
                input_field_placeholder: t("onboarding.org_placeholder", lang),
              },
            }
          );

          // Set onboarding session state
          const session = (ctx as BotContext).session;
          session.onboardingTreeId = treeId;
          session.onboardingStep = 1;
        }
      }
      return;
    }

    // Onboarding multi-step callbacks (Paso 2: subárbol sí/no)
    if (data === "onboarding:subtree_yes" || data === "onboarding:subtree_no") {
      const session = (ctx as BotContext).session;
      if (!session.onboardingTreeId || session.onboardingStep !== 2) {
        await ctx.answerCallbackQuery();
        return;
      }

      // Resolve language: prefer tree.language for groups, user.language for DMs
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

      if (data === "onboarding:subtree_yes") {
        session.onboardingStep = 3;
        await ctx.reply(t("onboarding.parent_code_prompt", lang), {
          parse_mode: "Markdown",
          reply_markup: { force_reply: true, input_field_placeholder: t("onboarding.parent_code_placeholder", lang) },
        });
      } else {
        // No es sub-árbol → saltar a paso 4 (WhatsApp)
        session.onboardingStep = 4;
        await ctx.reply(
          t("onboarding.parent_skipped", lang) + "\n\n" + t("onboarding.whatsapp_prompt", lang), {
            parse_mode: "Markdown",
            reply_markup: { force_reply: true, input_field_placeholder: t("onboarding.whatsapp_placeholder", lang) },
          }
        );
      }
      await ctx.answerCallbackQuery();
      return;
    }

    const handled = await handleProfileCallback(prisma, ctx as BotContext);
    if (!handled) {
      // Unknown callback — acknowledge silently
      await ctx.answerCallbackQuery();
    }
  });

  // ── Unified poll_answer handler (T8: need voting, T10: satisfaction) ──
  bot.on("poll_answer", async (ctx) => {
    const answer = ctx.pollAnswer;
    if (!answer) return;

    // T8: Check if this is a need-voting poll
    const handled = await handleNeedPollAnswer(prisma, ctx as BotContext);
    if (handled) return;

    // T10: Fall through to satisfaction
    const pollId = answer.poll_id;
    const optionIds = answer.option_ids;
    const voterId = answer.user?.id;
    if (!voterId || optionIds.length === 0) return;

    handleSatisfactionPollAnswer(prisma, ctx as BotContext, pollId, optionIds, voterId).catch(
      (err: any) => console.error("[satisfaction] poll_answer handler error:", err.message)
    );
  });

  // ── Satisfaction comment reply handler (T10) ────────────────────────
  // Runs before the main message:text handler. Detects force_reply
  // responses to the bot's "¿Quieres agregar un comentario?" prompt.
  bot.on("message:text", async (ctx, next) => {
    const msg = ctx.message;
    if (!msg || !("text" in msg)) return next();

    // Check if this is a reply to a bot message (force_reply pattern)
    if (msg.reply_to_message) {
      const handled = await handleSatisfactionCommentReply(prisma, ctx as BotContext);
      if (handled) return; // Don't continue to the normal message handler
    }

    return next();
  });

  // ── Todo reaction handler: track likeCount from message reactions ──
  bot.on("message_reaction", async (ctx) => {
    const chatId = ctx.chat?.id;
    const msgId = ctx.messageReaction?.message_id;
    if (!chatId || !msgId) return;

    try {
      const todo = await (prisma as any).todo.findFirst({
        where: { chatId: BigInt(chatId), messageId: BigInt(msgId) },
      });
      if (todo) {
        const oldLen = (ctx.messageReaction?.old_reaction || []).length;
        const newLen = (ctx.messageReaction?.new_reaction || []).length;
        const delta = newLen - oldLen;
        if (delta !== 0) {
          await (prisma as any).todo.update({
            where: { id: todo.id },
            data: { likeCount: Math.max(0, todo.likeCount + delta) },
          });
        }
      }
    } catch (err) {
      // Non-critical — silently ignore
    }
  });

  // ── Welcome: saludar a nuevos miembros ──────────────────────────────
  bot.on("message:new_chat_members", async (ctx) => {
    const chatType = ctx.chat?.type;
    if (chatType !== "group" && chatType !== "supergroup") return;

    const newMembers = ctx.message.new_chat_members;
    if (!newMembers || newMembers.length === 0) return;

    const chatId = ctx.chat.id.toString();

    // Resolve tree (skip if not linked)
    let tree: any;
    try {
      tree = await (prisma as any).tree.findUnique({
        where: { telegramChatId: chatId },
        select: { id: true, language: true, name: true },
      });
    } catch { return; }
    if (!tree) return;

    const lang = tree.language || "es";

    for (const member of newMembers) {
      if (member.is_bot) continue;

      const userName = member.first_name || "nuevo miembro";
      const mention = member.username ? `@${member.username}` : userName;

      const welcomeText = lang === "en"
        ? [
            `Hi ${mention}! 👋 I'm Ari, the group's multi-agent assistant.`,
            "",
            `I help organize tasks, vote on needs, and keep projects moving. You can ask me things like "Ari add buy charcoal" or use /todo to manage the shared task list.`,
            "",
            `If you'd like, tell me what your main skills are — it helps me organize the group and match people to the right projects. No pressure, only if you feel like it!`,
          ].join("\n")
        : [
            `¡Hola ${mention}! 👋 Soy Ari, la asistente multi-agente del grupo.`,
            "",
            `Ayudo a organizar tareas, votar necesidades y mantener los proyectos en marcha. Podés pedirme cosas como \"Ari anota comprar carbón\" o usar /todo para gestionar la lista de tareas compartida.`,
            "",
            `Si querés, contame cuáles son tus principales habilidades — así puedo organizar mejor al grupo y sus proyectos. ¡Sin presión, solo si tenés ganas!`,
          ].join("\n");

      try {
        await ctx.api.sendMessage(chatId, welcomeText, {
          parse_mode: "Markdown",
        });
      } catch (markdownErr: any) {
        if (markdownErr.message?.includes("can't parse entities")) {
          await ctx.api.sendMessage(chatId, welcomeText);
        }
      }
    }
  });

  // ── Global error boundary: evita que el polling muera silenciosamente ─
  bot.catch((err) => {
    console.error(
      `[Telegram Bot] Unhandled error:`,
      err.message,
      err.error_code ? `(code: ${err.error_code})` : "",
    );
  });

  // ── Telegram API errors: log + recovery ──────────────────────────────
  bot.api.config.use((prev, method, payload) => {
    return prev(method, payload).catch((err: any) => {
      console.error(
        `[Telegram Bot] API error: ${method}`,
        err.error_code || err.message,
      );
      throw err;
    });
  });

  // ── Inicializar i18n ───────────────────────────────────────────────────
  await initI18n();

  // ── Iniciar polling ────────────────────────────────────────────────────
  bot.start({
    onStart(botInfo) {
      console.log(
        `[Telegram Bot] @${botInfo.username} iniciado en modo polling`
      );
      // T13: Recuperar encuestas de aprobación pendientes tras reinicio
      recoverPendingApprovals(bot, prisma).catch((err) =>
        console.error("[approval] Recovery error:", err.message)
      );
    },
  }).catch((err) => {
    console.error("[Telegram Bot] ERROR al iniciar polling:", err.message);
  });

  // Initialize payment service (used by /pagar command)
  initPaymentService(prisma, bot);

  // ── Todo reminders cron: cada 30 minutos ─────────────────────────
  // Solo activo si HERMES_BRIDGE_ENABLED=true (el bot está activo en modo agente)
  if (process.env.HERMES_BRIDGE_ENABLED === "true") {
    const REMINDER_INTERVAL_MS = 30 * 60 * 1000; // 30 minutos
    console.log(
      `[TodoReminders] Cron iniciado — se ejecutará cada ${REMINDER_INTERVAL_MS / 60000} min`
    );
    // Run once on startup, then on interval
    checkTodoReminders(prisma, bot).catch((err) =>
      console.error("[TodoReminders] Startup check error:", err.message)
    );
    setInterval(() => {
      checkTodoReminders(prisma, bot).catch((err) =>
        console.error("[TodoReminders] Cron error:", err.message)
      );
    }, REMINDER_INTERVAL_MS);
  }

  return bot;
}
