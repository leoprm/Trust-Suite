/**
 * Hiring Bridge V2 — DB-driven hiring pipeline.
 *
 * Watches tree sandboxes for hiring-request-*.json files with 6 fields,
 * matches candidates against WorkerSkill + SatisfactionScore,
 * sends DMs via @TrustMakerBot with inline Postular/Ignorar buttons,
 * tracks applicants in HiringApplicant table, and at endDate:
 * closes applications, ranks top 3 by 4 factors, saves hiring-result JSON.
 *
 * NUNCA expone la lista de candidatos al árbol. Solo envía requerimientos
 * y guarda el resultado agregado.
 */

import fs from "fs";
import path from "path";

// ── Configuration ──────────────────────────────────────────────────────────

const SANDBOX_BASE =
  process.env.SANDBOX_BASE_DIR || "/home/trustmaker/trees";
const MAIN_BOT_TOKEN =
  process.env.TELEGRAM_BOT_TOKEN || "";
const TELEGRAM_API = "https://api.telegram.org";
const POLL_INTERVAL_MS = 60_000; // Scan every 60 seconds

// ── Types ───────────────────────────────────────────────────────────────────

export interface HiringRequest {
  // 3 minimum thresholds
  minSkillLevel: number;
  minSatisfactionPersonal: number;
  minSatisfactionGrupal: number;
  // 3 additional fields
  skill: string;
  treeId: string;
  startDate: string; // ISO 8601 date (YYYY-MM-DD)
  endDate: string;   // ISO 8601 date (YYYY-MM-DD)
  location: string;  // required, non-empty
}

export interface ApplicantRanking {
  userId: string;
  skillLevel: number;
  satisfactionPersonal: number;
  satisfactionGrupal: number;
  experienceXp: number;
  compositeScore: number;
}

export interface HiringResult {
  status: "fulfilled" | "no_candidates" | "no_applicants" | "error";
  taskId: string;
  treeId: string;
  skill: string;
  totalCandidatesNotified: number;
  totalApplicants: number;
  recommendedTop3: ApplicantRanking[];
  message: string;
}

// ── State ───────────────────────────────────────────────────────────────────

/** Set of "treeId/taskId" keys already processed. */
const processedRequests = new Set<string>();

let watcherInterval: NodeJS.Timeout | null = null;

// lazy import — prisma won't be available at module load if DB isn't ready
let _prisma: any = null;
async function prisma(): Promise<any> {
  if (!_prisma) {
    const mod = await import("../index");
    _prisma = mod.prisma;
  }
  return _prisma;
}

// ── Telegram helper ─────────────────────────────────────────────────────────

async function sendTelegramDM(
  chatId: number,
  text: string,
  replyMarkup?: any,
): Promise<{ ok: boolean; messageId?: number }> {
  if (!MAIN_BOT_TOKEN) {
    console.warn("[hiringBridge] No TELEGRAM_BOT_TOKEN — skipping DM");
    return { ok: false };
  }

  try {
    const body: any = {
      chat_id: chatId,
      text,
      parse_mode: "Markdown",
      disable_web_page_preview: true,
    };
    if (replyMarkup) body.reply_markup = JSON.stringify(replyMarkup);

    const res = await fetch(
      `${TELEGRAM_API}/bot${MAIN_BOT_TOKEN}/sendMessage`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      },
    );

    if (!res.ok) {
      const errText = await res.text();
      console.error(
        `[hiringBridge] Telegram API error ${res.status}: ${errText.slice(0, 200)}`,
      );
      return { ok: false };
    }

    const data: any = await res.json();
    return { ok: true, messageId: data.result?.message_id };
  } catch (err: any) {
    console.error(`[hiringBridge] sendMessage failed for ${chatId}:`, err.message);
    return { ok: false };
  }
}

// ── Sandbox scanning ────────────────────────────────────────────────────────

function scanSandboxes(): { treeId: string; taskId: string; filePath: string }[] {
  const found: { treeId: string; taskId: string; filePath: string }[] = [];

  if (!fs.existsSync(SANDBOX_BASE)) return found;

  const entries = fs.readdirSync(SANDBOX_BASE, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name.startsWith(".")) continue;

    const treeId = entry.name;
    const treeDir = path.join(SANDBOX_BASE, treeId);

    let files: string[];
    try {
      files = fs.readdirSync(treeDir);
    } catch {
      continue;
    }

    for (const file of files) {
      const match = file.match(/^hiring-request-(.+)\.json$/);
      if (!match) continue;

      const taskId = match[1];
      const key = `${treeId}/${taskId}`;
      if (processedRequests.has(key)) continue;

      found.push({ treeId, taskId, filePath: path.join(treeDir, file) });
    }
  }

  return found;
}

