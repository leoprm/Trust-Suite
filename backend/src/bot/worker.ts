/**
 * Worker commands: /trabajar, /perfil, /tareas
 *
 * DM-only commands for workers to onboard, edit profile, and find tasks.
 * Registered via bot.command() in index.ts. Uses flat session fields.
 */

import { BotContext } from "./types";
import { PrismaClient } from "@prisma/client";

// Types

const VALID_CURRENCIES = ["CLP", "USD", "EUR", "MXN", "ARS"] as const;
type Currency = (typeof VALID_CURRENCIES)[number];

// Helpers

function getUserLanguage(ctx: BotContext): string {
  const code = ctx.from?.language_code;
  if (code === "en") return "en";
  return "es";
}

async function resolveTelegramUser(
  prisma: PrismaClient,
  tgUser: { id: number; username?: string; first_name?: string },
) {
  const telegramId = BigInt(tgUser.id);
  try {
    const existing = await (prisma as any).user.findUnique({
      where: { telegramUserId: telegramId },
      select: {
        id: true, username: true, skills: true,
        availableForHire: true, hourlyRate: true, currency: true, location: true,
      },
    });
    if (existing) return existing;

    if (tgUser.username) {
      const byUsername = await (prisma as any).user.findUnique({
        where: { username: tgUser.username },
        select: {
          id: true, username: true, skills: true,
          availableForHire: true, hourlyRate: true, currency: true, location: true,
        },
      });
      if (byUsername) {
        await (prisma as any).user.update({
          where: { id: byUsername.id },
          data: { telegramUserId: telegramId },
        });
        return byUsername;
      }
    }

    return await (prisma as any).user.create({
      data: {
        username: tgUser.username || `tg_${tgUser.id}`,
        firstName: tgUser.first_name,
        telegramUserId: telegramId,
        role: "USER",
      },
      select: {
        id: true, username: true, skills: true,
        availableForHire: true, hourlyRate: true, currency: true, location: true,
      },
    });
  } catch {
    return null;
  }
}

// /trabajar - start onboarding

export async function startWorkerOnboarding(
  prisma: PrismaClient,
  ctx: BotContext,
): Promise<void> {
  const lng = getUserLanguage(ctx);
  ctx.session.workerOnboardingStep = "hourlyRate";
  await ctx.reply(hWK("step_rate", lng), {
    parse_mode: "Markdown",
    reply_markup: { force_reply: true, input_field_placeholder: hWK("rate_placeholder", lng) },
  });
}

// /trabajar - handle multi-step text responses

export async function handleWorkerOnboardingResponse(
  prisma: PrismaClient,
  ctx: BotContext,
): Promise<void> {
  const msg = ctx.message;
  if (!msg || !("text" in msg) || !msg.text) return;

  const text = msg.text.trim();
  const lng = getUserLanguage(ctx);
  const step = ctx.session.workerOnboardingStep;

  if (!step) return;

  if (text === "/cancelar" || text === "/cancel") {
    ctx.session.workerOnboardingStep = undefined;
    ctx.session.workerSkills = undefined;
    ctx.session.workerHourlyRate = undefined;
    ctx.session.workerCurrency = undefined;
    ctx.session.workerLocation = undefined;
    await ctx.reply(hWK("cancelled", lng), { parse_mode: "Markdown" });
    return;
  }

  switch (step) {
    case "hourlyRate": {
      const rate = parseInt(text, 10);
      if (isNaN(rate) || rate <= 0) {
        await ctx.reply(hWK("rate_invalid", lng), {
          reply_markup: { force_reply: true, input_field_placeholder: hWK("rate_placeholder", lng) },
        });
        return;
      }
      ctx.session.workerHourlyRate = rate;
      ctx.session.workerOnboardingStep = "currency";
      const keyboard = {
        inline_keyboard: [
          VALID_CURRENCIES.map((c) => ({ text: c, callback_data: `worker_currency:${c}` })),
        ],
      };
      await ctx.reply(hWK("step_currency", lng), {
        parse_mode: "Markdown",
        reply_markup: keyboard,
      });
      return;
    }
    case "currency": {
      await ctx.reply(hWK("step_currency_text_prompt", lng), { parse_mode: "Markdown" });
      return;
    }
    case "location": {
      if (!text || text.length < 2) {
        await ctx.reply(hWK("location_invalid", lng), {
          reply_markup: { force_reply: true, input_field_placeholder: hWK("location_placeholder", lng) },
        });
        return;
      }
      ctx.session.workerLocation = text;
      ctx.session.workerOnboardingStep = "confirm";
      const confirmMsg = hWK("confirm", lng, {
        rate: String(ctx.session.workerHourlyRate || 0),
        currency: ctx.session.workerCurrency || "CLP",
        location: ctx.session.workerLocation || "",
      });
      const keyboard = {
        inline_keyboard: [[
          { text: hWK("btn_confirm", lng), callback_data: "worker_confirm:yes" },
          { text: hWK("btn_cancel", lng), callback_data: "worker_confirm:no" },
        ]],
      };
      await ctx.reply(confirmMsg, { parse_mode: "Markdown", reply_markup: keyboard });
      return;
    }
  }
}

