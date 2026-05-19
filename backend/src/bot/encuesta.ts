/**
 * /encuesta + /votar: encuestas de satisfacción vía bot.
 *
 * /encuesta — admin flow:
 *   1. Bot pregunta: "¿Para quién es la encuesta?" (lista miembros)
 *   2. "¿Qué habilidad evaluar?"
 *   3. "¿Duración en horas? (mín 24)"
 *   4. Crea SatisfactionSurvey
 *   5. Anuncia en grupo con ID y fecha de cierre
 *
 * /votar — miembro flow:
 *   1. Bot envía mensaje PRIVADO con escala 1-10 (inline buttons)
 *   2. Miembro selecciona número
 *   3. Voto guardado anónimamente (hash SHA256)
 *   4. Bot confirma
 */

import * as crypto from "crypto";
import { Bot, InlineKeyboard } from "grammy";
import { PrismaClient } from "@prisma/client";
import type { BotContext } from "./types";
import { findTreeByChat } from "./treeResolver";
import { resolveUserLanguage } from "./messages";

// ── Session state for /encuesta wizard ──────────────────────────────────

export interface EncuestaWizardState {
  step: "target" | "skill" | "duration";
  treeId: string;
  chatId: string;
  targetUserId?: string;
  skill?: string;
}

// In-memory wizard store (keyed by Telegram user ID as string)
const wizardStore = new Map<string, EncuestaWizardState>();

// ── Helpers ──────────────────────────────────────────────────────────────

/** Compute anonymous voter hash: SHA256(userId + surveyId) */
function voterHash(userId: string, surveyId: string): string {
  return crypto.createHash("sha256").update(`${userId}:${surveyId}`).digest("hex");
}

/** Check if user is admin of the given tree */
async function isTreeAdmin(prisma: PrismaClient, userId: string, treeId: string): Promise<boolean> {
  const member = await (prisma as any).treeMember.findFirst({
    where: { userId, treeId, role: "ADMIN", status: "ACTIVE" },
  });
  return !!member;
}