/** Validate ISO 8601 date string (YYYY-MM-DD). */
function isValidISODate(s: string): boolean {
  // Must match YYYY-MM-DD exactly
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(s + "T00:00:00Z");
  if (isNaN(d.getTime())) return false;
  // Round-trip check: new Date("2026-02-30") parses to Mar 2
  const [y, m, day] = s.split("-").map(Number);
  return (
    d.getUTCFullYear() === y &&
    d.getUTCMonth() + 1 === m &&
    d.getUTCDate() === day
  );
}

function readRequest(filePath: string): HiringRequest | null {
  try {
    const raw = fs.readFileSync(filePath, "utf-8");
    const data = JSON.parse(raw);

    const minSkillLevel = Number(data.minSkillLevel);
    const minSatisfactionPersonal = Number(data.minSatisfactionPersonal);
    const minSatisfactionGrupal = Number(data.minSatisfactionGrupal);
    const skill = String(data.skill || "").trim();
    const treeId = String(data.treeId || "").trim();
    const startDate = String(data.startDate || "").trim();
    const endDate = String(data.endDate || "").trim();
    const location = String(data.location || "").trim();

    const missing: string[] = [];
    if (isNaN(minSkillLevel)) missing.push("minSkillLevel");
    if (isNaN(minSatisfactionPersonal)) missing.push("minSatisfactionPersonal");
    if (isNaN(minSatisfactionGrupal)) missing.push("minSatisfactionGrupal");
    if (!skill) missing.push("skill");
    if (!treeId) missing.push("treeId");
    if (!startDate) missing.push("startDate");
    else if (!isValidISODate(startDate)) missing.push("startDate (invalid ISO 8601)");
    if (!endDate) missing.push("endDate");
    else if (!isValidISODate(endDate)) missing.push("endDate (invalid ISO 8601)");
    if (!location) missing.push("location");

    if (missing.length > 0) {
      console.error(
        `[hiringBridge] Invalid/missing fields in ${filePath}: ${missing.join(", ")} — ${raw.slice(0, 300)}`,
      );
      return null;
    }

    return {
      minSkillLevel: Math.max(1, Math.min(5, Math.round(minSkillLevel))),
      minSatisfactionPersonal: Math.max(1, Math.min(5, Math.round(minSatisfactionPersonal))),
      minSatisfactionGrupal: Math.max(1, Math.min(5, Math.round(minSatisfactionGrupal))),
      skill: skill.toLowerCase(),
      treeId,
      startDate,
      endDate,
      location,
    };
  } catch (err: any) {
    console.error(`[hiringBridge] Failed to read ${filePath}:`, err.message);
    return null;
  }
}

// ── Candidate matching (DB-driven) ──────────────────────────────────────────

async function findMatchingCandidates(
  request: HiringRequest,
): Promise<
  { userId: string; telegramUserId: number; skillLevel: number; satisfactionPersonal: number; satisfactionGrupal: number; experienceXp: number }[]