// /trabajar - currency callback

export async function handleWorkerCurrencyCallback(
  prisma: PrismaClient,
  ctx: BotContext,
  currency: string,
): Promise<void> {
  const lng = getUserLanguage(ctx);
  if (!VALID_CURRENCIES.includes(currency as Currency)) {
    await ctx.answerCallbackQuery({ text: hWK("currency_invalid", lng) });
    return;
  }
  ctx.session.workerCurrency = currency;
  ctx.session.workerOnboardingStep = "location";
  await ctx.answerCallbackQuery();
  await ctx.editMessageText(
    hWK("currency_selected", lng, { currency }) + "\n\n" + hWK("step_location", lng),
    { parse_mode: "Markdown" },
  );
}

// /trabajar - confirm/cancel callback

export async function handleWorkerConfirmCallback(
  prisma: PrismaClient,
  ctx: BotContext,
  choice: string,
): Promise<void> {
  const lng = getUserLanguage(ctx);
  const tgUser = ctx.from;
  if (!tgUser) return;

  if (choice === "no") {
    ctx.session.workerOnboardingStep = undefined;
    ctx.session.workerSkills = undefined;
    ctx.session.workerHourlyRate = undefined;
    ctx.session.workerCurrency = undefined;
    ctx.session.workerLocation = undefined;
    await ctx.answerCallbackQuery();
    await ctx.editMessageText(hWK("cancelled", lng), { parse_mode: "Markdown" });
    return;
  }

  if (choice !== "yes") return;

  await (prisma as any).user.update({
    where: { telegramUserId: BigInt(tgUser.id) },
    data: {
      skills: ctx.session.workerSkills,
      hourlyRate: ctx.session.workerHourlyRate,
      currency: ctx.session.workerCurrency || "CLP",
      location: ctx.session.workerLocation,
      availableForHire: true,
    },
  });

  ctx.session.workerOnboardingStep = undefined;
  ctx.session.workerSkills = undefined;
  ctx.session.workerHourlyRate = undefined;
  ctx.session.workerCurrency = undefined;
  ctx.session.workerLocation = undefined;

  await ctx.answerCallbackQuery({ text: hWK("saved", lng) });
  await ctx.editMessageText(hWK("onboarding_complete", lng), { parse_mode: "Markdown" });
}

// /perfil - show worker profile with edit buttons

export async function showWorkerProfile(
  prisma: PrismaClient,
  ctx: BotContext,
): Promise<void> {
  const lng = getUserLanguage(ctx);
  const tgUser = ctx.from;
  if (!tgUser) { await ctx.reply(hWK("error_not_identified", lng)); return; }

  const user = await resolveTelegramUser(prisma, tgUser);
  if (!user) { await ctx.reply(hWK("error_profile", lng)); return; }

  const isHired = user.availableForHire;
  const skillsList = user.skills || "---";
  const rate = user.hourlyRate ? `${user.hourlyRate} ${user.currency || "CLP"}` : "---";
  const loc = user.location || "---";
  const currency = user.currency || "CLP";

  const msgText = hWK("profile_header", lng, {
    skills: skillsList, rate, currency, location: loc,
    status: isHired ? hWK("status_active", lng) : hWK("status_inactive", lng),
  });

  const keyboard = {
    inline_keyboard: [
      [{ text: hWK("edit_skills", lng), callback_data: "worker_edit:skills" }],
      [{ text: hWK("edit_rate", lng), callback_data: "worker_edit:rate" }],
      [{ text: hWK("edit_currency", lng), callback_data: "worker_edit:currency" }],
      [{ text: hWK("edit_location", lng), callback_data: "worker_edit:location" }],
      [{ text: isHired ? hWK("btn_stop_working", lng) : hWK("btn_start_working", lng),
         callback_data: isHired ? "worker_toggle:off" : "worker_toggle:on" }],
    ],
  };

  await ctx.reply(msgText, { parse_mode: "Markdown", reply_markup: keyboard });
}