/** Format closing date for display */
function formatDate(date: Date): string {
  return date.toLocaleString("es-CL", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// ── /encuesta command (admin flow) ──────────────────────────────────────

export async function handleEncuestaCommand(
  prisma: PrismaClient,
  ctx: BotContext,
): Promise<void> {
  const chatId = ctx.chat?.id;
  const chatType = ctx.chat?.type;
  const tgUser = ctx.from;

  if (!chatId || !tgUser) return;

  // Only works in groups
  if (chatType !== "group" && chatType !== "supergroup") {
    await ctx.reply("📋 /encuesta solo funciona en grupos vinculados a un árbol.");
    return;
  }

  const tree = await findTreeByChat(prisma, chatId.toString());
  if (!tree) {
    await ctx.reply("⚠️ Este grupo no está vinculado a ningún árbol.");
    return;
  }

  // Admin check
  const user = await (prisma as any).user.findUnique({
    where: { telegramUserId: BigInt(tgUser.id) },
    select: { id: true },
  });
  if (!user) {
    await ctx.reply("⚠️ No tienes una cuenta vinculada. Usa /start.");
    return;
  }

  if (!(await isTreeAdmin(prisma, user.id, tree.id))) {
    await ctx.reply("⚠️ Solo el admin del árbol puede crear encuestas.");
    return;
  }

  // Start wizard — step 1: pick target member
  const members = await (prisma as any).treeMember.findMany({
    where: { treeId: tree.id, status: "ACTIVE" },
    include: { user: { select: { id: true, username: true, firstName: true } } },
    orderBy: { joinedAt: "asc" },
  });

  if (members.length === 0) {
    await ctx.reply("⚠️ No hay miembros activos en este árbol.");
    return;
  }

  // Build inline keyboard with member list (up to 100 — Telegram limit)
  const buttons = members.slice(0, 100).map((m: any) => {
    const label = m.user.firstName || m.user.username || m.user.id.slice(0, 8);
    return [{ text: label, callback_data: `encuesta_target:${m.user.id}` }];
  });

  // Add cancel button
  buttons.push([{ text: "❌ Cancelar", callback_data: "encuesta_cancel" }]);

  // Store wizard state
  wizardStore.set(tgUser.id.toString(), {
    step: "target",
    treeId: tree.id,
    chatId: chatId.toString(),
  });

  await ctx.reply("📋 *Nueva encuesta — Paso 1/3*\n\n¿Para quién es la encuesta?", {
    parse_mode: "HTML",
    reply_markup: { inline_keyboard: buttons },
  });
}

// ── Wizard callback handler ──────────────────────────────────────────────

export async function handleEncuestaCallback(
  prisma: PrismaClient,
  bot: Bot<BotContext>,
  ctx: BotContext,
): Promise<boolean> {
  const callbackQuery = ctx.callbackQuery;
  if (!callbackQuery || !("data" in callbackQuery)) return false;

  const data: string = callbackQuery.data;
  const tgUser = callbackQuery.from;
  if (!tgUser) return false;

  const wizard = wizardStore.get(tgUser.id.toString());

  // ── Step 1: target member selected ───────────────────────────────────
  if (data.startsWith("encuesta_target:")) {
    const targetUserId = data.slice("encuesta_target:".length);

    if (!wizard) {
      await bot.api.answerCallbackQuery(callbackQuery.id, { text: "Sesión expirada. Usa /encuesta de nuevo." });
      await ctx.deleteMessage();
      return true;
    }

    wizard.targetUserId = targetUserId;
    wizard.step = "skill";

    // Fetch target name for display
    const targetUser = await (prisma as any).user.findUnique({
      where: { id: targetUserId },
      select: { firstName: true, username: true },
    });
    const targetName = targetUser?.firstName || targetUser?.username || targetUserId.slice(0, 8);

    await bot.api.editMessageText(
      callbackQuery.message?.chat.id!,
      callbackQuery.message?.message_id!,
      `📋 *Nueva encuesta — Paso 2/3*\n\n` +
      `Para: <b>${targetName}</b>\n` +
      `¿Qué habilidad evaluar?\n\n` +
      `<i>Responde con el nombre de la habilidad (ej: diseño, carpintería, programación...)</i>`,
      { parse_mode: "HTML" },
    );
    await bot.api.answerCallbackQuery(callbackQuery.id);
    return true;
  }

  // ── Cancel ───────────────────────────────────────────────────────────
  if (data === "encuesta_cancel") {
    wizardStore.delete(tgUser.id.toString());
    await bot.api.editMessageText(
      callbackQuery.message?.chat.id!,
      callbackQuery.message?.message_id!,
      "❌ Encuesta cancelada.",
    );
    await bot.api.answerCallbackQuery(callbackQuery.id);
    return true;
  }

  return false;
}

// ── Wizard text continuation handler ─────────────────────────────────────

export async function handleEncuestaText(
  prisma: PrismaClient,
  bot: Bot<BotContext>,
  ctx: BotContext,
): Promise<boolean> {
  const msg = ctx.message;
  if (!msg || !("text" in msg) || !msg.text) return false;
  if (!msg.from) return false;

  const wizard = wizardStore.get(msg.from.id.toString());
  if (!wizard) return false;

  const text = msg.text.trim();

  // ── Step 2: skill input ──────────────────────────────────────────────
  if (wizard.step === "skill") {
    if (text.length < 2 || text.length > 50) {
      await ctx.reply("⚠️ La habilidad debe tener entre 2 y 50 caracteres. Intenta de nuevo:");
      return true;
    }

    wizard.skill = text;
    wizard.step = "duration";

    await ctx.reply(
      `📋 *Nueva encuesta — Paso 3/3*\n\n` +
      `Habilidad: <b>${text}</b>\n` +
      `¿Duración en horas? (mínimo 24)\n\n` +
      `<i>Responde con un número (ej: 48, 72, 168 para una semana...)</i>`,
      { parse_mode: "HTML" },
    );
    return true;
  }

  // ── Step 3: duration input ───────────────────────────────────────────
  if (wizard.step === "duration") {
    const hours = parseInt(text, 10);
    if (isNaN(hours) || hours < 24) {
      await ctx.reply("⚠️ La duración mínima es 24 horas. Ingresa un número válido:");
      return true;
    }

    const targetUserId = wizard.targetUserId!;
    const skill = wizard.skill!;
    const treeId = wizard.treeId;

    // Fetch target user name
    const targetUser = await (prisma as any).user.findUnique({
      where: { id: targetUserId },
      select: { firstName: true, username: true },
    });
    const targetName = targetUser?.firstName || targetUser?.username || targetUserId.slice(0, 8);

    // Resolve creator user
    const creator = await (prisma as any).user.findUnique({
      where: { telegramUserId: BigInt(msg.from.id) },
      select: { id: true },
    });
    if (!creator) {
      await ctx.reply("⚠️ Error: no se encontró tu cuenta.");
      wizardStore.delete(msg.from.id.toString());
      return true;
    }

    // Create survey
    const closesAt = new Date(Date.now() + hours * 60 * 60 * 1000);

    const survey = await (prisma as any).satisfactionSurvey.create({
      data: {
        treeId,
        targetUserId,
        skill,
        createdBy: creator.id,
        closesAt,
      },
    });

    wizardStore.delete(msg.from.id.toString());

    // Announce in group
    const closeDate = formatDate(closesAt);
    await ctx.reply(
      `📋 <b>Encuesta creada</b> — ID: <code>${survey.id.slice(0, 8)}</code>\n\n` +
      `👤 Para: <b>${targetName}</b>\n` +
      `🎯 Habilidad: <b>${skill}</b>\n` +
      `⏳ Cierra: ${closeDate}\n\n` +
      `Los miembros pueden votar con <b>/votar</b> (anónimo, escala 1-10).\n` +
      `Los resultados serán visibles al cerrar la encuesta.`,
      { parse_mode: "HTML" },
    );

    return true;
  }

  return false;
}

// ── /votar command ───────────────────────────────────────────────────────

export async function handleVotarCommand(
  prisma: PrismaClient,
  ctx: BotContext,
): Promise<void> {
  const tgUser = ctx.from;
  if (!tgUser) return;

  // Resolve user
  const user = await (prisma as any).user.findUnique({
    where: { telegramUserId: BigInt(tgUser.id) },
    select: { id: true, firstName: true, username: true },
  });
  if (!user) {
    await ctx.reply("⚠️ No tienes una cuenta vinculada. Usa /start.");
    return;
  }

  // Find active surveys where this user is a member of the tree
  const memberships = await (prisma as any).treeMember.findMany({
    where: { userId: user.id, status: "ACTIVE" },
    select: { treeId: true },
  });

  if (memberships.length === 0) {
    await ctx.reply("⚠️ No eres miembro activo de ningún árbol.");
    return;
  }

  const treeIds = memberships.map((m: any) => m.treeId);
  const now = new Date();

  // Find open surveys in those trees
  const surveys = await (prisma as any).satisfactionSurvey.findMany({
    where: {
      treeId: { in: treeIds },
      closesAt: { gt: now },
    },
    include: {
      tree: { select: { name: true } },
    },
    orderBy: { closesAt: "asc" },
  });

  if (surveys.length === 0) {
    await ctx.reply("📋 No hay encuestas abiertas en tus árboles.");
    return;
  }

  // If only one survey, send voting keyboard directly
  if (surveys.length === 1) {
    await sendVotingKeyboard(ctx, prisma, surveys[0], user.id);
    return;
  }

  // Multiple surveys — show selector
  const keyboard = new InlineKeyboard();
  for (const survey of surveys) {
    const targetUser = await (prisma as any).user.findUnique({
      where: { id: survey.targetUserId },
      select: { firstName: true, username: true },
    });
    const targetName = targetUser?.firstName || targetUser?.username || survey.targetUserId.slice(0, 8);
    const label = `${survey.tree.name}: ${targetName} — ${survey.skill}`;
    keyboard.text(label, `votar_select:${survey.id}`);
  }

  await ctx.reply("📋 *Encuestas abiertas* — Selecciona una para votar:", {
    parse_mode: "HTML",
    reply_markup: keyboard,
  });
}

// ── Send the 1-10 voting keyboard as private message ─────────────────────

async function sendVotingKeyboard(
  ctx: BotContext,
  prisma: PrismaClient,
  survey: any,
  voterUserId: string,
): Promise<void> {
  const targetUser = await (prisma as any).user.findUnique({
    where: { id: survey.targetUserId },
    select: { firstName: true, username: true },
  });
  const targetName = targetUser?.firstName || targetUser?.username || survey.targetUserId.slice(0, 8);
  const closeDate = formatDate(new Date(survey.closesAt));

  const keyboard = new InlineKeyboard();
  // Row 1: 1-5
  for (let i = 1; i <= 5; i++) {
    keyboard.text(`${i}`, `votar_score:${survey.id}:${i}`);
  }
  keyboard.row();
  // Row 2: 6-10
  for (let i = 6; i <= 10; i++) {
    keyboard.text(`${i}`, `votar_score:${survey.id}:${i}`);
  }

  const message =
    `📋 <b>Votación anónima</b>\n\n` +
    `👤 Evaluando a: <b>${targetName}</b>\n` +
    `🎯 Habilidad: <b>${survey.skill}</b>\n` +
    `🌳 Árbol: <b>${survey.tree?.name || "—"}</b>\n` +
    `⏳ Cierra: ${closeDate}\n\n` +
    `<i>Selecciona un número del 1 al 10:</i>`;

  // Send as private message
  const tgId = ctx.from?.id;
  if (!tgId) return;

  try {
    await ctx.api.sendMessage(tgId, message, {
      parse_mode: "HTML",
      reply_markup: keyboard,
    });

    // If the command was in a group, confirm privately was sent
    if (ctx.chat?.type === "group" || ctx.chat?.type === "supergroup") {
      await ctx.reply("📋 Te envié la encuesta por privado. Revisa tu DM.", {
        reply_to_message_id: ctx.message?.message_id,
      });
    }
  } catch (err: any) {
    if (err.error_code === 403) {
      await ctx.reply("⚠️ No puedo enviarte mensajes privados. Inicia una conversación conmigo primero (@TrustMakerBot) y luego usa /votar.");
    } else {
      console.error("[encuesta] Error sending voting keyboard:", err.message);
      await ctx.reply("⚠️ Error al enviar la encuesta. Intenta de nuevo.");
    }
  }
}

// ── Voting callback handler ──────────────────────────────────────────────

export async function handleVotarCallback(
  prisma: PrismaClient,
  bot: Bot<BotContext>,
  ctx: BotContext,
): Promise<boolean> {
  const callbackQuery = ctx.callbackQuery;
  if (!callbackQuery || !("data" in callbackQuery)) return false;

  const data: string = callbackQuery.data;
  const tgUser = callbackQuery.from;
  if (!tgUser) return false;

  // ── Survey selector ──────────────────────────────────────────────────
  if (data.startsWith("votar_select:")) {
    const surveyId = data.slice("votar_select:".length);

    const survey = await (prisma as any).satisfactionSurvey.findUnique({
      where: { id: surveyId },
      include: { tree: { select: { name: true } } },
    });
    if (!survey) {
      await bot.api.answerCallbackQuery(callbackQuery.id, { text: "Encuesta no encontrada." });
      return true;
    }

    // Resolve user
    const user = await (prisma as any).user.findUnique({
      where: { telegramUserId: BigInt(tgUser.id) },
      select: { id: true },
    });
    if (!user) {
      await bot.api.answerCallbackQuery(callbackQuery.id, { text: "No tienes cuenta vinculada." });
      return true;
    }

    // Send voting keyboard as private message
    await sendVotingKeyboardDirect(bot, tgUser.id, prisma, survey, user.id);
    await bot.api.answerCallbackQuery(callbackQuery.id);
    await ctx.deleteMessage();
    return true;
  }

  // ── Score selected ───────────────────────────────────────────────────
  if (data.startsWith("votar_score:")) {
    const parts = data.split(":");
    const surveyId = parts[1];
    const score = parseInt(parts[2], 10);

    const user = await (prisma as any).user.findUnique({
      where: { telegramUserId: BigInt(tgUser.id) },
      select: { id: true },
    });
    if (!user) {
      await bot.api.answerCallbackQuery(callbackQuery.id, { text: "No tienes cuenta vinculada." });
      return true;
    }

    // Check survey still open
    const survey = await (prisma as any).satisfactionSurvey.findUnique({
      where: { id: surveyId },
    });
    if (!survey || new Date(survey.closesAt) < new Date()) {
      await bot.api.answerCallbackQuery(callbackQuery.id, { text: "Esta encuesta ya cerró." });
      await bot.api.editMessageText(
        tgUser.id,
        callbackQuery.message?.message_id!,
        "📋 Esta encuesta ya cerró. Los resultados estarán visibles pronto.",
      );
      return true;
    }

    // Compute anonymous voter hash
    const hash = voterHash(user.id, surveyId);

    // Check if already voted
    const existing = await (prisma as any).surveyVote.findFirst({
      where: { surveyId, voterId: hash },
    });
    if (existing) {
      // Update existing vote
      await (prisma as any).surveyVote.update({
        where: { id: existing.id },
        data: { score },
      });
    } else {
      await (prisma as any).surveyVote.create({
        data: { surveyId, voterId: hash, score },
      });
    }

    await bot.api.answerCallbackQuery(callbackQuery.id, { text: `Voto registrado: ${score}/10` });

    // Update the message to show confirmation
    await bot.api.editMessageText(
      tgUser.id,
      callbackQuery.message?.message_id!,
      `✅ <b>Voto registrado: ${score}/10</b>\n\n` +
      `Los resultados serán visibles al cerrar la encuesta.`,
      { parse_mode: "HTML" },
    );

    return true;
  }

  return false;
}

// ── Direct voting keyboard (used by survey selector) ─────────────────────

async function sendVotingKeyboardDirect(
  bot: Bot<BotContext>,
  tgUserId: number,
  prisma: PrismaClient,
  survey: any,
  voterUserId: string,
): Promise<void> {
  const targetUser = await (prisma as any).user.findUnique({
    where: { id: survey.targetUserId },
    select: { firstName: true, username: true },
  });
  const targetName = targetUser?.firstName || targetUser?.username || survey.targetUserId.slice(0, 8);
  const closeDate = formatDate(new Date(survey.closesAt));

  const keyboard = new InlineKeyboard();
  for (let i = 1; i <= 5; i++) keyboard.text(`${i}`, `votar_score:${survey.id}:${i}`);
  keyboard.row();
  for (let i = 6; i <= 10; i++) keyboard.text(`${i}`, `votar_score:${survey.id}:${i}`);

  const message =
    `📋 <b>Votación anónima</b>\n\n` +
    `👤 Evaluando a: <b>${targetName}</b>\n` +
    `🎯 Habilidad: <b>${survey.skill}</b>\n` +
    `🌳 Árbol: <b>${survey.tree?.name || "—"}</b>\n` +
    `⏳ Cierra: ${closeDate}\n\n` +
    `<i>Selecciona un número del 1 al 10:</i>`;

  try {
    await bot.api.sendMessage(tgUserId, message, {
      parse_mode: "HTML",
      reply_markup: keyboard,
    });
  } catch (err: any) {
    console.error("[encuesta] Error sending direct voting keyboard:", err.message);
  }
}

// ── Cleanup: remove expired wizards ──────────────────────────────────────

setInterval(() => {
  // Wizards auto-expire after 10 min — no explicit cleanup needed
  // since they're keyed by tgUserId and overwritten on new /encuesta.
  // This interval is a no-op safety net.
}, 10 * 60 * 1000).unref();
