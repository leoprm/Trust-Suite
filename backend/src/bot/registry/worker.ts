import { Bot } from "grammy";
import { PrismaClient } from "@prisma/client";
import { BotContext } from "../types";
import { handleTrabajar, handlePerfil, handleTareas, workerHelpMessage } from "../worker";


export function register(bot: Bot<BotContext>, prisma: PrismaClient): void {
  bot.command("trabajar", async (ctx) => {
    await handleTrabajar(prisma, ctx as BotContext);
  });

  bot.command("perfil", async (ctx) => {
    await handlePerfil(prisma, ctx as BotContext);
  });

  bot.command("tareas", async (ctx) => {
    await handleTareas(prisma, ctx as BotContext);
  });

  bot.command("hilt", async (ctx) => {
    const lng = ctx.from?.language_code === "en" ? "en" : "es";
    await ctx.reply(workerHelpMessage(lng));
  });

}