// /perfil - edit callback

export async function handleWorkerEditCallback(
  prisma: PrismaClient,
  ctx: BotContext,
  action: string,
): Promise<void> {
  const lng = getUserLanguage(ctx);

  switch (action) {
    case "skills":
      ctx.session.workerEditField = "skills";
      await ctx.answerCallbackQuery();
      await ctx.editMessageText(hWK("edit_skills_prompt", lng), { parse_mode: "Markdown" });
      return;
    case "rate":
      ctx.session.workerEditField = "rate";
      await ctx.answerCallbackQuery();
      await ctx.editMessageText(hWK("edit_rate_prompt", lng), { parse_mode: "Markdown" });
      return;
    case "currency": {
      ctx.session.workerEditField = undefined; // handled via inline keyboard
      const currKeyboard = {
        inline_keyboard: [VALID_CURRENCIES.map((c) => ({
          text: c, callback_data: `worker_edit_currency:${c}`,
        }))],
      };
      await ctx.answerCallbackQuery();
      await ctx.editMessageText(hWK("step_currency", lng), { reply_markup: currKeyboard });
      return;
    }
    case "location":
      ctx.session.workerEditField = "location";
      await ctx.answerCallbackQuery();
      await ctx.editMessageText(hWK("edit_location_prompt", lng), { parse_mode: "Markdown" });
      return;
    default:
      return;
  }
}

// /perfil - edit response (text input after edit field selected)

export async function handleWorkerEditResponse(
  prisma: PrismaClient,
  ctx: BotContext,
): Promise<boolean> {
  const field = ctx.session.workerEditField;
  if (!field) return false;

  const msg = ctx.message;
  if (!msg || !("text" in msg) || !msg.text) return false;

  const text = msg.text.trim();
  const lng = getUserLanguage(ctx);
  const tgUser = ctx.from;
  if (!tgUser) return false;

  if (text === "/cancelar" || text === "/cancel") {
    ctx.session.workerEditField = undefined;
    await ctx.reply(hWK("cancelled", lng));
    return true;
  }

  switch (field) {
    case "skills": {
      if (!text || text.length < 2) { await ctx.reply(hWK("skills_invalid", lng)); return true; }
      await (prisma as any).user.update({ where: { telegramUserId: BigInt(tgUser.id) }, data: { skills: text } });
      ctx.session.workerEditField = undefined;
      await ctx.reply(hWK("profile_updated", lng), { parse_mode: "Markdown" });
      return true;
    }
    case "rate": {
      const rate = parseInt(text, 10);
      if (isNaN(rate) || rate <= 0) { await ctx.reply(hWK("rate_invalid", lng)); return true; }
      await (prisma as any).user.update({ where: { telegramUserId: BigInt(tgUser.id) }, data: { hourlyRate: rate } });
      ctx.session.workerEditField = undefined;
      await ctx.reply(hWK("profile_updated", lng), { parse_mode: "Markdown" });
      return true;
    }
    case "location": {
      if (!text || text.length < 2) { await ctx.reply(hWK("location_invalid", lng)); return true; }
      await (prisma as any).user.update({ where: { telegramUserId: BigInt(tgUser.id) }, data: { location: text } });
      ctx.session.workerEditField = undefined;
      await ctx.reply(hWK("profile_updated", lng), { parse_mode: "Markdown" });
      return true;
    }
  }
  return false;
}

// /perfil - edit currency callback

