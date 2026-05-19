/**
 * DM Handler - menu personal en chat privado con Ari.
 *
 * Cuando un usuario habla directo al bot (DM, no grupo),
 * muestra su perfil personal: nivel, habilidades, tareas, costos.
 */

import { BotContext } from "./types";
import { PrismaClient } from "@prisma/client";
import { t } from "./i18n";
import { extractCommandText } from "./commands";
import { findTreeByChat } from "./treeResolver";
import { showLanguageSelector } from "./messages";
import {
  handleTrabajar,
  handlePerfil as handleWorkerPerfil,
  handleTareas,
  handleWorkerCallback,
  handleWorkerTextContinuation,
} from "./worker";

// Constantes

const CONCIERGE_URL = "http://localhost:3100/api/concierge";
const CONCIERGE_TIMEOUT_MS = 900_000;

// Helpers

function getUserLanguage(ctx: BotContext): string {
  const code = ctx.from?.language_code;
  if (code === "en") return "en";
  return "es";
}

// User resolution

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
      language: true,
    },
  });
  if (existing) return existing;

  // Auto-register - language starts as null (forces onboarding selector)
  try {
    return await (prisma as any).user.create({
      data: {
        username: `tg_${telegramUserId}`,
        telegramUserId: tgId,
        role: "USER",
        language: null,
      },
      select: {
        id: true,
        username: true,
        role: true,
        skills: true,
        totalXp: true,
        createdAt: true,
        language: true,
      },
    });
  } catch {
    return null;
  }
}

// Main DM router

export async function handleDM(
  prisma: PrismaClient,
  ctx: BotContext,
): Promise<void> {
  const msg = ctx.message;
  if (!msg || !("text" in msg) || !msg.text) return;

  const text = msg.text.trim();
  const tgUser = ctx.from;
  const lng = getUserLanguage(ctx);

  if (!tgUser) {
    await ctx.reply(t("common:not_identified", lng));
    return;
  }

  const user = await resolveOrCreateDMUser(prisma, tgUser.id.toString());
  if (!user) {
    await ctx.reply(t("errors:profile_load_error", lng));
    return;
  }

  // Language selector: if user hasn't chosen a language yet
  if (!user.language) {
    await showLanguageSelector(ctx);
    return;
  }

  // --- Worker commands (DM-only, before other routing) ---

  // /trabajar - Worker onboarding (multi-step)
  if (text.startsWith("/trabajar")) {
    const handled = await handleTrabajar(prisma, ctx);
    if (handled) return;
    // fall through if not fully handled
  }

  // Multi-step continuation for /trabajar (workerFlow in session)
  // or /perfil edit prompts (step 100+)
  if (ctx.session.workerFlow) {
    // Check if it's a worker onboarding flow (step 1-5)
    if (ctx.session.workerFlow.step <= 5) {
      const handled = await handleTrabajar(prisma, ctx);
      if (handled) return;
    }
    // Check if it's a /perfil edit continuation (step 100+)
    const handled = await handleWorkerTextContinuation(prisma, ctx);
    if (handled) return;
  }

  // /tareas - View available external tasks
  if (text.startsWith("/tareas")) {
    const handled = await handleTareas(prisma, ctx);
    if (handled) return;
  }

  // /perfil - Worker profile editor (shows worker profile with edit buttons)
  // Note: the worker /perfil is different from the old /perfil below
  if (text === "/perfil") {
    const handled = await handleWorkerPerfil(prisma, ctx);
    if (handled) return;
  }

  // --- End worker commands ---

  // Profile commands (legacy)
  if (text === "/start" || text === "perfil") {
    await showProfile(ctx, user, prisma, lng);
    return;
  }

  // /help en DM
  if (text === "/help" || text === "help" || text === "ayuda") {
    await ctx.reply(
      t("dm:dm_help_title", lng) + "\n\n" +
        t("dm:dm_help_perfil", lng) + "\n" +
        t("dm:dm_help_help", lng) + "\n\n" +
        t("dm:dm_help_footer", lng),
      { parse_mode: "Markdown" },
    );
    return;
  }

  // Mensaje natural -> concierge con el primer arbol
  const memberships = await (prisma as any).treeMember.findMany({
    where: { userId: user.id, status: "ACTIVE" },
    include: { tree: { select: { id: true, name: true, icono: true } } },
    take: 1,
  });

  if (memberships.length === 0) {
    await ctx.reply(t("dm:dm_no_trees", lng), { parse_mode: "Markdown" });
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
      await ctx.reply(t("errors:unavailable", lng));
      return;
    }

    const data = (await response.json()) as any;
    const reply: string = data?.reply ?? "";

    if (!reply) {
      await ctx.reply(t("errors:unavailable", lng));
      return;
    }

    await ctx.reply(reply, { parse_mode: "Markdown" });
  } catch (error: any) {
    if (error.name === "AbortError") {
      await ctx.reply(t("errors:agent_thinking", lng));
    } else {
      await ctx.reply(t("errors:unavailable", lng));
    }
  } finally {
    clearTimeout(timeoutId);
    clearInterval(typingInterval);
  }
}

