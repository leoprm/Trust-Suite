import { Bot } from "grammy";
import { PrismaClient } from "@prisma/client";
import { BotContext } from "../types";
import { findTreeByChat } from "../treeResolver";


export function register(bot: Bot<BotContext>, prisma: PrismaClient): void {
  bot.command("pause", async (ctx) => {
    const chatType = ctx.chat?.type;
    if (chatType !== "group" && chatType !== "supergroup") {
      await ctx.reply("🔕 /pause solo funciona en grupos.");
      return;
    }
    const chatId = ctx.chat?.id.toString();
    if (!chatId) return;

    const tree = await findTreeByChat(prisma, chatId);
    if (!tree) {
      await ctx.reply("⚠️ Este grupo no está vinculado a ningún árbol.");
      return;
    }

    // Admin check
    const tgUser = ctx.from;
    if (!tgUser) return;
    const user = await (prisma as any).user.findUnique({
      where: { telegramUserId: BigInt(tgUser.id) },
      select: { id: true },
    });
    if (!user) {
      await ctx.reply("⚠️ No tienes una cuenta vinculada.");
      return;
    }
    const adminMember = await (prisma as any).treeMember.findFirst({
      where: { userId: user.id, treeId: tree.id, role: "ADMIN", status: "ACTIVE" },
    });
    if (!adminMember) {
      await ctx.reply("⚠️ Solo el admin del árbol puede usar /pause.");
      return;
    }

    await (prisma as any).tree.update({
      where: { id: tree.id },
      data: { paused: true },
    });
    await ctx.reply("🔕 Ari está en pausa. Solo admin puede reactivarla con /unpause");
  });

  bot.command("unpause", async (ctx) => {
    const chatType = ctx.chat?.type;
    if (chatType !== "group" && chatType !== "supergroup") {
      await ctx.reply("🔔 /unpause solo funciona en grupos.");
      return;
    }
    const chatId = ctx.chat?.id.toString();
    if (!chatId) return;

    const tree = await findTreeByChat(prisma, chatId);
    if (!tree) {
      await ctx.reply("⚠️ Este grupo no está vinculado a ningún árbol.");
      return;
    }

    // Admin check
    const tgUser = ctx.from;
    if (!tgUser) return;
    const user = await (prisma as any).user.findUnique({
      where: { telegramUserId: BigInt(tgUser.id) },
      select: { id: true },
    });
    if (!user) {
      await ctx.reply("⚠️ No tienes una cuenta vinculada.");
      return;
    }
    const adminMember = await (prisma as any).treeMember.findFirst({
      where: { userId: user.id, treeId: tree.id, role: "ADMIN", status: "ACTIVE" },
    });
    if (!adminMember) {
      await ctx.reply("⚠️ Solo el admin del árbol puede usar /unpause.");
      return;
    }

    await (prisma as any).tree.update({
      where: { id: tree.id },
      data: { paused: false },
    });
    await ctx.reply("🔔 Ari está de vuelta.");
  });

  bot.command("reset", async (ctx) => {
    const chatType = ctx.chat?.type;
    if (chatType !== "group" && chatType !== "supergroup") {
      await ctx.reply("🔄 /reset solo funciona en grupos.");
      return;
    }
    const chatId = ctx.chat?.id.toString();
    if (!chatId) return;

    const tree = await findTreeByChat(prisma, chatId);
    if (!tree) {
      await ctx.reply("⚠️ Este grupo no está vinculado a ningún árbol.");
      return;
    }

    // Admin check
    const tgUser = ctx.from;
    if (!tgUser) return;
    const user = await (prisma as any).user.findUnique({
      where: { telegramUserId: BigInt(tgUser.id) },
      select: { id: true },
    });
    if (!user) {
      await ctx.reply("⚠️ No tienes una cuenta vinculada.");
      return;
    }
    const adminMember = await (prisma as any).treeMember.findFirst({
      where: { userId: user.id, treeId: tree.id, role: "ADMIN", status: "ACTIVE" },
    });
    if (!adminMember) {
      await ctx.reply("⚠️ Solo el admin del árbol puede usar /reset.");
      return;
    }

    // Reset AI member states to IDLE (clear message queue)
    await (prisma as any).treeMember.updateMany({
      where: { treeId: tree.id, isAI: true },
      data: { aiStatus: "IDLE" },
    });
    await ctx.reply("🔄 Cola limpiada. Ari está lista.");
  });

  bot.command("modo", async (ctx) => {
    const chatType = ctx.chat?.type;
    if (chatType !== "group" && chatType !== "supergroup") {
      await ctx.reply("⚙️ /modo solo funciona en grupos.");
      return;
    }
    const chatId = ctx.chat?.id.toString();
    if (!chatId) return;

    const tree = await findTreeByChat(prisma, chatId);
    if (!tree) {
      await ctx.reply("⚠️ Este grupo no está vinculado a ningún árbol.");
      return;
    }

    // Admin check
    const tgUser = ctx.from;
    if (!tgUser) return;
    const user = await (prisma as any).user.findUnique({
      where: { telegramUserId: BigInt(tgUser.id) },
      select: { id: true },
    });
    if (!user) {
      await ctx.reply("⚠️ No tienes una cuenta vinculada.");
      return;
    }
    const adminMember = await (prisma as any).treeMember.findFirst({
      where: { userId: user.id, treeId: tree.id, role: "ADMIN", status: "ACTIVE" },
    });
    if (!adminMember) {
      await ctx.reply("⚠️ Solo el admin del árbol puede usar /modo.");
      return;
    }

    // Parse mode argument
    const raw = ctx.message?.text?.split(/\s+/, 2)[1]?.trim().toLowerCase();
    const modeMap: Record<string, string> = {
      máxima: "MAXIMUM", maxima: "MAXIMUM", maximum: "MAXIMUM",
      media: "MEDIUM", medium: "MEDIUM",
      mínima: "MINIMUM", minima: "MINIMUM", minimum: "MINIMUM",
    };
    const mode = raw ? modeMap[raw] : undefined;

    if (!mode) {
      await ctx.reply(
        "⚙️ Modos disponibles:\n" +
        "• máxima / maximum — Ari interviene siempre\n" +
        "• media / medium — Ari interviene a veces\n" +
        "• mínima / minimum — Ari solo si la mencionan"
      );
      return;
    }

    await (prisma as any).tree.update({
      where: { id: tree.id },
      data: { interactionMode: mode },
    });
    const label = raw === "maxima" ? "máxima" : raw === "minima" ? "mínima" : raw;
    await ctx.reply(`⚙️ Modo cambiado a *${label}*.`);
  });

}