> {
  const db = await prisma();
  const skill = request.skill;

  // 1. Find WorkerSkills matching the skill with level >= minSkillLevel
  const workerSkills = await db.workerSkill.findMany({
    where: {
      skill,
      level: { gte: request.minSkillLevel },
      // Also check user is available for hire and has Telegram
      user: {
        availableForHire: true,
        telegramUserId: { not: null },
      },
    },
    select: {
      userId: true,
      level: true,
      xp: true,
      user: {
        select: {
          id: true,
          telegramUserId: true,
        },
      },
    },
  });

  if (workerSkills.length === 0) {
    return [];
  }

  // 2. Filter by satisfaction scores
  const userIds = workerSkills.map((ws: any) => ws.userId);

  const satisfactionScores = await db.satisfactionScore.findMany({
    where: {
      userId: { in: userIds },
      skill,
      avgScore: { gte: request.minSatisfactionPersonal },
    },
    select: {
      userId: true,
      avgScore: true,
      totalSurveys: true,
    },
  });

  const satisfactionMap = new Map<string, { avgScore: number; totalSurveys: number }>();
  for (const ss of satisfactionScores) {
    satisfactionMap.set(ss.userId, { avgScore: ss.avgScore, totalSurveys: ss.totalSurveys });
  }

  // 3. Filter by group satisfaction — check SatisfactionSurvey + SurveyVote
  // A group satisfaction score is the average of SurveyVote scores across all surveys
  // where the user was the target in the given tree
  const surveyVotes = await db.surveyVote.findMany({
    where: {
      survey: {
        targetUserId: { in: userIds },
        treeId: request.treeId,
        skill,
      },
    },
    select: {
      survey: { select: { targetUserId: true } },
      score: true,
    },
  });

  // Compute average group satisfaction per user
  const groupScores = new Map<string, { total: number; count: number }>();
  for (const sv of surveyVotes) {
    const uid = sv.survey.targetUserId;
    if (!groupScores.has(uid)) groupScores.set(uid, { total: 0, count: 0 });
    const acc = groupScores.get(uid)!;
    acc.total += sv.score;
    acc.count += 1;
  }

  // 4. Assemble final list
  const candidates: {
    userId: string;
    telegramUserId: number;
    skillLevel: number;
    satisfactionPersonal: number;
    satisfactionGrupal: number;
    experienceXp: number;
  }[] = [];

  for (const ws of workerSkills) {
    const sat = satisfactionMap.get(ws.userId);
    if (!sat) continue; // didn't meet personal satisfaction minimum

    const grp = groupScores.get(ws.userId);
    const avgGroup = grp && grp.count > 0 ? grp.total / grp.count : 0;
    if (avgGroup < request.minSatisfactionGrupal) continue;

    candidates.push({
      userId: ws.userId,
      telegramUserId: Number(ws.user.telegramUserId),
      skillLevel: ws.level,
      satisfactionPersonal: sat.avgScore,
      satisfactionGrupal: Math.round(avgGroup * 10) / 10,
      experienceXp: ws.xp,
    });
  }

  console.log(
    `[hiringBridge] ${candidates.length}/${workerSkills.length} candidates passed ` +
    `all filters for skill="${skill}" (minSkill=${request.minSkillLevel}, ` +
    `minSatPersonal=${request.minSatisfactionPersonal}, minSatGrupal=${request.minSatisfactionGrupal})`,
  );

  return candidates;
}

// ── DM notification ─────────────────────────────────────────────────────────

async function notifyCandidate(
  candidate: {
    userId: string;
    telegramUserId: number;
  },
  request: HiringRequest,
  taskId: string,
): Promise<boolean> {
  const locationStr = `\n📍 Ubicación: ${request.location}`;

  const text = [
    `📋 *Trabajo disponible:* ${request.skill} en árbol \`${request.treeId}\``,
    `📅 Fechas: ${request.startDate} — ${request.endDate}${locationStr}`,
    "",
    "¿Te interesa postular?",
  ].join("\n");

  const inlineKeyboard = {
    inline_keyboard: [
      [
        { text: "✅ Postular", callback_data: `post_${taskId}` },
        { text: "❌ Ignorar", callback_data: `ignr_${taskId}` },
      ],
    ],
  };

  const result = await sendTelegramDM(
    candidate.telegramUserId,
    text,
    inlineKeyboard,
  );

  if (result.ok) {
    console.log(
      `[hiringBridge] DM sent to user ${candidate.userId} (tg=${candidate.telegramUserId}) for task ${taskId}`,
    );
  }

  return result.ok;
}

// ── Ranking (4 factors) ─────────────────────────────────────────────────────

