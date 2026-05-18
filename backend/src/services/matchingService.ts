/**
 * Matching Service — ExternalTask worker matching & DM notifications.
 *
 * Receives an ExternalTask, finds available workers with matching skills
 * and compatible location, sends DM via @TrustHelpDeskBot with inline
 * "Yo puedo" button, and records each notification to avoid repeats.
 */

import { prisma } from '../index';

// ── Config ──────────────────────────────────────────────────────────────────

const HELP_DESK_TOKEN = process.env.TRUST_HELPDESK_BOT_TOKEN || '';
const TELEGRAM_API = 'https://api.telegram.org';

// ── Types ───────────────────────────────────────────────────────────────────

interface TaskForMatching {
  id: string;
  treeId: string;
  title: string;
  skills: string[];
  location: string | null;
  locationType: string; // REMOTE | ONSITE | HYBRID
  budget: number;
  currency: string;
}

// ── Telegram helpers ────────────────────────────────────────────────────────

async function sendTelegramDM(
  chatId: number,
  text: string,
  replyMarkup?: any,
): Promise<{ ok: boolean; messageId?: number }> {
  if (!HELP_DESK_TOKEN) {
    console.warn('[matchingService] No TRUST_HELPDESK_BOT_TOKEN — skipping DM');
    return { ok: false };
  }

  try {
    const body: any = {
      chat_id: chatId,
      text,
      parse_mode: 'Markdown',
      disable_web_page_preview: true,
    };
    if (replyMarkup) body.reply_markup = JSON.stringify(replyMarkup);

    const res = await fetch(`${TELEGRAM_API}/bot${HELP_DESK_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error(`[matchingService] Telegram API error ${res.status}: ${errText.slice(0, 200)}`);
      return { ok: false };
    }

    const data: any = await res.json();
    return { ok: true, messageId: data.result?.message_id };
  } catch (err: any) {
    console.error(`[matchingService] sendMessage failed for ${chatId}:`, err.message);
    return { ok: false };
  }
}

// ── Skill matching ──────────────────────────────────────────────────────────

/** Parse comma-separated skills string into lowercase array */
function parseSkills(skillsStr: string | null): string[] {
  if (!skillsStr) return [];
  return skillsStr.split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
}

/** Check if worker has at least 1 skill in common with the task */
function hasSkillMatch(taskSkills: string[], workerSkillsStr: string | null): boolean {
  if (taskSkills.length === 0) return true; // task has no skill requirements → match all
  const wSkills = parseSkills(workerSkillsStr);
  if (wSkills.length === 0) return true; // worker has no skills listed → match all
  return taskSkills.some(ts => wSkills.includes(ts));
}

// ── Location matching ───────────────────────────────────────────────────────

/** Extract city from a location string (first word before comma or dash) */
function extractCity(location: string | null): string | null {
  if (!location) return null;
  const cleaned = location.split(/[,/-]/)[0].trim().toLowerCase();
  return cleaned || null;
}

/** Check if worker's location matches task requirements */
function hasLocationMatch(
  taskLocationType: string,
  taskLocation: string | null,
  workerLocation: string | null,
): boolean {
  // REMOTE or HYBRID: no location filter
  if (taskLocationType !== 'ONSITE') return true;
  // ONSITE but no task location specified: match all
  if (!taskLocation) return true;
  // ONSITE: filter by same city
  const taskCity = extractCity(taskLocation);
  const workerCity = extractCity(workerLocation);
  if (!taskCity || !workerCity) return false;
  return taskCity === workerCity;
}

// ── Public API ──────────────────────────────────────────────────────────────

/**
 * Notify workers with matching skills and compatible location about a
 * new ExternalTask. Sends a DM via @TrustHelpDeskBot with an inline
 * "Yo puedo" button. Records each notification to avoid repeats.
 *
 * @returns number of workers successfully notified
 */
export async function notifyMatchingWorkers(task: TaskForMatching): Promise<number> {
  try {
    const taskSkills: string[] = (Array.isArray(task.skills) ? task.skills : [])
      .map((s: any) => String(s).trim().toLowerCase())
      .filter(Boolean);

    // 1. Query available workers with Telegram
    const workers = await (prisma as any).user.findMany({
      where: {
        availableForHire: true,
        telegramUserId: { not: null },
      },
      select: {
        id: true,
        telegramUserId: true,
        username: true,
        firstName: true,
        skills: true,
        location: true,
      },
    });

    if (workers.length === 0) {
      console.log(`[matchingService] 0 available workers for "${task.title}"`);
      return 0;
    }

    // 2. Filter by skills
    let matched = workers.filter((w: any) => hasSkillMatch(taskSkills, w.skills));

    if (matched.length === 0) {
      console.log(`[matchingService] 0 workers matched skills [${taskSkills.join(',')}] for "${task.title}"`);
      return 0;
    }

    // 3. Filter by location
    matched = matched.filter((w: any) =>
      hasLocationMatch(task.locationType, task.location, w.location),
    );

    if (matched.length === 0) {
      console.log(`[matchingService] 0 workers matched location filter (${task.locationType}: ${task.location})`);
      return 0;
    }

    // 4. Filter out already-notified workers
    const alreadyNotified = await (prisma as any).externalTaskNotification.findMany({
      where: {
        externalTaskId: task.id,
        userId: { in: matched.map((w: any) => w.id) },
      },
      select: { userId: true },
    });
    const notifiedSet = new Set(alreadyNotified.map((n: any) => n.userId));
    matched = matched.filter((w: any) => !notifiedSet.has(w.id));

    if (matched.length === 0) {
      console.log(`[matchingService] All ${alreadyNotified.length} workers already notified for "${task.title}"`);
      return 0;
    }

    // 5. Build message
    const budgetStr = task.budget > 0
      ? `${task.budget.toLocaleString('es-CL')} ${task.currency}`
      : 'Presupuesto no especificado';
    const locationStr = task.locationType === 'ONSITE' && task.location
      ? ` — 📍 ${task.location}`
      : task.locationType === 'HYBRID' && task.location
        ? ` — 🔄 ${task.location}`
        : '';

    const text = [
      `🔔 *Nueva tarea:* ${task.title}`,
      `— ${budgetStr}/hora${locationStr}`,
    ].join('\n');

    const inlineKeyboard = {
      inline_keyboard: [[{
        text: '👁️ Yo puedo',
        callback_data: `candidate:apply:${task.treeId}:${task.id}`,
      }]],
    };

    // 6. Send DMs and record notifications
    let sent = 0;
    for (const w of matched) {
      const result = await sendTelegramDM(Number(w.telegramUserId), text, inlineKeyboard);

      // Record notification regardless of send success (to avoid retry spam)
      try {
        await (prisma as any).externalTaskNotification.create({
          data: {
            externalTaskId: task.id,
            userId: w.id,
            messageId: result.messageId || null,
          },
        });
      } catch (dupErr: any) {
        // Duplicate (unique constraint) — already recorded, skip
      }

      if (result.ok) sent++;
    }

    console.log(
      `[matchingService] Notified ${sent}/${matched.length} workers ` +
      `(skills: [${taskSkills.join(',') || 'any'}], ` +
      `location: ${task.locationType}${task.location ? `=${task.location}` : ''}) ` +
      `for "${task.title}"`,
    );

    return sent;
  } catch (err: any) {
    console.error('[matchingService] Error:', err.message || err);
    return 0;
  }
}
