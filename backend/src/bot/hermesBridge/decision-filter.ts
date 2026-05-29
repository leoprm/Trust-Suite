/**
 * Decision Filter — Determines whether Ari should respond to a message.
 *
 * Extracted from hermesBridge.ts (Phase 1, Task 1.4).
 * Contains: keyword scanning, local pre-filter, and LLM-based decision.
 */

import type {
  WindowState,
  ShouldRespondResult,
  RecentMessage,
  ChatMessage,
} from "./types";

// ── DeepSeek API config for fast yes/no decisions ────────────────────────
const DEEPSEEK_DECISION_API = "https://api.deepseek.com/v1/chat/completions";
const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY ?? "";
const DECISION_MODEL = "deepseek-chat"; // fast + cheap for yes/no decisions

// ── Keyword scanning ────────────────────────────────────────────────────
// Detects engagement signals in ambient (non-addressed) group messages.
// Returns matched keyword string or null if no match.

import fs from "fs";
import path from "path";

const BUILTIN_ENGAGEMENT_KEYWORDS: RegExp[] = [
  // Spanish question starters
  /\b(qué|que|quién|quien|quiénes|quienes|cómo|como|cuándo|cuando|dónde|donde|por qu[ée]|cuál|cual|cuáles|cuales)\b/i,
  // Help / need signals
  /\b(ayuda|help|necesito|necesitamos|alguien\s+sabe|alguien\s+me\s+puede|se\s+necesita)\b/i,
  // Engagement / opinion requests
  /\b(qué\s+opinan|qué\s+piensan|alguien\s+ha\s+(hecho|probado|usado)|recomiendan|sugerencias|consejos?)\b/i,
  // Bridge keywords (legacy — ari, trust maker, etc.)
  /\b(ari|trust\s*maker|trustmaker|árbol|agente|asistente|@TrustMakerBot)\b/i,
  // Urgent / time-sensitive
  /\b(urgente|emergencia|rápido|rapido|ahora\s+mismo|para\s+ya|cu[áa]nto\s+antes)\b/i,
  // Technical / project questions
  /\b(c[óo]mo\s+se\s+hace|c[óo]mo\s+funciona|qu[ée]\s+es\s+(un|una|el|la)|para\s+qu[ée]\s+sirve)\b/i,
  // Indefinite pronouns — someone is being sought
  /\b(alguien|alguno|alguna|ninguno|ninguna|nadie|cualquiera)\b/i,
  // Input-seeking phrases
  /\b(saben\s+(cómo|si|qué|dónde|cuándo|algo)|sabes\s+(cómo|si|qué|dónde|cuándo|algo)|se\s+puede|hay\s+que)\b/i,
  // Proposals / suggestions
  /\b(podemos|podr[ií]amos|podr[ií]an|podr[ií]a|pueden|deber[ií]amos|qué\s+tal\s+si|y\s+si\s+)\b/i,
  // Explicit requests for input
  /\b(ayudar|ay[úu]dame|expl[ií]came|expl[ií]car|alguna\s+idea|ideas?|opini[óo]n|qu[ée]\s+opinan|qu[ée]\s+piensan)\b/i,
];

/** Active keyword list — seeded from built-in, can be extended via loadKeywords(). */
let activeKeywords: RegExp[] = [...BUILTIN_ENGAGEMENT_KEYWORDS];

/**
 * Load custom engagement keywords from a tree sandbox's keywords.json.
 * Falls back to built-in ENGAGEMENT_KEYWORDS on any error.
 *
 * Expected format: { "keywords": ["pattern1", "pattern2", ...] }
 * Each pattern string is compiled into a case-insensitive RegExp.
 * Loaded keywords are appended to the built-in list.
 */