// Show profile

async function showProfile(
  ctx: BotContext,
  user: { id: string; username: string; role: string; skills: string | null; totalXp: number },
  prisma: PrismaClient,
  lng: string,
): Promise<void> {
  // Parse skills from WorkerSkill table
  const workerSkills = await (prisma as any).workerSkill.findMany({
    where: { userId: user.id },
    orderBy: { xp: "desc" as const },
  });
  const skills: Record<string, number> = {};
  for (const ws of workerSkills) {
    skills[ws.skill] = ws.xp;
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
    t("dm:profile_header", lng, { username: user.username, level }),
    "",
    t("dm:profile_xp", lng, { xp: totalXp }),
    "",
    t("dm:profile_skills_title", lng),
    ...(Object.keys(skills).length > 0
      ? Object.entries(skills)
          .sort(([, a], [, b]) => (b as number) - (a as number))
          .slice(0, 5)
          .map(([name, xp]) => `  ${name}: ${xp} XP`)
      : [t("dm:profile_no_skills", lng)]),
    "",
    t("dm:profile_trees_title", lng, { count: memberships.length }),
    ...memberships.map((m: any) => `  ${m.tree.icono} ${m.tree.name}`),
    "",
    t("dm:profile_tasks_title", lng),
    ...(pendingTasks.length > 0
      ? pendingTasks.map((t: any) => `  ${t.title} (${t.status})`)
      : [t("dm:profile_no_tasks", lng)]),
    "",
    t("dm:profile_chat_hint", lng),
  ];

  const keyboard = {
    inline_keyboard: [
      [{ text: t("dm:btn_skills", lng), callback_data: "profile_skills" }],
      [{ text: t("dm:btn_tasks", lng), callback_data: "profile_tasks" }],
      [{ text: t("dm:btn_costs", lng), callback_data: "profile_costs" }],
    ],
  };

  await ctx.reply(lines.join("\n"), {
    parse_mode: "Markdown",
    reply_markup: keyboard,
  });
}

// Inline button handlers

