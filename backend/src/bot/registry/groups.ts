import { promises as fsPromises } from "fs";
import { Bot, InputFile } from "grammy";
import { PrismaClient } from "@prisma/client";
import { BotContext } from "../types";
import { checkMemberLimit, shouldRejectInvite, isTreeBlocked } from "../antiDdos";
import { syncAllMembers } from "../telegramClient";
import { resolveUserLanguage, showLanguageSelector } from "../messages";
import { t } from "../i18n";
import { extractSimpleKeywords, getTreeDepth, resolveTreeLanguage, trackBotMessage } from "../helpers";
import { analyzeMessage } from "../analyzer";
import { routeToHermes } from "../hermesBridge/route";
import { shouldAriRespond } from "../hermesBridge/decision-filter";
import { sendTelegramMessage } from "../hermesBridge/telegram-sender";
import { getChatHistory } from "../hermesBridge/history";
import { checkRateLimit } from "../rateLimiter";
import { parseDeadline } from "../deadlineParser";
import { checkPaymentAccess } from "../payment";
import { handleMessage, extractCommandText } from "../commands";
import { handleNaturalMessage } from "../messages";
import { detectNaturalAddIntent } from "../todoNaturalAdd";
import { summarizeTodo } from "../formatters";
import { handleEncuestaText } from "../encuesta";
import { registerReactionHandler } from "../voting";
import { sendSatisfactionPoll } from "../satisfaction";
import { formatForChannel, sendViaTelegram } from "../channelAdapter";
import { appendToDailyLog } from "../../lib/dailyLog";