async function rankApplicants(
  taskId: string,
  treeId: string,
): Promise<{ applicants: { userId: string; status: string }[]; recommendedTop3: ApplicantRanking[] }> {
  const db = await prisma();

  const applicants = await db.hiringApplicant.findMany({
    where: { taskId, status: "APPLIED" },
    select: { userId: true, status: true },
  });

  if (applicants.length === 0) {
    return { applicants: [], recommendedTop3: [] };
  }

  const userIds = applicants.map((a: any) => a.userId);

  // Get WorkerSkills for the task's skill (we need to find which skill the task was for)
  // Look up the skill from the hiring-request file
  const request = await findRequestForTask(treeId, taskId);
  const skill = request?.skill || "";

  // Get WorkerSkill levels
  const workerSkills = await db.workerSkill.findMany({
    where: {
      userId: { in: userIds },
      ...(skill ? { skill } : {}),
    },
    select: { userId: true, level: true, xp: true },
  });

  // Get SatisfactionScores
  const satisfactionScores = await db.satisfactionScore.findMany({
    where: {
      userId: { in: userIds },
      ...(skill ? { skill } : {}),
    },
    select: { userId: true, avgScore: true, totalSurveys: true },
  });

  // Get group satisfaction from SurveyVotes within the tree
  const surveyVotes = await db.surveyVote.findMany({
    where: {
      survey: {
        targetUserId: { in: userIds },
        treeId,
        ...(skill ? { skill } : {}),
      },
    },
    select: {
      survey: { select: { targetUserId: true } },
      score: true,
    },
  });

  // Build maps
  const skillMap = new Map<string, { level: number; xp: number }>();
  for (const ws of workerSkills) {
    skillMap.set(ws.userId, { level: ws.level, xp: ws.xp });
  }

  const satMap = new Map<string, number>();
  for (const ss of satisfactionScores) {
    satMap.set(ss.userId, ss.avgScore);
  }

  const groupMap = new Map<string, number>();
  const groupAcc = new Map<string, { total: number; count: number }>();
  for (const sv of surveyVotes) {
    const uid = sv.survey.targetUserId;
    if (!groupAcc.has(uid)) groupAcc.set(uid, { total: 0, count: 0 });
    const acc = groupAcc.get(uid)!;
    acc.total += sv.score;
    acc.count += 1;
  }
  groupAcc.forEach((acc, uid) => {
    groupMap.set(uid, acc.total / acc.count);
  });

  // Rank: 4-factor composite score
  const rankings: ApplicantRanking[] = userIds.map((userId: string) => {
    const sk = skillMap.get(userId) || { level: 1, xp: 0 };
    const satPersonal = satMap.get(userId) || 0;
    const satGrupal = groupMap.get(userId) || 0;

    // Normalize each factor to 0-1 and weight equally
    const levelNorm = Math.min(1, sk.level / 10);       // level 1-10 → 0-1
    const satPNorm = Math.min(1, satPersonal / 10);       // score 0-10 → 0-1
    const satGNorm = Math.min(1, satGrupal / 10);         // score 0-10 → 0-1
    const xpNorm = Math.min(1, sk.xp / 10000);           // xp 0-10000 → 0-1

    const composite =
      levelNorm * 0.3 +
      satPNorm * 0.3 +
      satGNorm * 0.2 +
      xpNorm * 0.2;

    return {
      userId,
      skillLevel: sk.level,
      satisfactionPersonal: Math.round(satPersonal * 10) / 10,
      satisfactionGrupal: Math.round(satGrupal * 10) / 10,
      experienceXp: sk.xp,
      compositeScore: Math.round(composite * 1000) / 1000,
    };
  });

  // Sort by composite score descending
  rankings.sort((a, b) => b.compositeScore - a.compositeScore);

  const recommendedTop3 = rankings.slice(0, 3);

  return {
    applicants: applicants.map((a: any) => ({ userId: a.userId, status: a.status })),
    recommendedTop3,
  };
}

// Re-read the request from the sandbox for ranking purposes
async function findRequestForTask(
  treeId: string,
  taskId: string,
): Promise<HiringRequest | null> {
  const treeDir = path.join(SANDBOX_BASE, treeId);
  const filePath = path.join(treeDir, `hiring-request-${taskId}.json`);
  if (!fs.existsSync(filePath)) return null;
  return readRequest(filePath);
}

// ── Deadline closing ────────────────────────────────────────────────────────

async function checkDeadlines(): Promise<number> {
  const db = await prisma();
  let closed = 0;

  // Find all processed requests (from the processedRequests set + sandbox)
  const allRequests = scanSandboxes();
  // Also check processed ones for deadline
  const keys = Array.from(processedRequests);

  for (const key of keys) {
    const [treeId, taskId] = key.split("/");

    const request = await findRequestForTask(treeId, taskId);
    if (!request) continue;

    const now = new Date();
    const endDate = new Date(request.endDate + "T23:59:59Z");

    if (now < endDate) continue; // not yet due

    // Check if already closed
    const alreadyClosed = await db.hiringApplicant.findFirst({
      where: { taskId, status: "CLOSED" },
    });
    if (alreadyClosed) continue;

    console.log(
      `[hiringBridge] Deadline reached for task ${taskId} (endDate=${request.endDate}) — closing applications`,
    );

    // Mark all APPLIED applicants as CLOSED
    await db.hiringApplicant.updateMany({
      where: { taskId, status: "APPLIED" },
      data: { status: "CLOSED", closedAt: now },
    });

    // Also mark IGNORED as CLOSED
    await db.hiringApplicant.updateMany({
      where: { taskId, status: "IGNORED" },
      data: { status: "CLOSED", closedAt: now },
    });

    // Rank applicants
    const { applicants, recommendedTop3 } = await rankApplicants(taskId, treeId);

    // Build result
    const result: HiringResult = {
      status: recommendedTop3.length > 0 ? "fulfilled" : "no_applicants",
      taskId,
      treeId,
      skill: request.skill,
      totalCandidatesNotified: -1, // not tracked in this version
      totalApplicants: applicants.length,
      recommendedTop3,
      message:
        recommendedTop3.length > 0
          ? `Se encontraron ${applicants.length} postulantes. Top 3 recomendados generados.`
          : `${applicants.length} postulantes, pero ningún candidato destaca sobre los mínimos.`,
    };

    saveResult(treeId, taskId, result);
    closed++;
  }

  return closed;
}