export async function handleProfileCallback(
  prisma: PrismaClient,
  ctx: BotContext,
): Promise<boolean> {
  const data = ctx.callbackQuery?.data;
  if (!data) return false;

  // --- Worker callbacks (delegate to worker.ts) ---
  if (data.startsWith("worker_")) {
    await handleWorkerCallback(prisma, ctx);
    return true;
  }

  const tgUser = ctx.from;
  if (!tgUser) return false;

  const lng = getUserLanguage(ctx);

  // profile_skills
  if (data === "profile_skills") {
    const user = await resolveOrCreateDMUser(prisma, tgUser.id.toString());
    if (!user) {
      await ctx.answerCallbackQuery({ text: t("errors:profile_load_error", lng) });
      return true;
    }

    // Read skills from WorkerSkill table
    const workerSkills = await (prisma as any).workerSkill.findMany({
      where: { userId: user.id },
      orderBy: { xp: "desc" as const },
    });

    if (workerSkills.length === 0) {
      await ctx.reply(t("dm:skills_empty", lng));
    } else {
      const skillLines = [t("dm:skills_title", lng), ""];
      for (const ws of workerSkills) {
        skillLines.push(t("dm:skill_item", lng, { name: ws.skill, xp: String(ws.xp), level: String(ws.level) }));
      }
      await ctx.reply(skillLines.join("\n"), { parse_mode: "Markdown" });
    }

    await ctx.answerCallbackQuery();
    return true;
  }

  // profile_tasks
  if (data === "profile_tasks") {
    const user = await resolveOrCreateDMUser(prisma, tgUser.id.toString());
    if (!user) {
      await ctx.answerCallbackQuery({ text: t("errors:profile_load_error", lng) });
      return true;
    }

    const tasks = await (prisma as any).task.findMany({
      where: { assigneeId: user.id },
      orderBy: { createdAt: "desc" },
      take: 20,
      include: { tree: { select: { name: true, icono: true } } },
    });

    if (tasks.length === 0) {
      await ctx.reply(t("dm:tasks_empty", lng));
    } else {
      const statusEmoji: Record<string, string> = {
        PENDING: "PENDING",
        ASSIGNED: "ASSIGNED",
        IN_PROGRESS: "IN_PROGRESS",
        EVIDENCE_SUBMITTED: "EVIDENCE_SUBMITTED",
        VERIFIED: "VERIFIED",
        PAID: "PAID",
        DISPUTED: "DISPUTED",
      };

      const taskLines = [t("dm:tasks_title", lng), ""];
      for (const t of tasks) {
        const emoji = statusEmoji[t.status] ?? "?";
        const treeName = t.tree ? `${t.tree.icono} ${t.tree.name}` : "";
        taskLines.push(
          `${emoji} **${t.title}** - ${t.status}`,
          `   ${treeName}${t.budget ? ` | ${t.budget} CLP` : ""}`,
          "",
        );
      }
      await ctx.reply(taskLines.join("\n"), { parse_mode: "Markdown" });
    }

    await ctx.answerCallbackQuery();
    return true;
  }

  // profile_costs
  if (data === "profile_costs") {
    const userId = tgUser.id.toString();
    const costText = await getUserCosts(prisma, userId, lng);
    await ctx.reply(costText, { parse_mode: "Markdown" });
    await ctx.answerCallbackQuery();
    return true;
  }

  // lang:es / lang:en
  if (data === "lang:es" || data === "lang:en") {
    const selectedLng = data === "lang:es" ? "es" : "en";
    const validLanguages = ["es", "en"];
    if (!validLanguages.includes(selectedLng)) {
      await ctx.answerCallbackQuery({ text: t("errors:language_not_supported", selectedLng) });
      return true;
    }

    // Update user language in DB
    await (prisma as any).user.update({
      where: { telegramUserId: BigInt(tgUser.id) },
      data: { language: selectedLng },
    });

    await ctx.answerCallbackQuery();

    // Respond in the chosen language
    const confirmMsg = t("onboarding:language_selected", selectedLng);
    await ctx.reply(confirmMsg, {
      parse_mode: "Markdown",
      reply_markup: { remove_keyboard: true },
    });

    return true;
  }

  return false;
}

// Cost query for DM

async function getUserCosts(
  prisma: PrismaClient,
  telegramUserId: string,
  lng: string,
): Promise<string> {
  const user = await resolveOrCreateDMUser(prisma, telegramUserId);
  if (!user) return t("errors:profile_not_found", lng);

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
    return t("dm:costs_no_membership", lng);
  }

  // Active trees (for fixed cost division)
  const activeTrees = await (prisma as any).treeMember.groupBy({
    by: ["treeId"],
    where: { status: "ACTIVE" },
  });
  const fixedPerTree = totalFixed / (activeTrees.length || 1);

  const lines = [t("dm:costs_title", lng), ""];

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
      `   -> **$${perPerson.toFixed(2)} por persona**`,
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
    lines.push(t("dm:costs_free_period", lng));
  } else {
    lines.push(t("dm:costs_total", lng, { total: totalPersonal.toFixed(2) }));
  }

  lines.push(
    "",
    t("dm:costs_disclaimer", lng),
    t("dm:costs_margin", lng, { margin }),
  );

  return lines.join("\n");
}