export function register(bot: Bot<BotContext>, prisma: PrismaClient): void {
  function rejoinMessage(treeName: string): string {
    return `🌳 ¡He vuelto! El árbol "${treeName}" sigue activo.`;
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
      const tree = await prisma.tree.findUnique({
        where: { id: treeId },
        select: { introMessageId: true },
      });
      if (!tree?.introMessageId) {
        await prisma.tree.update({
          where: { id: treeId },
          data: { introMessageId: BigInt(messageId) },
        });
      }
    }
  }



  bot.on("my_chat_member", async (ctx) => {
    const chat = ctx.chat;
    const newStatus = ctx.update.my_chat_member.new_chat_member.status;

    if (chat.type === "group" || chat.type === "supergroup") {
      // ── Ari removed from group → schedule tree deletion in 60 min ──────
        if (newStatus === "kicked" || newStatus === "left") {
        const chatId = chat.id.toString();
        try {
          await prisma.tree.updateMany({
            where: { telegramChatId: chatId },
            data: { pendingDeletionAt: new Date(Date.now() + 60 * 60 * 1000) },
          });
          console.log(`[Telegram Bot] Ari removed from ${chatId}, tree scheduled for deletion in 60 min`);
        } catch (err: any) {
          console.error(`[Telegram Bot] Error scheduling deletion for ${chatId}:`, err.message);
        }
        return;
      }

      if (newStatus === "member" || newStatus === "administrator") {
        const chatId = chat.id.toString();
        const adderId = ctx.update.my_chat_member.from.id.toString();
        try {
          // ── Admin bypass ──────────────────────────────────────────────
          const TRUSTMAKER_ADMIN_TELEGRAM_ID = process.env.TRUSTMAKER_ADMIN_TELEGRAM_ID
            || process.env.BETA_ADMIN_TELEGRAM_IDS?.split(",")[0]?.trim()
            || "7516190425";

          const isBetaAdmin = adderId === TRUSTMAKER_ADMIN_TELEGRAM_ID;

          // ── Gate: capacity limit (MAX_TREES) — DISABLED para fase beta ──
          // Código original preservado. Reactivar: descomentar y quitar if(false)
          if (false) {
          const MAX_TREES = parseInt(process.env.MAX_TREES || "5", 10);
          const treeCount = await prisma.tree.count({
            where: { telegramChatId: { not: null } },
          });

          if (!isBetaAdmin && treeCount >= MAX_TREES) {
            // Check if tree already exists (rejoin case — don't block re-adds)
            const existingTree = await prisma.tree.findUnique({
              where: { telegramChatId: chatId },
            });
            if (existingTree) {
              // Rejoin: existing tree, cancel pending deletion, sync adder as member
              await prisma.tree.update({
                where: { id: existingTree.id },
                data: { pendingDeletionAt: null, standby: false, leaveAttempts: 0 },
              });

              // Sync the adder as TreeMember (in case it was lost)
              try {
                const tgId = BigInt(adderId);
                let adderUser = await prisma.user.findUnique({ where: { telegramUserId: tgId } });
                if (!adderUser) {
                  adderUser = await prisma.user.create({
                    data: { username: `tg_${adderId}`, telegramUserId: tgId, firstName: ctx.update.my_chat_member.from.first_name || null, language: null },
                  });
                }
                await prisma.treeMember.upsert({
                  where: { userId_treeId: { userId: adderUser.id, treeId: existingTree.id } },
                  create: { userId: adderUser.id, treeId: existingTree.id, role: "ADMIN" },
                  update: { status: "ACTIVE", role: "ADMIN" },
                });
              } catch (memberErr: any) {
                console.error(`[Telegram Bot] Error syncing adder member on rejoin:`, memberErr.message);
              }

              // Sync ALL group members via MTProto
              try {
                const synced = await syncAllMembers(chat.id, existingTree.id, ctx.update.my_chat_member.from.id);
                console.log(`[Telegram Bot] Synced ${synced} members for tree ${existingTree.id}`);
              } catch (syncErr: any) {
                console.error("[Telegram Bot] Member sync failed:", syncErr?.message || syncErr);
              }

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
              await prisma.waitlist.create({
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
          } // END if(false) — DISABLED

          // ── Gate: 1 group per user during beta ──────────────────────────
          // Check if the adder already administers a tree
          const adderTgId = BigInt(adderId);
          const adderUser = await prisma.user.findUnique({
            where: { telegramUserId: adderTgId },
            select: { id: true },
          });

          if (adderUser) {
            const adminTrees = await prisma.treeMember.count({
              where: {
                userId: adderUser.id,
                role: "ADMIN",
                status: "ACTIVE",
              },
            });

            // ── Gate: 1 group per user during beta — DISABLED ──
            // Código original preservado
            if (false) {
            const MAX_USER_TREES = parseInt(process.env.MAX_TREES_PER_USER || "2", 10);
            if (!isBetaAdmin && adminTrees >= MAX_USER_TREES) {
              // Check if tree already exists (rejoin to same tree)
              const existingTree = await prisma.tree.findUnique({
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
            } // END if(false) — DISABLED
          }

          // Check if tree already exists for this group
          let tree = await prisma.tree.findUnique({
            where: { telegramChatId: chatId },
          });
          let isNewTree = false;
          if (!tree) {
            tree = await prisma.tree.create({
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
              import("../../services/treeSandbox").then(({ TreeSandbox }) =>
                TreeSandbox.create(tree.id).catch((err: any) =>
                  console.error("[Telegram Bot] Sandbox auto-create failed:", err?.message || err)
                )
              );
            } catch {
              // Non-blocking
            }
            isNewTree = true;
          }

          // ── Anti-DDoS: reject blocked/standby trees ──────────────────
          if (!isNewTree) {
            const inviteCheck = await shouldRejectInvite(prisma, chatId);
            if (inviteCheck.reject) {
              console.log(
                `[antiDdos] Rejecting invite to ${chatId}: ${inviteCheck.reason}`,
              );
              await ctx.api.leaveChat(chatId);
              return;
            }
          }

          // Auto-add the user who invited the bot
          try {
            // Resolve or create user by telegram ID
            const tgId = BigInt(adderId);
            let user = await prisma.user.findUnique({ where: { telegramUserId: tgId } });
            if (!user) {
              user = await prisma.user.create({
                data: { username: `tg_${adderId}`, telegramUserId: tgId, firstName: ctx.from?.first_name || null, language: null },
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

          // Sync ALL group members via MTProto
          try {
            const synced = await syncAllMembers(chat.id, tree.id, ctx.update.my_chat_member.from.id);
            console.log(`[Telegram Bot] Synced ${synced} members for tree ${tree.id}`);
          } catch (syncErr: any) {
            console.error("[Telegram Bot] Member sync failed:", syncErr?.message || syncErr);
          }

          // Send welcome / rejoin message
          try {
            if (isNewTree) {
              // Send language selector FIRST, then subtree question
              await ctx.api.sendMessage(
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
            } else {
              // Rejoin: existing tree, cancel any pending deletion
              await prisma.tree.update({
                where: { id: tree!.id },
                data: { pendingDeletionAt: null, standby: false },
              });
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


  bot.on("message:text", async (ctx) => {
    const msg = ctx.message;
    if (!msg || !("text" in msg) || !msg.text) return;

    const chatType = ctx.chat?.type;
    // Skip DM — already handled above
    if (chatType === "private") return;

    const chatId = ctx.chat?.id.toString();

    // ── Anti-DDoS: skip blocked trees ────────────────────────────────
    if (chatId) {
      const ddosTree = ctx.tree!;
      if (ddosTree) {
        if (await isTreeBlocked(prisma, ddosTree.id)) {
          return; // silently drop — tree is blocked for 3 months
        }
        // Fire-and-forget: check member limit on every message
        checkMemberLimit(prisma, bot as any, ddosTree.id).catch((err: Error) => {
          console.error("[antiDdos] checkMemberLimit error:", err.message);
        });

        // ── Pause gate: if tree is paused, block all messages except /unpause and /reset ──
        if ((ddosTree as any).paused) {
          const cmdText = extractCommandText(msg.text);
          const isUnpauseReset = /^\/(unpause|reset)\b/.test(msg.text)
            || (cmdText !== null && /^\/(unpause|reset)\b/.test(cmdText));
          if (!isUnpauseReset) {
            await ctx.reply("🔕 Ari está en pausa.");
            return;
          }
        }
      }
    }

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
      const tree = ctx.tree!;
      if (tree) {
        if (!todoText) {
          // Show ranked list — urgent unassigned first, then by likes
          const todos = await prisma.todo.findMany({
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
          const todo = await prisma.todo.create({
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
        const tree = ctx.tree!;
        if (tree) {
          // Resolve tree language for i18n
          let lng = "es";
          try {
            const treeData = await prisma.tree.findUnique({
              where: { id: tree.id },
              select: { language: true },
            });
            if (treeData?.language) lng = treeData.language;
          } catch { /* fallback es */ }

          // Check for duplicate: exact summary match in PENDING todos
          const existing = await prisma.todo.findFirst({
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
          await prisma.todo.create({
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
      const tree = ctx.tree!;
      if (tree) {
        // Resolve tree language for i18n
        let lng = "es";
        try {
          const treeData = await prisma.tree.findUnique({
            where: { id: tree.id },
            select: { language: true },
          });
          if (treeData?.language) lng = treeData.language;
        } catch { /* fallback es */ }

        const pendingTodos = await prisma.todo.findMany({
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
          } = await import("../todoCompletion");

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
              await prisma.todo.update({
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
              await prisma.todo.update({
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
                  memberCount = await prisma.treeMember.count({
                    where: { treeId: tree.id, status: "ACTIVE" },
                  });
                } catch { /* fallback */ }

                if (memberCount < 15 && memberCount > 0) {
                  // Get member Telegram IDs for mentions
                  let members: any[] = [];
                  try {
                    members = await prisma.treeMember.findMany({
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
      const tree = ctx.tree!;
      if (tree) {
        const pendingTodos = await prisma.todo.findMany({
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

          const { detectCompletion } = await import("../todoCompletion");
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
            await prisma.todo.update({
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

    // ── Interaction Mode Gate ─────────────────────────────────────────
    // Reads tree.interactionMode to throttle proactive engagement.
    // MINIMUM → only reply + @tag pass. MEDIUM → reply/tag/name pass
    // but conversation window is skipped. MAXIMUM → full behavior.
    let interactionMode = "MAXIMUM";
    if (chatId) {
      const modeTree = ctx.tree!;
      interactionMode = modeTree?.interactionMode || "MAXIMUM";
    }

    // MINIMUM: only reply and @tag pass through; block everything else
    if (interactionMode === "MINIMUM") {
      const isTagged = /@Ari\b|@TrustMakerBot\b/i.test(msg.text || "");
      if (!isReplyToBot && !isTagged && !cmdText?.startsWith("/")) {
        cmdText = null;
      }
    }

    // MEDIUM: detect name-mentions ("Ari" without @) alongside reply/tag
    const isNamed = interactionMode === "MEDIUM" && /\bAri\b/i.test(msg.text || "");
    if (isNamed && cmdText === null) {
      cmdText = msg.text.trim();
    }

    let isOneOnOne = false;
    if (cmdText === null || cmdText === "") {
      // One-on-one mode: if Telegram group has exactly 2 members (Ari + 1 person),
      // bypass shouldAriRespond and respond to everything.
      // If more members join (3+), shouldAriRespond reactivates normally.
      if (chatId) {
        try {
          const memberCount = await ctx.getChatMemberCount();
          if (memberCount === 2) {
            cmdText = msg.text.trim();
            isOneOnOne = true;
          }
        } catch (err: any) {
          // Fallback: if getChatMemberCount fails (e.g. in DMs), check DB
          const soloTree = ctx.tree!;
          if (soloTree) {
            const dbCount = await prisma.treeMember.count({
              where: { treeId: soloTree.id, status: "ACTIVE" },
            });
            if (dbCount <= 1) {
              cmdText = msg.text.trim();
              isOneOnOne = true;
            }
          }
        }
      }
    }

    // ── Conversation Window: proactive engagement (Hermes Bridge) ────
    // Runs BEFORE the cmdText null gate to decide if Ari should join
    // ambient conversation via keyword scanning or active window state.
    // The LLM decides whether to actually respond — we just gate the routing.
    let isConversationWindow = false;
    if (interactionMode !== "MINIMUM" && interactionMode !== "MEDIUM") {
      if (process.env.HERMES_BRIDGE_ENABLED === "true" && chatId) {
        const {
          conversationWindows,
          scanForKeywordMatch: hbScan,
        } = await import("../hermesBridge");

        // 1. Tagged/reply → open/renew window (Hermes Bridge routes it below)
        if (isReplyToBot && cmdText !== null) {
          conversationWindows.resetWindow(chatId);
          isConversationWindow = true;
        }

        // 2. Active conversation window → always route to Ari (LLM decides)
        if (!isConversationWindow && conversationWindows.hasActiveWindow(chatId) && cmdText === null) {
          conversationWindows.tickWindow(chatId);
          // Still active after tick? → route
          if (conversationWindows.hasActiveWindow(chatId)) {
            cmdText = msg.text.trim();
            isConversationWindow = true;
          }
        }

        // 3. No active window → scan for engagement keywords
        if (!isConversationWindow && cmdText === null) {
          const keyword = hbScan(msg.text);
          if (keyword) {
            conversationWindows.openWindow(chatId, keyword);
            cmdText = msg.text.trim();
            isConversationWindow = true;
          }
        }
      }
    }

    if (cmdText === null || cmdText === "") return;

    // 3.5 Payment check: verificar acceso antes de procesar
    if (chatId) {
      const paymentResult = await checkPaymentAccess(prisma, ctx, chatId, cmdText);
      if (paymentResult.blocked) {
        await ctx.reply(paymentResult.reply, { parse_mode: "Markdown" });
        return;
      }
    }

    // ── Hermes Bridge: si está habilitado, enrutar al agente con decisión previa ──
    if (process.env.HERMES_BRIDGE_ENABLED === "true") {
      const tree = ctx.tree!;
      // DEBUG: log resolved tree
      await fsPromises.appendFile("/tmp/tm_tree_resolve.log", JSON.stringify({
        ts: new Date().toISOString(),
        chatId,
        resolvedTreeId: tree?.id,
        resolvedTreeName: tree?.name,
      }) + "\n").catch(e => console.error('[bot:groups] appendFile failed:', e.message));
      if (!tree) {
        await ctx.reply("⚠️ Este grupo no está vinculado a ningún árbol de Trust Maker.");
        return;
      }

      // ── Log user message to daily conversation log ──────────────────
      try {
        appendToDailyLog(
          tree.id,
          new Date(msg.date * 1000),
          ctx.from?.first_name || "Unknown",
          cmdText,
        );
      } catch { /* best-effort */ }

      const displayName = ctx.from?.first_name || ctx.from?.id.toString() || "alguien";

      // ── Prepend display name so the agent knows who is speaking ──────
      const fullMessage = `${displayName}: ${cmdText}`;

      // ── MEDIUM or one-on-one: skip shouldAriRespond, route directly to Hermes ──────
      if (interactionMode === "MEDIUM" || isOneOnOne) {
        const userId = ctx.from?.id.toString() || "0";
        const typingInterval = setInterval(() => {
          ctx.replyWithChatAction("typing").catch(e => console.error('[bot:typing] replyWithChatAction failed:', e.message));
        }, 4000);
        ctx.replyWithChatAction("typing").catch(e => console.error('[bot:typing] replyWithChatAction failed:', e.message));
        try {
          const chatHistory = ctx.chat?.id
            ? await getChatHistory(ctx.chat.id, tree.id, 20)
            : [];
          const response = await routeToHermes(
            fullMessage, tree.id, userId, chatHistory, displayName,
            ctx.chat?.id, msg.message_id,
          );
          clearInterval(typingInterval);
          if (response) {
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
            if (response.text) {
              await sendTelegramMessage(ctx, response.text, "Markdown");
            }
          }
        } catch (err: any) {
          clearInterval(typingInterval);
          console.error("[HermesBridge] MEDIUM routeToHermes threw:", err.message);
        }
        return;
      }

      // Determine explicit triggers for the decision filter
      const isReplyToBot = !!(
        msg.reply_to_message &&
        (msg.reply_to_message.from?.username === "TrustMakerBot" ||
         msg.reply_to_message.from?.is_bot === true)
      );
      // Check if Ari is mentioned/tagged by name (case-insensitive)
      const isTagged = /@Ari\b|@TrustMakerBot\b/i.test(msg.text);

      // Fetch recent messages for decision context (same query, different mapping)
      let recentMessages: { senderName: string; content: string }[] = [];
      try {
        const rawMessages = await prisma.chatMessage.findMany({
          where: { treeId: tree.id },
          orderBy: { createdAt: "desc" },
          take: 10,
          select: { content: true },
        });
        // Parse "DisplayName: message" format stored in chatMessage.content
        recentMessages = rawMessages
          .reverse()
          .map((m: any) => {
            const content = m.content ?? "";
            const colonIdx = content.indexOf(": ");
            if (colonIdx > 0) {
              return {
                senderName: content.slice(0, colonIdx),
                content: content.slice(colonIdx + 2),
              };
            }
            return { senderName: "", content };
          });
      } catch { /* non-critical */ }

      // ── Decision gate: should Ari respond? ──────────────────────────
      // Keep typing indicator alive during potentially long API call
      const typingInterval2 = setInterval(() => {
        ctx.replyWithChatAction("typing").catch(e => console.error('[bot:typing] replyWithChatAction failed:', e.message));
      }, 4000);
      ctx.replyWithChatAction("typing").catch(e => console.error('[bot:typing] replyWithChatAction failed:', e.message));
      let decision;
      try {
        decision = await shouldAriRespond(
          fullMessage,
          tree.id,
          recentMessages,
          isReplyToBot,
          isTagged,
        );
      } catch (err: any) {
        clearInterval(typingInterval2);
        console.error("[HermesBridge] shouldAriRespond threw:", err.message);
        // On error, fall through to silent — better than spamming
        return;
      }

      clearInterval(typingInterval2);

      if (!decision.shouldRespond) {
        // Ari decided to stay silent — no message sent
        return;
      }

      // ── Ari responded — reset conversation window ────────────────────
      try {
        const { conversationWindows } = await import("../hermesBridge");
        conversationWindows.resetWindow(tree.id);
      } catch { /* best-effort */ }

      // ── Ari should respond — route to Hermes for actual response ────
      const userId = ctx.from?.id.toString() || "0";
      const typingInterval3 = setInterval(() => {
        ctx.replyWithChatAction("typing").catch(e => console.error('[bot:typing] replyWithChatAction failed:', e.message));
      }, 4000);
      ctx.replyWithChatAction("typing").catch(e => console.error('[bot:typing] replyWithChatAction failed:', e.message));
      try {
        const chatHistory = ctx.chat?.id
          ? await getChatHistory(ctx.chat.id, tree.id, 20)
          : [];
        const response = await routeToHermes(
          fullMessage, tree.id, userId, chatHistory, displayName,
          ctx.chat?.id, msg.message_id,
        );
        clearInterval(typingInterval3);
        if (response) {
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
          if (response.text) {
            await sendTelegramMessage(ctx, response.text, "Markdown");
          }
        }
      } catch (err: any) {
        clearInterval(typingInterval3);
        console.error("[HermesBridge] routeToHermes threw:", err.message);
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

        // TTS: only for voice messages (text commands → no audio)
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

        // TTS: only for voice messages (text → no audio)
      }
    }

    // ── Daily conversation log ───────────────────────────────────────
    if (chatId && chatType !== "private") {
      try {
        const logTree = ctx.tree!;
        if (logTree) {
          appendToDailyLog(
            logTree.id,
            new Date(msg.date * 1000),
            ctx.from?.first_name || "Unknown",
            msg.text,
          );
        }
      } catch { /* silent — dailyLog is best-effort */ }
    }
  });

}
