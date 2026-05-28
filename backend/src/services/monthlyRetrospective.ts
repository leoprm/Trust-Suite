/**
 * Monthly Retrospective Service
 *
 * Runs on the 1st of each month (via scheduler cron). For each tree with a
 * Telegram group:
 *   1. Runs lib/concat_month.py to concatenate the previous month's daily
 *      conversation files into a monthly archive.
 *   2. Reads the concatenated file.
 *   3. Sends it to routeToHermes with a retrospective system prompt
 *      (problemas, oportunidades, sugerencias).
 *   4. If Hermes responds "NO_REPORT" → silence.
 *   5. If Hermes produces a report → posts it to the tree's Telegram group.
 *
 * Rate limiting is handled by the scheduler (one cron tick per month).
 */

import type { PrismaClient } from "@prisma/client";
import type { Bot } from "grammy";
import type { BotContext } from "../bot/types";
import { routeToHermes } from "../bot/hermesBridge";
import { spawn } from "child_process";
import fs from "fs";
import path from "path";

// ── Types ──────────────────────────────────────────────────────────────────────

export interface RetrospectiveResult {
  treeName: string;
  chatId: string | null;
  monthLabel: string;
  /** Total messages in the concatenated file. */
  totalMessages: number;
  /** Whether a report was posted to the group. */
  reportPosted: boolean;
  /** Error message, if any. */
  error?: string;
}

export interface ConcatOutput {
  path: string;
  total_messages: number;
  total_chars: number;
  unique_users: string[];
  days_with_activity: number;
}

// ── Helpers ────────────────────────────────────────────────────────────────────

/** Char limit for the conversation text sent to Hermes (≈20K tokens). */
const MAX_CONVERSATION_CHARS = 80_000;

/** Minimum message count to bother with a retrospective. */
const MIN_MESSAGES = 50;

/** Delay between trees to avoid rate limiting (5 minutes). */
const INTER_TREE_DELAY_MS = 5 * 60 * 1000;

const MONTH_NAMES = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];

function getPreviousMonth(): { yearMonth: string; label: string } {
  const now = new Date();
  const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const year = prev.getFullYear();
  const month = String(prev.getMonth() + 1).padStart(2, "0");
  return {
    yearMonth: `${year}-${month}`,
    label: `${MONTH_NAMES[prev.getMonth()]} ${year}`,
  };
}

/** Returns true if today is the last day of a calendar quarter (Mar 31, Jun 30, Sep 30, Dec 31). */
export function isEndOfQuarter(): boolean {
  const today = new Date();
  const month = today.getMonth(); // 0-indexed
  const lastDay = new Date(today.getFullYear(), month + 1, 0).getDate();
  return today.getDate() === lastDay && [2, 5, 8, 11].includes(month);
}

const QUARTER_MONTHS = [
  ["enero", "febrero", "marzo"],
  ["abril", "mayo", "junio"],
  ["julio", "agosto", "septiembre"],
  ["octubre", "noviembre", "diciembre"],
];

/** Calculate quarter metadata for a given date. */
export function getQuarterLabel(date: Date): {
  quarterLabel: string;
  prevQuarterLabel: string;
  yearMonths: string[];
} {
  const month = date.getMonth(); // 0-indexed
  const year = date.getFullYear();
  const quarter = Math.floor(month / 3); // 0=Q1, 1=Q2, 2=Q3, 3=Q4
  const quarterNum = quarter + 1;
  const months = QUARTER_MONTHS[quarter];
  const quarterLabel = `Q${quarterNum} ${year} (${months[0]}-${months[2]})`;

  const prevQuarter = quarter === 0 ? 3 : quarter - 1;
  const prevYear = quarter === 0 ? year - 1 : year;
  const prevQuarterLabel = `Q${prevQuarter + 1} ${prevYear}`;

  const yearMonths = [0, 1, 2].map((offset) => {
    const m = quarter * 3 + offset;
    return `${year}-${String(m + 1).padStart(2, "0")}`;
  });

  return { quarterLabel, prevQuarterLabel, yearMonths };
}

