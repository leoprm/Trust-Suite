import { Bot } from "grammy";
import { PrismaClient } from "@prisma/client";
import { BotContext } from "../types";
import { findTreeByChat } from "../treeResolver";
import { checkMemberLimit, shouldRejectInvite, isTreeBlocked } from "../antiDdos";
import { syncAllMembers } from "../telegramClient";
import { t } from "../i18n";


export function register(bot: Bot<BotContext>, prisma: PrismaClient): void {
  bot.on("chat_member", async (ctx) => {
    const chat = ctx.chat;
    if (chat.type !== "group" && chat.type !== "supergroup") return;

    const oldStatus = ctx.chatMember.old_chat_member.status;
    const newMember = ctx.chatMember.new_chat_member;

    // ── Human left → check if last human, schedule tree deletion ─────────
    if (
      (newMember.status === "left" || newMember.status === "kicked") &&
      !newMember.user.is_bot
    ) {
      const chatId = chat.id.toString();
      try {
        const tree = await (prisma as any).tree.findUnique({
          where: { telegramChatId: chatId },
          select: { id: true },
        });
        if (!tree) return;

        // Count remaining human members (Ari included)
        const humanCount = await prisma.treeMember.count({
          where: { treeId: tree.id, status: "ACTIVE", isAI: false },
        });
        if (humanCount <= 1) {
          // Last human leaving → schedule deletion in 60 min
          await (prisma as any).tree.update({
            where: { id: tree.id },
            data: { pendingDeletionAt: new Date(Date.now() + 60 * 60 * 1000) },
          });
          console.log(`[Telegram Bot] Last human left ${chatId}, tree ${tree.id} scheduled for deletion in 60 min`);
        }
      } catch (err: any) {
        console.error(`[Telegram Bot] Error checking last-human for ${chat.id}:`, err.message);
      }
      return;
    }

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

      // ── Upsert the new member into the database ──────────────────────
      try {
        const tgUser = newMember.user;
        const tgId = BigInt(tgUser.id);

        let user = await prisma.user.findUnique({
          where: { telegramUserId: tgId },
        });
        if (!user) {
          user = await prisma.user.create({
            data: {
              username: tgUser.username || `tg${tgUser.id}`,
              firstName: tgUser.first_name || null,
              telegramUserId: tgId,
            },
          });
        } else if (tgUser.first_name && user.firstName !== tgUser.first_name) {
          await prisma.user.update({
            where: { id: user.id },
            data: { firstName: tgUser.first_name },
          });
        }

        await prisma.treeMember.upsert({
          where: { userId_treeId: { userId: user.id, treeId: tree.id } },
          create: {
            userId: user.id,
            treeId: tree.id,
            role: "MEMBER",
            status: "ACTIVE",
          },
          update: { status: "ACTIVE" },
        });
      } catch (err: any) {
        console.error(
          `[Telegram Bot] Error upserting new member ${newMember.user.id}:`,
          err.message,
        );
      }

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
            `Welcome to the tree! 🌳`,
          ].join("\n")
        : [
            `¡Hola ${mention}! 👋 Soy Ari, la asistente multi-agente del grupo.`,
            "",
            `Ayudo a organizar tareas, votar necesidades y mantener los proyectos en marcha. Podés pedirme cosas como \"Ari anota comprar carbón\" o usar /todo para gestionar la lista de tareas compartida.`,
            "",
            `¡Bienvenido al árbol! 🌳`,
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

}
