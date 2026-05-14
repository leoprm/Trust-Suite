/**
 * DM Handler — menú personal en chat privado con Ari.
 *
 * Cuando un usuario habla directo al bot (DM, no grupo),
 * muestra su perfil personal: nivel, habilidades, tareas, costos.
 */

import { BotContext } from "./types";
import { PrismaClient } from "@prisma/client";
import { extractCommandText } from "./commands";
import { findTreeByChat } from "./treeResolver";

// ── Constantes ──────────────────────────────────────────────────────────

const CONCIERGE_URL = "http://localhost:3100/api/concierge";
const CONCIERGE_TIMEOUT_MS = 300_000;

// ── User resolution ─────────────────────────────────────────────────────

async function resolveOrCreateDMUser(
  prisma: PrismaClient,
  telegramUserId: string,
) {
  if (!telegramUserId) return null;
  const tgId = BigInt(telegramUserId);

  const existing = await (prisma as any).user.findUnique({
    where: { telegramUserId: tgId },
    select: {
      id: true,
      username: true,
      role: true,
      skills: true,
      totalXp: true,
      createdAt: true,
    },
  });
  if (existing) return existing;

  // Auto-register
  try {
    return await (prisma as any).user.create({
      data: {
        username: `tg_${telegramUserId}`,
        telegramUserId: tgId,
        role: "USER",
      },
      select: {
        id: true,
        username: true,
        role: true,
        skills: true,
        totalXp: true,
        createdAt: true,
      },
    });
  } catch {
    return null;
  }
}

// ── Main DM router ──────────────────────────────────────────────────────