/** Spawn lib/concat_month.py and parse its JSON stdout. */
function runConcatMonth(
  treeId: string,
  yearMonth: string,
): Promise<ConcatOutput | null> {
  return new Promise((resolve) => {
    const script = path.resolve(__dirname, "../../lib/concat_month.py");
    let stdout = "";
    let stderr = "";

    const child = spawn("python3", [script, treeId, yearMonth], {
      stdio: ["pipe", "pipe", "pipe"],
      timeout: 60_000,
    });

    child.stdout.on("data", (chunk: Buffer) => { stdout += chunk.toString("utf-8"); });
    child.stderr.on("data", (chunk: Buffer) => { stderr += chunk.toString("utf-8"); });

    child.on("close", (code) => {
      if (code !== 0) {
        console.error(
          `[Retro] concat_month.py exit=${code} tree=${treeId} month=${yearMonth}: ${stderr.slice(0, 300)}`,
        );
        resolve(null);
        return;
      }
      try {
        resolve(JSON.parse(stdout) as ConcatOutput);
      } catch {
        console.error(
          `[Retro] concat_month.py invalid JSON tree=${treeId}: ${stdout.slice(0, 200)}`,
        );
        resolve(null);
      }
    });

    child.stdin.end();
  });
}

/** Build the retrospective system prompt injected as part of the user message. */
function retroInstructions(treeName: string, monthLabel: string): string {
  return [
    "═══ RETROSPECTIVA MENSUAL ═══",
    "",
    `Analiza el registro de conversaciones del árbol "${treeName}" durante ${monthLabel}.`,
    "Produce un informe con TRES secciones:",
    "",
    "📋 1. PROBLEMAS — conflictos, dificultades recurrentes o fricciones detectadas.",
    "💡 2. OPORTUNIDADES — posibles colaboraciones, mejoras o sinergias visibles.",
    "🔧 3. SUGERENCIAS — acciones concretas y accionables para la comunidad.",
    "",
    "REGLAS:",
    "- Español neutral (tú/ustedes, sin voseo).",
    "- Sé específico: menciona temas reales, no generalidades.",
    "- Constructivo, no alarmista. Enfócate en soluciones.",
    "- Máximo 40 líneas. Sintetiza patrones, no transcribas.",
    "- Usa los nombres de los participantes tal como aparecen.",
    "",
    "Si no hay hallazgos significativos, responde EXACTAMENTE: NO_REPORT",
    "",
    "📓 4. NOTEBOOKLM (OBLIGATORIO) — Realiza SIEMPRE estos pasos:\n" +
    "   - Lista los archivos en el sandbox del árbol y selecciona los mas relevantes (max 10, >50KB resumir)\n" +
    "   - Sube los archivos seleccionados al notebook via POST /api/trees/TREE_ID/notebooklm/source\n" +
    "   - Crea un prompt de presentacion que explique el proposito, mes, temas encontrados y tono deseado\n" +
    "   - Genera contenido con POST /api/trees/TREE_ID/notebooklm/ask\n" +
    "   - Guarda el resultado en el sandbox como monthly-presentation-MES.md\n" +
    "   - Publica un resumen ejecutivo en el grupo con los hallazgos principales\n" +
    "\n" +
    "Si NotebookLM falla (auth expirada, rate limit, etc.), CONTINUA con el informe base de 3 secciones. NotebookLM es enriquecimiento, no bloqueante.",
    "",
    "El registro de conversaciones:",
    "═══════════════════════════════",
  ].join("\n");
}