export async function handleWorkerEditCurrencyCallback(
  prisma: PrismaClient,
  ctx: BotContext,
  currency: string,
): Promise<void> {
  const lng = getUserLanguage(ctx);
  const tgUser = ctx.from;
  if (!tgUser) return;

  if (!VALID_CURRENCIES.includes(currency as Currency)) {
    await ctx.answerCallbackQuery({ text: hWK("currency_invalid", lng) });
    return;
  }

  await (prisma as any).user.update({
    where: { telegramUserId: BigInt(tgUser.id) },
    data: { currency },
  });
  ctx.session.workerEditField = undefined;
  await ctx.answerCallbackQuery({ text: hWK("currency_saved", lng, { currency }) });
  await ctx.editMessageText(hWK("profile_updated", lng), { parse_mode: "Markdown" });
}

// /tareas - show available tasks

export async function showAvailableTasks(
  prisma: PrismaClient,
  ctx: BotContext,
): Promise<void> {
  const lng = getUserLanguage(ctx);
  const tgUser = ctx.from;
  if (!tgUser) { await ctx.reply(hWK("error_not_identified", lng)); return; }

  const user = await resolveTelegramUser(prisma, tgUser);
  if (!user) { await ctx.reply(hWK("error_profile", lng)); return; }

  let skills: string[] = [];
  try {
    if (user.skills) skills = user.skills.split(",").map((s: string) => s.trim().toLowerCase()).filter(Boolean);
  } catch { /* empty */ }

  const tasks = await (prisma as any).externalTask.findMany({
    where: { status: "OPEN" },
    include: { tree: { select: { name: true, icono: true } } },
    orderBy: { createdAt: "desc" },
    take: 20,
  });

  const filtered = skills.length > 0
    ? tasks.filter((t: any) => {
        const taskSkills: string[] = Array.isArray(t.skills) ? t.skills : [];
        if (taskSkills.length === 0) return true;
        return taskSkills.some((sk: string) => skills.includes(sk.toLowerCase()));
      })
    : tasks;

  if (filtered.length === 0) {
    await ctx.reply(hWK("no_tasks", lng), { parse_mode: "Markdown" });
    return;
  }

  const buttons = filtered.map((t: any) => {
    const treeName = t.tree ? `${t.tree.icono} ${t.tree.name}` : "tree";
    const budget = t.budget ? `${t.budget} ${t.currency || "CLP"}` : "---";
    const label = `${t.title} | ${budget} | ${treeName}`.slice(0, 60);
    return [{ text: label, callback_data: `external_claim:${t.id}` }];
  });

  const header = hWK("tasks_header", lng, { count: String(filtered.length) });
  await ctx.reply(header, { parse_mode: "Markdown", reply_markup: { inline_keyboard: buttons } });
}

// external_claim:{taskId}

export async function handleExternalClaim(
  prisma: PrismaClient,
  ctx: BotContext,
  taskId: string,
): Promise<void> {
  const lng = getUserLanguage(ctx);
  const tgUser = ctx.from;
  if (!tgUser) return;

  const user = await resolveTelegramUser(prisma, tgUser);
  if (!user) { await ctx.answerCallbackQuery({ text: hWK("error_profile", lng) }); return; }

  const task = await (prisma as any).externalTask.findUnique({
    where: { id: taskId },
    select: { id: true, status: true, title: true },
  });

  if (!task || task.status !== "OPEN") {
    await ctx.answerCallbackQuery({ text: hWK("task_unavailable", lng) });
    return;
  }

  await (prisma as any).externalTask.update({
    where: { id: taskId },
    data: { status: "CLAIMED", workerId: user.id },
  });

  await ctx.answerCallbackQuery({ text: hWK("task_claimed", lng, { title: task.title }) });
  await ctx.editMessageText(
    hWK("task_claimed_msg", lng, { title: task.title }),
    { parse_mode: "Markdown" },
  );
}

// external_deliver:{taskId} - sets workerDeliverTaskId and asks for upload

export async function handleExternalDeliver(
  prisma: PrismaClient,
  ctx: BotContext,
  taskId: string,
): Promise<void> {
  const lng = getUserLanguage(ctx);
  const task = await (prisma as any).externalTask.findUnique({
    where: { id: taskId },
    select: { id: true, status: true, title: true },
  });

  if (!task || task.status !== "CLAIMED") {
    await ctx.answerCallbackQuery({ text: hWK("task_not_claimed", lng) });
    return;
  }

  ctx.session.workerDeliverTaskId = taskId;
  await ctx.answerCallbackQuery();
  await ctx.editMessageText(
    hWK("deliver_prompt", lng, { title: task.title }),
    { parse_mode: "Markdown" },
  );
}