export async function handleDM(
  prisma: PrismaClient,
  ctx: BotContext,
): Promise<void> {
  const msg = ctx.message;
  if (!msg || !("text" in msg) || !msg.text) return;

  const text = msg.text.trim();
  const tgUser = ctx.from;
  if (!tgUser) {
    await ctx.reply("⚠️ No se pudo identificar tu cuenta de Telegram.");
    return;
  }

  const user = await resolveOrCreateDMUser(prisma, tgUser.id.toString());
  if (!user) {
    await ctx.reply("Error al encontrar o crear tu perfil.");
    return;
  }

  // ── Comandos de perfil ──
  if (text === "/start" || text === "/perfil" || text === "perfil") {
    await showProfile(ctx, user, prisma);
    return;
  }

  // ── /help en DM ──
  if (text === "/help" || text === "help" || text === "ayuda") {
    await ctx.reply(
      "🌳 **Trust Maker — Comandos en DM:**\n\n" +
        "/perfil — Ver tu perfil (nivel, habilidades, tareas)\n" +
        "/help — Esta ayuda\n\n" +
        "También puedes hablarme directamente y te responderé usando la IA de tu primer árbol.",
      { parse_mode: "Markdown" },
    );
    return;
  }

  // ── Mensaje natural → concierge con el primer árbol ──
  const memberships = await (prisma as any).treeMember.findMany({
    where: { userId: user.id, status: "ACTIVE" },
    include: { tree: { select: { id: true, name: true, icono: true } } },
    take: 1,
  });

  if (memberships.length === 0) {
    await ctx.reply(
      "🌳 No estás en ningún árbol todavía.\n\n" +
        "Pide a alguien que te invite a un grupo o crea uno con /crear",
      { parse_mode: "Markdown" },
    );
    return;
  }

  const tree = memberships[0].tree;

  // Typing indicator
  const typingInterval = setInterval(() => {
    ctx.replyWithChatAction("typing").catch(() => {});
  }, 4000);

  const API_SERVER_KEY = process.env.HERMES_API_SERVER_KEY ?? "";
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), CONCIERGE_TIMEOUT_MS);

  try {
    const response = await fetch(CONCIERGE_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${API_SERVER_KEY}`,
        "X-Hermes-Session-Key": `tg-user-${tgUser.id}`,
      },
      body: JSON.stringify({
        message: text,
        treeId: tree.id,
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      await ctx.reply("Lo siento, no estoy disponible ahora.");
      return;
    }

    const data = (await response.json()) as any;
    const reply: string = data?.reply ?? "";

    if (!reply) {
      await ctx.reply("Lo siento, no estoy disponible ahora.");
      return;
    }

    await ctx.reply(reply, { parse_mode: "Markdown" });
  } catch (error: any) {
    if (error.name === "AbortError") {
      await ctx.reply("El agente está pensando, intenta de nuevo.");
    } else {
      await ctx.reply("Lo siento, no estoy disponible ahora.");
    }
  } finally {
    clearTimeout(timeoutId);
    clearInterval(typingInterval);
  }
}

// ── Show profile ────────────────────────────────────────────────────────

async function showProfile(
  ctx: BotContext,
  user: { id: string; username: string; role: string; skills: string | null; totalXp: number },
  prisma: PrismaClient,
): Promise<void> {
  // Parse skills
  let skills: Record<string, number> = {};
  try {
    skills = user.skills ? JSON.parse(user.skills) : {};
  } catch {
    /* ignore */
  }

  const totalXp = user.totalXp || 0;
  const level = Math.floor(Math.sqrt(totalXp) / 10) + 1;

  // Get memberships
  const memberships = await (prisma as any).treeMember.findMany({
    where: { userId: user.id, status: "ACTIVE" },
    include: { tree: { select: { name: true, icono: true } } },
  });

  // Get pending tasks
  const pendingTasks = await (prisma as any).task.findMany({
    where: {
      assigneeId: user.id,
      status: { in: ["PENDING", "ASSIGNED", "IN_PROGRESS"] },
    },
    orderBy: { createdAt: "desc" },
    take: 5,
  });

  // Build profile message
  const lines = [
    `👤 **${user.username}** — Nivel ${level}`,
    "",
    `⭐ XP total: ${totalXp}`,
    "",
    "🛠️ **Habilidades:**",
    ...(Object.keys(skills).length > 0
      ? Object.entries(skills)
          .sort(([, a], [, b]) => (b as number) - (a as number))
          .slice(0, 5)
          .map(([name, xp]) => `• ${name}: ${xp} XP`)
      : ["• *Sin habilidades registradas*"]),
    "",
    `🌳 **Árboles:** ${memberships.length}`,
    ...memberships.map((m: any) => `• ${m.tree.icono} ${m.tree.name}`),
    "",
    "📋 **Tareas pendientes:**",
    ...(pendingTasks.length > 0
      ? pendingTasks.map((t: any) => `• ${t.title} (${t.status})`)
      : ["• *No tienes tareas pendientes*"]),
    "",
    "💬 Envíame un mensaje para hablar con la IA del árbol.",
  ];

  const keyboard = {
    inline_keyboard: [
      [{ text: "🛠️ Mis habilidades", callback_data: "profile_skills" }],
      [{ text: "📋 Mis tareas", callback_data: "profile_tasks" }],
      [{ text: "💰 Costos", callback_data: "profile_costs" }],
    ],
  };

  await ctx.reply(lines.join("\n"), {
    parse_mode: "Markdown",
    reply_markup: keyboard,
  });
}

// ── Inline button handlers ──────────────────────────────────────────────

export async function handleProfileCallback(
  prisma: PrismaClient,
  ctx: BotContext,
): Promise<boolean> {
  const data = ctx.callbackQuery?.data;
  if (!data) return false;

  const tgUser = ctx.from;
  if (!tgUser) return false;

  // ── profile_skills ──
  if (data === "profile_skills") {
    const user = await resolveOrCreateDMUser(prisma, tgUser.id.toString());
    if (!user) {
      await ctx.answerCallbackQuery({ text: "Error al cargar tu perfil." });
      return true;
    }

    let skills: Record<string, number> = {};
    try {
      skills = user.skills ? JSON.parse(user.skills) : {};
    } catch {
      /* ignore */
    }

    const entries = Object.entries(skills).sort(
      ([, a], [, b]) => (b as number) - (a as number),
    );

    if (entries.length === 0) {
      await ctx.reply("🛠️ No tienes habilidades registradas aún.\n\nLas habilidades se ganan completando tareas en los árboles.");
    } else {
      const skillLines = ["🛠️ **Tus habilidades:**", ""];
      for (const [name, xp] of entries) {
        const lvl = Math.floor((xp as number) / 100) + 1;
        skillLines.push(`• **${name}**: ${xp} XP (Nivel ${lvl})`);
      }
      await ctx.reply(skillLines.join("\n"), { parse_mode: "Markdown" });
    }

    await ctx.answerCallbackQuery();
    return true;
  }

  // ── profile_tasks ──
  if (data === "profile_tasks") {
    const user = await resolveOrCreateDMUser(prisma, tgUser.id.toString());
    if (!user) {
      await ctx.answerCallbackQuery({ text: "Error al cargar tus tareas." });
      return true;
    }

    const tasks = await (prisma as any).task.findMany({
      where: { assigneeId: user.id },
      orderBy: { createdAt: "desc" },
      take: 20,
      include: { tree: { select: { name: true, icono: true } } },
    });

    if (tasks.length === 0) {
      await ctx.reply("📋 No tienes tareas asignadas.\n\nCuando un árbol te asigne tareas, aparecerán aquí.");
    } else {
      const statusEmoji: Record<string, string> = {
        PENDING: "⏳",
        ASSIGNED: "📌",
        IN_PROGRESS: "🔧",
        EVIDENCE_SUBMITTED: "📤",
        VERIFIED: "✅",
        PAID: "💰",
        DISPUTED: "⚠️",
      };

      const taskLines = ["📋 **Tus tareas:**", ""];
      for (const t of tasks) {
        const emoji = statusEmoji[t.status] ?? "❓";
        const treeName = t.tree ? `${t.tree.icono} ${t.tree.name}` : "🌳";
        taskLines.push(
          `${emoji} **${t.title}** — ${t.status}`,
          `   ${treeName}${t.budget ? ` | ${t.budget} CLP` : ""}`,
          "",
        );
      }
      await ctx.reply(taskLines.join("\n"), { parse_mode: "Markdown" });
    }

    await ctx.answerCallbackQuery();
    return true;
  }

  // ── profile_costs ──
  if (data === "profile_costs") {
    const userId = tgUser.id.toString();
    const costText = await getUserCosts(prisma, userId);
    await ctx.reply(costText, { parse_mode: "Markdown" });
    await ctx.answerCallbackQuery();
    return true;
  }

  return false;
}

// ── Cost query for DM ───────────────────────────────────────────────────

async function getUserCosts(
  prisma: PrismaClient,
  telegramUserId: string,
): Promise<string> {
  const user = await resolveOrCreateDMUser(prisma, telegramUserId);
  if (!user) return "⚠️ No se pudo encontrar tu perfil.";

  // Platform config
  const configs = await (prisma as any).platformConfig.findMany();
  const getVal = (key: string): string => {
    const c = configs.find((c: any) => c.key === key);
    return c?.value ?? "0";
  };

  const salaries = parseFloat(getVal("cost_salaries"));
  const infra = parseFloat(getVal("cost_infrastructure"));
  const fixed = parseFloat(getVal("cost_fixed"));
  const margin = parseFloat(getVal("growth_margin_pct"));
  const totalFixed = salaries + infra + fixed;

  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);

  // User's memberships
  const memberships = await (prisma as any).treeMember.findMany({
    where: { userId: user.id, status: "ACTIVE" },
    include: { tree: { select: { id: true, name: true, icono: true } } },
  });

  if (memberships.length === 0) {
    return "🌳 No eres miembro activo de ningún árbol.\n\nNo tienes costos este mes.";
  }

  // Active trees (for fixed cost division)
  const activeTrees = await (prisma as any).treeMember.groupBy({
    by: ["treeId"],
    where: { status: "ACTIVE" },
  });
  const fixedPerTree = totalFixed / (activeTrees.length || 1);

  const lines = ["💰 **Tus costos este mes:**", ""];

  let totalPersonal = 0;

  for (const m of memberships) {
    const treeId = m.treeId;
    const treeName = m.tree.name;
    const icono = m.tree.icono;

    // API usage for this tree this month (non-free)
    const apiAgg = await (prisma as any).apiUsage.aggregate({
      where: {
        treeId,
        createdAt: { gte: startOfMonth },
        isFreePeriod: false,
      },
      _sum: { cost: true },
    });
    const apiCost = apiAgg._sum?.cost || 0;

    // Active members in this tree
    const memberCount = await (prisma as any).treeMember.count({
      where: { treeId, status: "ACTIVE" },
    });

    const treeTotal = apiCost + fixedPerTree;
    const perPerson = treeTotal / (memberCount || 1);

    totalPersonal += perPerson;

    lines.push(
      `${icono} **${treeName}** (${memberCount} miembros)`,
      `   APIs: $${apiCost.toFixed(2)} + Fijos: $${fixedPerTree.toFixed(2)} = $${treeTotal.toFixed(2)}`,
      `   → **$${perPerson.toFixed(2)} por persona**`,
      "",
    );
  }

  // Check if user is in free period
  const freeUsage = await (prisma as any).apiUsage.findFirst({
    where: {
      userId: user.id,
      createdAt: { gte: startOfMonth },
      isFreePeriod: true,
    },
  });

  if (freeUsage) {
    lines.push(
      "🎁 **Estás en período gratuito** — la plataforma absorbe tus costos este mes.",
    );
  } else {
    lines.push(`💸 **Total estimado: $${totalPersonal.toFixed(2)}**`);
  }

  lines.push(
    "",
    "💡 Los costos se dividen entre todos los miembros activos del árbol.",
    `📈 Margen de crecimiento: ${margin}%`,
  );

  return lines.join("\n");
}