/** Build the quarterly retrospective system prompt (6 sections, 60 lines max). */ 
function retroInstructionsQuarterly(
  treeName: string,
  quarterLabel: string,
  prevQuarterLabel?: string,
): string {
  return [
    "═══ RETROSPECTIVA TRIMESTRAL ═══",
    "",
    `Analiza el registro de conversaciones del árbol "${treeName}" durante ${quarterLabel}.`,
    "Produce un informe con CINCO secciones:",
    "",
    "📋 1. PROBLEMAS — conflictos, dificultades recurrentes o fricciones detectadas.",
    "💡 2. OPORTUNIDADES — posibles colaboraciones, mejoras o sinergias visibles.",
    "🔧 3. SUGERENCIAS — acciones concretas y accionables para la comunidad.",
    "📈 4. EVOLUCIÓN DEL TRIMESTRE — tendencias, patrones de crecimiento, cambios en la dinámica del grupo.",
    prevQuarterLabel
      ? `📊 5. COMPARATIVA vs ${prevQuarterLabel} — qué cambió, qué mejoró, qué empeoró.`
      : "📊 5. COMPARATIVA — sin trimestre anterior para comparar (primer informe).",
    "📓 6. NOTEBOOKLM (OBLIGATORIO) — mismos pasos que el mensual.",
    "",
    "REGLAS:",
    "- Español neutral (tú/ustedes, sin voseo).",
    "- Sé específico: menciona temas reales, no generalidades.",
    "- Constructivo, no alarmista. Enfócate en soluciones.",
    "- Máximo 60 líneas (15 más que el mensual por las secciones extra).",
    "- Usa los nombres de los participantes tal como aparecen.",
    "",
    "Si no hay hallazgos significativos, responde EXACTAMENTE: NO_REPORT",
    "",
    "El registro de conversaciones (3 meses):",
    "═══════════════════════════════",
  ].join("\n");
}

// ── Core ───────────────────────────────────────────────────────────────────────

async function processTree(
  prisma: PrismaClient,
  tree: { id: string; name: string; telegramChatId: string | null },
  bot: Bot<BotContext> | null,
  yearMonth: string,
  monthLabel: string,
): Promise<RetrospectiveResult> {
  const chatId = tree.telegramChatId;

  // ── 1. Run concat_month.py ────────────────────────────────────────────────
  const concat = await runConcatMonth(tree.id, yearMonth);
  if (!concat) {
    return {
      treeName: tree.name, chatId, monthLabel, totalMessages: 0,
      reportPosted: false,
      error: "concat_month.py failed or no daily files",
    };
  }

  // ── 2. Read the concatenated file ─────────────────────────────────────────
  const fullPath = concat.path; // absolute path from sandbox
  let conversationText: string;
  try {
    conversationText = fs.readFileSync(fullPath, "utf-8");
  } catch {
    return {
      treeName: tree.name, chatId, monthLabel,
      totalMessages: concat.total_messages, reportPosted: false,
      error: `cannot read file: ${concat.path}`,
    };
  }

  // ── 3. Gate: skip trees with too few messages ────────────────────────────
  if (concat.total_messages < MIN_MESSAGES) {
    console.log(
      `[Retro] ${tree.name}: ${concat.total_messages} msgs en ${monthLabel} < ${MIN_MESSAGES} — saltando.`,
    );
    return {
      treeName: tree.name, chatId, monthLabel,
      totalMessages: concat.total_messages, reportPosted: false,
    };
  }

  // ── 4. Truncate oversized conversations ───────────────────────────────────
  if (conversationText.length > MAX_CONVERSATION_CHARS) {
    console.log(
      `[Retro] ${tree.name}: truncando conversación de ${conversationText.length} → ${MAX_CONVERSATION_CHARS} chars.`,
    );
    conversationText = conversationText.slice(0, MAX_CONVERSATION_CHARS);
  }

  // ── 5. Send to Hermes via routeToHermes ──────────────────────────────────
  const instructions = retroInstructions(tree.name, monthLabel);
  const fullMessage = `${instructions}\n\n${conversationText}`;

  // Synthetic userId (0) = system/internal call — skips the message queue.
  try {
    const response = await routeToHermes(
      fullMessage,
      tree.id,
      "0",            // synthetic userId
      undefined,      // no chatHistory
      undefined,      // no displayName
      undefined,      // no chatId → skip queue gate
      undefined,      // no messageId
    );

    if (!response || !response.text) {
      return {
        treeName: tree.name, chatId, monthLabel,
        totalMessages: concat.total_messages, reportPosted: false,
        error: "Hermes returned null/empty",
      };
    }

    const trimmed = response.text.trim();

    // ── 6. NO_REPORT check ─────────────────────────────────────────────────
    if (trimmed === "NO_REPORT" || trimmed === '"NO_REPORT"') {
      console.log(
        `[Retro] ${tree.name}: NO_REPORT — ${concat.total_messages} msgs sin hallazgos.`,
      );
      return {
        treeName: tree.name, chatId, monthLabel,
        totalMessages: concat.total_messages, reportPosted: false,
      };
    }

    // ── 7. Post report to Telegram group ────────────────────────────────────
    if (!bot || !chatId) {
      console.log(
        `[Retro] ${tree.name}: reporte generado (${trimmed.length} chars) sin bot/chatId.`,
      );
      return {
        treeName: tree.name, chatId, monthLabel,
        totalMessages: concat.total_messages, reportPosted: false,
        error: "no bot or chatId",
      };
    }

    const header = `📊 *Retrospectiva mensual — ${tree.name}*\n_${monthLabel}_\n\n`;
    try {
      await bot.api.sendMessage(chatId, header + trimmed, { parse_mode: "Markdown" });
      console.log(
        `[Retro] ${tree.name}: reporte publicado (${trimmed.length} chars, ${concat.total_messages} msgs).`,
      );
      return {
        treeName: tree.name, chatId, monthLabel,
        totalMessages: concat.total_messages, reportPosted: true,
      };
    } catch (err: any) {
      console.error(
        `[Retro] ${tree.name}: sendMessage error a ${chatId}: ${err?.message || err}`,
      );
      return {
        treeName: tree.name, chatId, monthLabel,
        totalMessages: concat.total_messages, reportPosted: false,
        error: `sendMessage: ${err?.message || err}`,
      };
    }
  } catch (err: any) {
    console.error(
      `[Retro] ${tree.name}: routeToHermes error: ${err?.message || err}`,
    );
    return {
      treeName: tree.name, chatId, monthLabel,
      totalMessages: concat.total_messages, reportPosted: false,
      error: `routeToHermes: ${err?.message || err}`,
    };
  }
}