// handleWorkerDeliveryUpload - saves file and updates task

export async function handleWorkerDeliveryUpload(
  prisma: PrismaClient,
  ctx: BotContext,
  fileId: string,
  fileName: string,
): Promise<void> {
  const lng = getUserLanguage(ctx);
  const taskId = ctx.session.workerDeliverTaskId;
  if (!taskId) return;

  const tgUser = ctx.from;
  if (!tgUser) return;

  await (prisma as any).externalTask.update({
    where: { id: taskId },
    data: {
      status: "DELIVERED",
      deliverableUrl: `tg://file/${fileId}?name=${encodeURIComponent(fileName)}`,
    },
  });

  ctx.session.workerDeliverTaskId = undefined;
  await ctx.reply(hWK("deliver_success", lng), { parse_mode: "Markdown" });
}

// /hilt - help message (returns string)

export function workerHelpMessage(lng: string): string {
  return [
    hWK("help_title", lng),
    "",
    "/trabajar - " + hWK("help_trabajar", lng),
    "/perfil - " + hWK("help_perfil", lng),
    "/tareas - " + hWK("help_tareas", lng),
    "/cancelar - " + hWK("help_cancel", lng),
    "",
    hWK("help_footer", lng),
  ].join("\n");
}

// Worker toggle callback (for availableForHire toggle in /perfil)

export async function handleWorkerToggleCallback(
  prisma: PrismaClient,
  ctx: BotContext,
): Promise<boolean> {
  const data = ctx.callbackQuery?.data;
  if (!data || !data.startsWith("worker_toggle:")) return false;

  const lng = getUserLanguage(ctx);
  const tgUser = ctx.from;
  if (!tgUser) return false;

  const on = data === "worker_toggle:on";
  await (prisma as any).user.update({
    where: { telegramUserId: BigInt(tgUser.id) },
    data: { availableForHire: on },
  });

  await ctx.answerCallbackQuery();
  await ctx.editMessageText(
    on ? hWK("now_available", lng) : hWK("now_unavailable", lng),
    { parse_mode: "Markdown" },
  );
  return true;
}

// i18n strings