export async function loadKeywords(sandboxDir: string): Promise<void> {
  const filePath = path.join(sandboxDir, "keywords.json");
  try {
    if (!fs.existsSync(filePath)) {
      activeKeywords = [...BUILTIN_ENGAGEMENT_KEYWORDS];
      return;
    }
    const raw = fs.readFileSync(filePath, "utf-8");
    const parsed = JSON.parse(raw);
    const patterns: string[] = Array.isArray(parsed?.keywords)
      ? parsed.keywords.filter((p: unknown): p is string => typeof p === "string")
      : [];
    if (patterns.length === 0) {
      activeKeywords = [...BUILTIN_ENGAGEMENT_KEYWORDS];
      return;
    }
    const customKeywords = patterns.map((p: string) => new RegExp(p, "i"));
    activeKeywords = [...BUILTIN_ENGAGEMENT_KEYWORDS, ...customKeywords];
  } catch {
    // Any parse error / filesystem error → fall back to built-in list
    activeKeywords = [...BUILTIN_ENGAGEMENT_KEYWORDS];
  }
}

/** Legacy boolean scanner — preserved for backward compatibility. */
export function scanForKeywords(text: string): boolean {
  const lower = text.toLowerCase();
  for (const re of activeKeywords) {
    if (re.test(lower)) return true;
  }
  return false;
}

/**
 * Scan a message for engagement keywords.
 * Returns the matched text, or null if no match.
 */
export function scanForKeywordMatch(text: string): string | null {
  if (!text || text.length < 3) return null;
  for (const re of activeKeywords) {
    const m = text.match(re);
    if (m) return m[0];
  }
  return null;
}

/**
 * Local pre-filter — always passes through to the LLM-based shouldAriRespond().
 * Exists as a lightweight gate that only stops truly expired windows.
 *
 * Rules:
 *  - Always respond if window is active (remaining > 0).
 *  - Never respond if remaining is 0 (window expired).
 */
export function shouldAriRespondLocal(
  window: WindowState | null,
  messageText: string,
): boolean {
  if (!window) return false;
  return window.remaining > 0;
}

/**
 * LLM-based decision filter.
 * Calls DeepSeek API to decide whether Ari should respond to the current message.
 */