// ── Quarterly ─────────────────────────────────────────────────────────────────

async function processQuarterlyTree(
  prisma: PrismaClient,
  tree: { id: string; name: string; telegramChatId: string | null },
  bot: Bot<BotContext> | null,
  yearMonths: string[],
  quarterLabel: string,
  prevQuarterLabel: string,
): Promise<RetrospectiveResult> {
  const chatId = tree.telegramChatId;

  // ── 1. Concatenate all 3 months ──────────────────────────────────────────
  const concatResults: ConcatOutput[] = [];
  for (const ym of yearMonths) {
    const concat = await runConcatMonth(tree.id, ym);
    if (concat) concatResults.push(concat);
  }

  if (concatResults.length === 0) {
    return {
      treeName: tree.name,
      chatId,
      monthLabel: quarterLabel,
      totalMessages: 0,
      reportPosted: false,
      error: "concat_month.py failed for all 3 months",
    };
  }

  // ── 2. Read and concatenate all 3 monthly files ──────────────────────────
  let allText = "";
  let totalMessages = 0;
  for (const concat of concatResults) {
    try {
      allText += fs.readFileSync(concat.path, "utf-8") + "\n";
      totalMessages += concat.total_messages;
    } catch {
      console.error(`[Retro] Cannot read ${concat.path}, skipping.`);
    }
  }

  if (!allText.trim()) {
    return {
      treeName: tree.name,
      chatId,
      monthLabel: quarterLabel,
      totalMessages,
      reportPosted: false,
      error: "all 3 monthly files were unreadable",
    };
  }

  // ── 3. Gate: skip trees with too few messages ────────────────────────────
  if (totalMessages < MIN_MESSAGES) {
    console.log(
      `[Retro] ${tree.name}: ${totalMessages} msgs en ${quarterLabel} < ${MIN_MESSAGES} — saltando.`,
    );
    return {
      treeName: tree.name,
      chatId,
      monthLabel: quarterLabel,
      totalMessages,
      reportPosted: false,
    };
  }

  // ── 4. Truncate oversized conversations ──────────────────────────────────
  if (allText.length > MAX_CONVERSATION_CHARS) {
    console.log(
      `[Retro] ${tree.name}: truncando conversación trimestral de ${allText.length} → ${MAX_CONVERSATION_CHARS} chars.`,
    );
    allText = allText.slice(0, MAX_CONVERSATION_CHARS);
  }

  // ── 5. Send to Hermes with quarterly instructions ────────────────────────
  const instructions = retroInstructionsQuarterly(
    tree.name,
    quarterLabel,
    prevQuarterLabel,
  );
  const fullMessage = `${instructions}\n\n${allText}`;

  try {
    const response = await routeToHermes(
      fullMessage,
      tree.id,
      "0", // synthetic userId
      undefined,
      undefined,
      undefined,
      undefined,
    );

    if (!response || !response.text) {
      return {
        treeName: tree.name,
        chatId,
        monthLabel: quarterLabel,
        totalMessages,
        reportPosted: false,
        error: "Hermes returned null/empty",
      };
    }

    const trimmed = response.text.trim();

    // ── 6. NO_REPORT check ─────────────────────────────────────────────────
    if (trimmed === "NO_REPORT" || trimmed === '"NO_REPORT"') {
      console.log(
        `[Retro] ${tree.name}: NO_REPORT (trimestral) — ${totalMessages} msgs sin hallazgos.`,
      );
      return {
        treeName: tree.name,
        chatId,
        monthLabel: quarterLabel,
        totalMessages,
        reportPosted: false,
      };
    }

    // ── 7. Save quarterly presentation to sandbox ──────────────────────────
    const quarterMatch = quarterLabel.match(/Q(\d)\s+(\d{4})/);
    if (quarterMatch) {
      const sandboxBase =
        process.env.SANDBOX_BASE_DIR || "/home/trustmaker/trees";
      const filename = `quarterly-presentation-Q${quarterMatch[1]}-${quarterMatch[2]}.md`;
      const filePath = path.join(sandboxBase, tree.id, filename);
      const dir = path.dirname(filePath);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(filePath, trimmed, "utf-8");
      console.log(
        `[Retro] ${tree.name}: quarterly presentation saved → ${filePath}`,
      );
    }

    // ── 8. Post report to Telegram group ───────────────────────────────────
    if (!bot || !chatId) {
      console.log(
        `[Retro] ${tree.name}: reporte trimestral generado (${trimmed.length} chars) sin bot/chatId.`,
      );
      return {
        treeName: tree.name,
        chatId,
        monthLabel: quarterLabel,
        totalMessages,
        reportPosted: false,
        error: "no bot or chatId",
      };
    }

    const header = `📊 INFORME TRIMESTRAL — ${tree.name}\n_${quarterLabel}_\n\n`;
    try {
      await bot.api.sendMessage(chatId, header + trimmed, {
        parse_mode: "Markdown",
      });
      console.log(
        `[Retro] ${tree.name}: reporte trimestral publicado (${trimmed.length} chars, ${totalMessages} msgs).`,
      );
      return {
        treeName: tree.name,
        chatId,
        monthLabel: quarterLabel,
        totalMessages,
        reportPosted: true,
      };
    } catch (err: any) {
      console.error(
        `[Retro] ${tree.name}: sendMessage error a ${chatId}: ${err?.message || err}`,
      );
      return {
        treeName: tree.name,
        chatId,
        monthLabel: quarterLabel,
        totalMessages,
        reportPosted: false,
        error: `sendMessage: ${err?.message || err}`,
      };
    }
  } catch (err: any) {
    console.error(
      `[Retro] ${tree.name}: routeToHermes error: ${err?.message || err}`,
    );
    return {
      treeName: tree.name,
      chatId,
      monthLabel: quarterLabel,
      totalMessages,
      reportPosted: false,
      error: `routeToHermes: ${err?.message || err}`,
    };
  }
}