const STRINGS: Record<string, Record<string, string>> = {
  step_skills:      { es: "Cuales son tus habilidades?\n\nEscribelas separadas por comas.\nEjemplo: diseno, frontend, react, figma",            en: "What are your skills?\n\nWrite them separated by commas.\nExample: design, frontend, react, figma" },
  skills_placeholder: { es: "diseno, frontend, react...", en: "design, frontend, react..." },
  skills_invalid:   { es: "Por favor ingresa al menos 2 caracteres para tus habilidades.", en: "Please enter at least 2 characters for your skills." },
  step_rate:        { es: "Cual es tu tarifa por hora?\n\nIngresa un numero (sin simbolos).\nEjemplo: 15000", en: "What's your hourly rate?\n\nEnter a number (no symbols).\nExample: 25" },
  rate_placeholder: { es: "15000", en: "25" },
  rate_invalid:     { es: "Ingresa un numero valido mayor que 0.", en: "Enter a valid number greater than 0." },
  step_currency:    { es: "Elige tu moneda:", en: "Choose your currency:" },
  step_currency_text_prompt: { es: "Por favor elige una moneda usando los botones de arriba.", en: "Please choose a currency using the buttons above." },
  currency_selected:{ es: "Moneda: *{{currency}}*", en: "Currency: *{{currency}}*" },
  currency_invalid: { es: "Moneda no valida.", en: "Invalid currency." },
  step_location:    { es: "Donde estas ubicado?\n\nEjemplo: Santiago, Chile", en: "Where are you located?\n\nExample: New York, USA" },
  location_placeholder: { es: "Santiago, Chile", en: "New York, USA" },
  location_invalid: { es: "Por favor ingresa al menos 2 caracteres para tu ubicacion.", en: "Please enter at least 2 characters for your location." },
  confirm:          { es: "Confirma tus datos:\n\nSkills: {{skills}}\nTarifa: {{rate}} {{currency}}/hr\nUbicacion: {{location}}\n\nTodo correcto?", en: "Confirm your details:\n\nSkills: {{skills}}\nRate: {{rate}} {{currency}}/hr\nLocation: {{location}}\n\nEverything correct?" },
  btn_confirm:      { es: "Confirmar", en: "Confirm" },
  btn_cancel:       { es: "Cancelar", en: "Cancel" },
  cancelled:        { es: "Operacion cancelada.", en: "Operation cancelled." },
  saved:            { es: "Perfil guardado. Ya estas disponible para trabajar!", en: "Profile saved. You're now available for hire!" },
  onboarding_complete: { es: "Listo! Ya estas registrado como worker.\n\nUsa /tareas para ver trabajos disponibles.\nUsa /perfil para editar tu informacion.", en: "Done! You're now registered as a worker.\n\nUse /tareas to see available jobs.\nUse /perfil to edit your info." },
  profile_header:   { es: "Perfil de Worker\n\nSkills: {{skills}}\nTarifa: {{rate}}\nMoneda: {{currency}}\nUbicacion: {{location}}\nEstado: {{status}}", en: "Worker Profile\n\nSkills: {{skills}}\nRate: {{rate}}\nCurrency: {{currency}}\nLocation: {{location}}\nStatus: {{status}}" },
  status_active:    { es: "Disponible", en: "Available" },
  status_inactive:  { es: "No disponible", en: "Unavailable" },
  edit_skills:      { es: "Editar Skills", en: "Edit Skills" },
  edit_rate:        { es: "Editar Tarifa", en: "Edit Rate" },
  edit_currency:    { es: "Editar Moneda", en: "Edit Currency" },
  edit_location:    { es: "Editar Ubicacion", en: "Edit Location" },
  btn_stop_working: { es: "Dejar de trabajar", en: "Stop working" },
  btn_start_working:{ es: "Activar disponibilidad", en: "Set available" },
  edit_skills_prompt:  { es: "Ingresa tus nuevas habilidades (separadas por comas):", en: "Enter your new skills (comma-separated):" },
  edit_rate_prompt:    { es: "Ingresa tu nueva tarifa por hora (numero):", en: "Enter your new hourly rate (number):" },
  edit_location_prompt:{ es: "Ingresa tu nueva ubicacion:", en: "Enter your new location:" },
  currency_saved:   { es: "Moneda actualizada a {{currency}}.", en: "Currency updated to {{currency}}." },
  profile_updated:  { es: "Perfil actualizado. Usa /perfil para ver los cambios.", en: "Profile updated. Use /perfil to see changes." },
  now_available:    { es: "Ahora estas disponible para trabajar. Usa /tareas para buscar trabajos.", en: "You're now available for hire. Use /tareas to find jobs." },
  now_unavailable:  { es: "Ya no estas disponible para trabajar.", en: "You're no longer available for hire." },
  tasks_header:     { es: "Tareas disponibles ({{count}}):\n\nSelecciona una para reclamar:", en: "Available tasks ({{count}}):\n\nSelect one to claim:" },
  no_tasks:         { es: "No hay tareas disponibles que coincidan con tus skills.\n\nRevisa mas tarde o actualiza tus skills con /perfil.", en: "No available tasks matching your skills.\n\nCheck back later or update your skills with /perfil." },
  task_unavailable: { es: "Esta tarea ya no esta disponible.", en: "This task is no longer available." },
  task_claimed:     { es: "Reclamaste: {{title}}", en: "Claimed: {{title}}" },
  task_claimed_msg: { es: "Tarea reclamada: {{title}}\n\nRevisa los detalles desde la app web.", en: "Task claimed: {{title}}\n\nCheck details from the web app." },
  task_not_claimed: { es: "Esta tarea no esta en estado CLAIMED o no te pertenece.", en: "This task is not in CLAIMED status or doesn't belong to you." },
  deliver_prompt:   { es: "Sube un archivo (documento o foto) para entregar la tarea: {{title}}", en: "Upload a file (document or photo) to deliver: {{title}}" },
  deliver_success:  { es: "Entregable subido. La tarea fue marcada como DELIVERED.", en: "Deliverable uploaded. Task marked as DELIVERED." },
  error_profile:    { es: "No se pudo cargar tu perfil. Intenta /start primero.", en: "Could not load your profile. Try /start first." },
  error_not_identified: { es: "No se pudo identificar tu cuenta de Telegram.", en: "Could not identify your Telegram account." },
  help_title:       { es: "Comandos Worker", en: "Worker Commands" },
  help_trabajar:    { es: "Registrarte como worker (skills, tarifa, ubicacion)", en: "Register as a worker (skills, rate, location)" },
  help_perfil:      { es: "Ver y editar tu perfil de worker", en: "View and edit your worker profile" },
  help_tareas:      { es: "Ver tareas disponibles para reclamar", en: "View available tasks to claim" },
  help_cancel:      { es: "Cancelar el flujo actual", en: "Cancel the current flow" },
  help_footer:      { es: "Estos comandos funcionan en chat privado.", en: "These commands work in private chat." },
};