// ── Result persistence ──────────────────────────────────────────────────────

function saveResult(
  treeId: string,
  taskId: string,
  result: HiringResult,
): void {
  const treeDir = path.join(SANDBOX_BASE, treeId);
  const resultPath = path.join(treeDir, `hiring-result-${taskId}.json`);

  try {
    fs.writeFileSync(resultPath, JSON.stringify(result, null, 2), "utf-8");
    console.log(
      `[hiringBridge] Result saved for ${treeId}/${taskId}: ${result.status} (${result.totalApplicants} applicants)`,
    );
  } catch (err: any) {
    console.error(
      `[hiringBridge] Failed to save result ${resultPath}:`,
      err.message,
    );
  }
}

// ── Main processing ─────────────────────────────────────────────────────────

export async function scanAndProcess(): Promise<{ processed: number; errors: number }> {
  const requests = scanSandboxes();
  let processed = 0;
  let errors = 0;

  for (const req of requests) {
    const key = `${req.treeId}/${req.taskId}`;
    console.log(`[hiringBridge] Processing ${key}...`);

    const hiringReq = readRequest(req.filePath);
    if (!hiringReq) {
      processedRequests.add(key);
      errors++;
      continue;
    }

    try {
      // 1. Find matching candidates
      const candidates = await findMatchingCandidates(hiringReq);

      if (candidates.length === 0) {
        // No candidates match — save result and move on
        const result: HiringResult = {
          status: "no_candidates",
          taskId: req.taskId,
          treeId: req.treeId,
          skill: hiringReq.skill,
          totalCandidatesNotified: 0,
          totalApplicants: 0,
          recommendedTop3: [],
          message: `Ningún candidato cumple los 3 requisitos mínimos para ${hiringReq.skill}.`,
        };
        saveResult(req.treeId, req.taskId, result);
        processedRequests.add(key);
        processed++;
        continue;
      }

      // 2. Send DMs to each candidate
      let notified = 0;
      for (const candidate of candidates) {
        const ok = await notifyCandidate(candidate, hiringReq, req.taskId);
        if (ok) notified++;
      }

      console.log(
        `[hiringBridge] Notified ${notified}/${candidates.length} candidates for task ${req.taskId}`,
      );

      // 3. Postular/Ignorar tracking is handled by the bot inline callback
      // (handled in bot/index.ts via hiring:* callback_data prefix)

      processedRequests.add(key);
      processed++;
    } catch (err: any) {
      console.error(
        `[hiringBridge] Error processing ${key}:`,
        err.message,
      );
      errors++;
    }
  }

  // 4. Check deadlines
  try {
    const closed = await checkDeadlines();
    if (closed > 0) {
      console.log(`[hiringBridge] Closed ${closed} hiring windows`);
    }
  } catch (err: any) {
    console.error("[hiringBridge] Deadline check error:", err.message);
  }

  return { processed, errors };
}

// ── Lifecycle ───────────────────────────────────────────────────────────────

export function startHiringBridge(): void {
  if (watcherInterval) {
    console.warn("[hiringBridge] Already running — skipping start");
    return;
  }

  console.log(
    `[hiringBridge] Starting V2 watcher (interval: ${POLL_INTERVAL_MS / 1000}s, sandbox: ${SANDBOX_BASE})`,
  );

  // Run immediately on start, then on interval
  scanAndProcess().then(({ processed, errors }) => {
    if (processed > 0 || errors > 0) {
      console.log(
        `[hiringBridge] Initial scan: ${processed} processed, ${errors} errors`,
      );
    }
  });

  watcherInterval = setInterval(async () => {
    try {
      const { processed, errors } = await scanAndProcess();
      if (processed > 0 || errors > 0) {
        console.log(
          `[hiringBridge] Cycle: ${processed} processed, ${errors} errors`,
        );
      }
    } catch (err: any) {
      console.error("[hiringBridge] Cycle error:", err.message);
    }
  }, POLL_INTERVAL_MS);
}

export function stopHiringBridge(): void {
  if (watcherInterval) {
    clearInterval(watcherInterval);
    watcherInterval = null;
    console.log("[hiringBridge] Watcher stopped");
  }
}