/** Run the quarterly retrospective for all trees with a Telegram group. */
async function runQuarterlyRetrospective(
  prisma: PrismaClient,
  bot: Bot<BotContext> | null,
): Promise<RetrospectiveResult[]> {
  const today = new Date();
  const { quarterLabel, prevQuarterLabel, yearMonths } =
    getQuarterLabel(today);

  const trees = await prisma.tree.findMany({
    where: { telegramChatId: { not: null } },
    select: { id: true, name: true, telegramChatId: true },
  });

  console.log(
    `[Retro] 📊📊 Iniciando retrospectiva TRIMESTRAL ${quarterLabel} para ${trees.length} árbol(es)…`,
  );

  const results: RetrospectiveResult[] = [];
  for (let i = 0; i < trees.length; i++) {
    const tree = trees[i];
    try {
      results.push(
        await processQuarterlyTree(
          prisma,
          tree,
          bot,
          yearMonths,
          quarterLabel,
          prevQuarterLabel,
        ),
      );
    } catch (err: any) {
      console.error(`[Retro] ❌ ${tree.name}: ${err?.message || err}`);
      results.push({
        treeName: tree.name,
        chatId: tree.telegramChatId,
        monthLabel: quarterLabel,
        totalMessages: 0,
        reportPosted: false,
        error: String(err),
      });
    }
    if (i < trees.length - 1) {
      console.log(
        `[Retro] ⏳ Esperando ${INTER_TREE_DELAY_MS / 60_000} min antes del siguiente árbol…`,
      );
      await new Promise((r) => setTimeout(r, INTER_TREE_DELAY_MS));
    }
  }

  const posted = results.filter((r) => r.reportPosted).length;
  const silent = results.filter((r) => !r.reportPosted && !r.error).length;
  const failed = results.filter((r) => !!r.error).length;

  console.log(
    `[Retro] 📊📊 Trimestral ${results.length} árboles: ${posted} publicados, ${silent} sin reporte, ${failed} errores.`,
  );

  return results;
}

