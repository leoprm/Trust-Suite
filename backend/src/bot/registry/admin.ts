import { Bot } from "grammy";
import { PrismaClient } from "@prisma/client";
import { BotContext } from "../types";
import { requireTreeAdmin } from "../helpers";


export function register(bot: Bot<BotContext>, prisma: PrismaClient): void {
  bot.command("pause", async (ctx) => {
    const admin = await requireTreeAdmin(prisma, ctx);
    if (!admin) return;
    const { tree } = admin;

    await (prisma as any).tree.update({
      where: { id: tree.id },
      data: { paused: true },
    });
    await ctx.reply("🔕 Ari está en pausa. Solo admin puede reactivarla con /unpause");
  });

  bot.command("unpause", async (ctx) => {
    const admin = await requireTreeAdmin(prisma, ctx);
    if (!admin) return;
    const { tree } = admin;

    await (prisma as any).tree.update({
      where: { id: tree.id },
      data: { paused: false },
    });
    await ctx.reply("🔔 Ari está de vuelta.");
  });

  bot.command("reset", async (ctx) => {
    const admin = await requireTreeAdmin(prisma, ctx);
    if (!admin) return;
    const { tree } = admin;

    // Reset AI member states to IDLE (clear message queue)
    await (prisma as any).treeMember.updateMany({
      where: { treeId: tree.id, isAI: true },
      data: { aiStatus: "IDLE" },
    });
    await ctx.reply("🔄 Cola limpiada. Ari está lista.");
  });

  bot.command("modo", async (ctx) => {
    const admin = await requireTreeAdmin(prisma, ctx);
    if (!admin) return;
    const { tree } = admin;

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