function hWK(key: string, lng: string, vars?: Record<string, string>): string {
  const entry = STRINGS[key];
  if (!entry) return key;
  let text = entry[lng] ?? entry["es"] ?? key;
  if (vars) {
    for (const [k, v] of Object.entries(vars)) {
      text = text.replace(`{{${k}}}`, v);
    }
  }
  return text;
}

// Unified worker callback router (used by index.ts callback handler)

export async function handleWorkerCallback(
  prisma: PrismaClient,
  ctx: BotContext,
): Promise<void> {
  const data = ctx.callbackQuery?.data;
  if (!data) return;

  // worker_currency:CODE (onboarding)
  if (data.startsWith("worker_currency:")) {
    const currency = data.slice("worker_currency:".length);
    await handleWorkerCurrencyCallback(prisma, ctx, currency);
    return;
  }

  // worker_confirm:yes|no (onboarding)
  if (data.startsWith("worker_confirm:")) {
    const choice = data.slice("worker_confirm:".length);
    await handleWorkerConfirmCallback(prisma, ctx, choice);
    return;
  }

  // worker_edit:FIELD (/perfil)
  if (data.startsWith("worker_edit:")) {
    const action = data.slice("worker_edit:".length);
    await handleWorkerEditCallback(prisma, ctx, action);
    return;
  }

  // worker_edit_currency:CODE (/perfil edit)
  if (data.startsWith("worker_edit_currency:")) {
    const currency = data.slice("worker_edit_currency:".length);
    await handleWorkerEditCurrencyCallback(prisma, ctx, currency);
    return;
  }

  // worker_toggle:on|off (/perfil toggle)
  if (data.startsWith("worker_toggle:")) {
    await handleWorkerToggleCallback(prisma, ctx);
    return;
  }

  // worker_noop
  if (data === "worker_noop") {
    await ctx.answerCallbackQuery();
    return;
  }
}

// Also route external_* callbacks (for when index.ts delegates to us)

export async function handleExternalCallback(
  prisma: PrismaClient,
  ctx: BotContext,
): Promise<boolean> {
  const data = ctx.callbackQuery?.data;
  if (!data) return false;

  if (data.startsWith("external_claim:")) {
    const taskId = data.slice("external_claim:".length);
    await handleExternalClaim(prisma, ctx, taskId);
    return true;
  }

  if (data.startsWith("external_deliver:")) {
    const taskId = data.slice("external_deliver:".length);
    await handleExternalDeliver(prisma, ctx, taskId);
    return true;
  }

  return false;
}

// ── Re-exports for backward compat with index.ts ──
// These are aliased to the new function names used by index.ts

export async function handleTrabajar(prisma: PrismaClient, ctx: BotContext): Promise<boolean> {
  await startWorkerOnboarding(prisma, ctx);
  return true;
}

export async function handlePerfil(prisma: PrismaClient, ctx: BotContext): Promise<boolean> {
  await showWorkerProfile(prisma, ctx);
  return true;
}

export async function handleTareas(prisma: PrismaClient, ctx: BotContext): Promise<boolean> {
  await showAvailableTasks(prisma, ctx);
  return true;
}

// handleWorkerTextContinuation is the same as handleWorkerEditResponse
export { handleWorkerEditResponse as handleWorkerTextContinuation };