export async function shouldAriRespond(
  message: string,
  treeId: string,
  recentMessages: RecentMessage[],
  isReplyToBot?: boolean,
  isTagged?: boolean,
): Promise<ShouldRespondResult> {
  // ── Build lightweight decision system prompt ──────────────────────────
  const systemPrompt = [
    "You are a DECISION FILTER for Ari, the AI assistant of a Trust Maker community.",
    "Decide whether Ari should respond to the current message or stay completely silent.",
    "",
    "DECISION RULES (in priority order):",
    "",
    "1. MUST respond when:",
    "   - Ari is explicitly mentioned/tagged by name",
    "   - The message is a direct reply to Ari's message",
    "   - Someone asks Ari a direct question or requests something from Ari",
    "",
    "2. When keywords or tree-related topics appear but Ari is NOT directly addressed:",
    "   - Respond ONLY if Ari's input clearly adds meaningful value to the discussion",
    "   - If the conversation doesn't need Ari's participation, stay silent",
    "",
    "3. In an active conversation window where Ari has been participating:",
    "   - Respond only when the contribution advances the topic or provides new information",
    "   - Don't respond just to keep the conversation going or to be polite",
    "",
    "4. STAY SILENT on (NO_RESPONSE):",
    "   - Off-topic casual chat between members",
    "   - Simple greetings without follow-up (\"hola\", \"buenos días\", \"qué tal\")",
    "   - Logistics/coordination between members (\"nos vemos a las 5\", \"quién lleva las sillas\")",
    "   - Messages clearly between other members, not involving Ari",
    "   - Thank-you messages, acknowledgments, or simple agreements (\"gracias Ari\", \"ok\", \"de acuerdo\")",
    "   - Emoji-only messages, stickers, or reactions",
    "",
    "RESPONSE FORMAT (JSON — CRITICAL, FOLLOW EXACTLY):",
    "You MUST output a single JSON object and NOTHING else. No markdown, no explanation.",
    'If Ari should stay silent:  {"decision":"NO_RESPONSE"}',
    'If Ari should respond:     {"decision":"RESPOND"}',
    "- DeepSeek requires the word 'json' in the prompt to enable JSON output mode.",
    "- NEVER write the actual response text. ONLY output the JSON object above.",
    "",
    "You are deciding for the MOST RECENT message in the context below.",
  ].join("\n");

  // ── Build messages array ──────────────────────────────────────────────
  const messages: ChatMessage[] = [
    { role: "system", content: systemPrompt },
  ];

  // Inject recent messages as context (last 10, newest last)
  const last10 = recentMessages.slice(-10);
  const separator = "─".repeat(40);
  if (last10.length > 0) {
    messages.push({
      role: "user",
      content:
        `RECENT CONVERSATION (${last10.length} messages):\n${separator}\n` +
        last10
          .map((m) => `${m.senderName}: ${m.content}`)
          .join("\n") +
        `\n${separator}\n\nCURRENT MESSAGE (decide on this one):\n${message}`,
    });
  } else {
    messages.push({
      role: "user",
      content: `CURRENT MESSAGE:\n${message}`,
    });
  }

  // Signal explicit triggers so the agent knows
  if (isReplyToBot) {
    messages.push({
      role: "user",
      content:
        "CONTEXT: This message is a direct REPLY to Ari's message. Rule 1 applies — MUST respond unless it's just a thank-you.",
    });
  }
  if (isTagged) {
    messages.push({
      role: "user",
      content:
        "CONTEXT: Ari is explicitly mentioned/tagged in this message. Rule 1 applies — MUST respond.",
    });
  }

  // ── Call DeepSeek API directly (bypass Hermes Agent for fast decision) ──
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 30_000); // 30s is plenty

  try {
    const response = await fetch(DEEPSEEK_DECISION_API, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${DEEPSEEK_API_KEY}`,
      },
      body: JSON.stringify({
        model: DECISION_MODEL,
        messages,
        stream: false,
        response_format: { type: "json_object" },
        max_tokens: 50,
        temperature: 0,
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorText = await response.text().catch(() => "");
      console.error(
        `[shouldAriRespond] DeepSeek API returned ${response.status}: ${errorText.slice(0, 200)}`,
      );
      return { shouldRespond: false };
    }

    const data = await response.json();
    const rawContent: string = data?.choices?.[0]?.message?.content ?? "";

    if (!rawContent) {
      console.warn("[shouldAriRespond] Empty response from DeepSeek API");
      return { shouldRespond: false };
    }

    // ── Parse JSON ────────────────────────────────────────────────────────
    try {
      const parsed = JSON.parse(rawContent.trim());
      const decision: string = (parsed?.decision ?? "").trim().toUpperCase();
      if (decision === "RESPOND") return { shouldRespond: true };
      if (decision === "NO_RESPONSE") return { shouldRespond: false };
      console.warn(
        `[shouldAriRespond] Unexpected decision: "${decision}" — defaulting to silent`,
      );
    } catch {
      // JSON parse failed — try regex extraction
      const m = rawContent.match(/"decision"\s*:\s*"(RESPOND|NO_RESPONSE)"/i);
      if (m) return { shouldRespond: m[1].toUpperCase() === "RESPOND" };
      console.warn(
        `[shouldAriRespond] Non-JSON response: "${rawContent.slice(0, 80)}" — defaulting to silent`,
      );
    }
    return { shouldRespond: false };
  } catch (err) {
    clearTimeout(timeoutId);
    if (err instanceof Error && err.name === "AbortError") {
      console.error("[shouldAriRespond] Decision timed out after 7 min");
    } else {
      console.error("[shouldAriRespond] API call failed:", err);
    }
    // On error, default to silent
    return { shouldRespond: false };
  }
}