// ── Public API ─────────────────────────────────────────────────────────────────

/** 
 * Run the monthly retrospective for all trees with a Telegram group. 
 * Called by the scheduler on day 1 of each month at 01:00. 
 */ 
export async function runMonthlyRetrospective(
  prisma: PrismaClient,
  bot: Bot<BotContext> | null,
): Promise<RetrospectiveResult[]> {
  // ── End of quarter → run quarterly instead, skip monthly ──────────────────
  if (isEndOfQuarter()) {
    console.log("[Retro] 🗓️ Fin de trimestre detectado — ejecutando retrospectiva trimestral…");
    return runQuarterlyRetrospective(prisma, bot);
  }

  const { yearMonth, label: monthLabel } = getPreviousMonth();

  const trees = await prisma.tree.findMany({
    where: { telegramChatId: { not: null } },
    select: { id: true, name: true, telegramChatId: true },
  });

  console.log(
    `[Retro] 📊 Iniciando retrospectiva ${monthLabel} para ${trees.length} árbol(es)…`,
  );

  const results: RetrospectiveResult[] = [];
  for (let i = 0; i < trees.length; i++) {
    const tree = trees[i];
    try {
      results.push(await processTree(prisma, tree, bot, yearMonth, monthLabel));
    } catch (err: any) {
      console.error(`[Retro] ❌ ${tree.name}: ${err?.message || err}`);
      results.push({
        treeName: tree.name,
        chatId: tree.telegramChatId,
        monthLabel,
        totalMessages: 0,
        reportPosted: false,
        error: String(err),
      });
    }
    // ── 5-min delay between trees (skip after last) ──
    if (i < trees.length - 1) {
      console.log(`[Retro] ⏳ Esperando ${INTER_TREE_DELAY_MS / 60_000} min antes del siguiente árbol…`);
      await new Promise((r) => setTimeout(r, INTER_TREE_DELAY_MS));
    }
  }

  const posted = results.filter((r) => r.reportPosted).length;
  const silent = results.filter((r) => !r.reportPosted && !r.error).length;
  const failed = results.filter((r) => !!r.error).length;

  console.log(
    `[Retro] 📊 ${results.length} árboles: ${posted} publicados, ${silent} sin reporte, ${failed} errores.`,
  );

  return results;
}
