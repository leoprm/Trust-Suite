/**
 * History module — message collection, caching, and context compaction.
 *
 * Extracted from the monolithic hermesBridge.ts as Phase 1 Task 1.3.
 *
 * Functions:
 *   agentsMdCache, getAgentsMd  → AGENTS.md caching
 *   getChatHistory              → DB-based history lookup
 *   summarizeHistory            → Golden-ratio progressive summarization
 *   compressHistory             → Prompt-ready compaction wrapper
 */

import crypto from "crypto";
import fs from "fs";
import path from "path";

import type { ChatMessage, CollectedMessage } from "./types";
import { HISTORY_DEFAULT_MAX_TOKENS } from "./constants";

// ═══════════════════════════════════════════════════════════════════════════
// AGENTS.md cache
// ═══════════════════════════════════════════════════════════════════════════

/** AGENTS.md content cache keyed by treeId — file doesn't change between calls. */
export const agentsMdCache = new Map<string, { hash: string; content: string }>();

/**
 * Read AGENTS.md from the tree sandbox with content-hash caching.
 * Returns null if the file doesn't exist or is empty.
 */
export function getAgentsMd(sandboxDir: string, treeId: string): string | null {
  const agentsPath = path.join(sandboxDir, "AGENTS.md");
  if (!fs.existsSync(agentsPath)) return null;

  try {
    const content = fs.readFileSync(agentsPath, "utf-8").trim();
    if (!content) return null;

    const hash = crypto.createHash("sha256").update(content).digest("hex");
    const cached = agentsMdCache.get(treeId);
    if (cached && cached.hash === hash) return cached.content;

    agentsMdCache.set(treeId, { hash, content });
    return content;
  } catch {
    return null;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Chat history lookup (DB)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Returns the last `count` messages for a tree from the ChatMessage DB table.
 */
export async function getChatHistory(
  chatId: number,
  treeId: string,
  count: number = 20,
): Promise<ChatMessage[]> {
  try {
    const { prisma } = await import("../../index");
    const rows = await prisma.chatMessage.findMany({
      where: { treeId },
      orderBy: { createdAt: "desc" },
      take: count,
      select: { role: true, content: true },
    });
    if (rows.length > 0) {
      console.log(`[getChatHistory] DB returned ${rows.length} messages for treeId=${treeId}`);
      return rows.reverse().map((r: any) => ({
        role: r.role as "user" | "assistant",
        content: r.content,
      }));
    }
  } catch (err: any) {
    console.warn(`[getChatHistory] DB query failed: ${err?.message || err}`);
  }

  return [];
}

// ═══════════════════════════════════════════════════════════════════════════
// Context compaction (Golden Ratio chunking — φ ≈ 1.618)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Compact tier configuration.
 *
 * The golden ratio (φ=1.618) determines tier boundaries:
 *   Tier 0: messages 1–30   — full text
 *   Tier 1: messages 31–78  — 1 sentence per 10-msg block
 *   Tier 2: messages 79–200 — 1 sentence per 30-msg block
 *   Tier 3: messages 201+   — executive summary
 */
const COMPACT_TIERS = [
  { maxIndex: 30,  blockSize: 0,  label: "full" },           // keep full text
  { maxIndex: 78,  blockSize: 10, label: "sentence/10" },    // 1 sentence per 10
  { maxIndex: 200, blockSize: 30, label: "sentence/30" },    // 1 sentence per 30
  { maxIndex: Infinity, blockSize: 0, label: "executive" },  // executive summary
] as const;

/**
 * Apply golden-ratio progressive summarization to a message list.
 *
 * Messages are kept in chronological order (oldest first).
 * Recent messages (last ~30) are kept verbatim; older messages are
 * progressively compressed into summaries.
 *
 * This is a CHUNKING function — it produces a structured array of
 * { role, content } blocks. Actual LLM summarization is deferred to
 * `compressHistory`, which wraps this to produce a prompt-ready string.
 *
 * @param messages  Chat history, oldest first.
 * @returns Array of compacted blocks — verbatim at the tail, summaries at the head.
 */
export function summarizeHistory(messages: ChatMessage[]): { role: "system" | "user" | "assistant"; content: string }[] {
  const total = messages.length;
  if (total === 0) return [];

  // Reverse so index 0 = most recent
  const reversed = [...messages].reverse();
  const blocks: { role: "system" | "user" | "assistant"; content: string }[] = [];

  // Tier 3: messages beyond 200 → single executive summary
  if (total > 200) {
    const ancient = messages.slice(0, total - 200);
    const summary = ancient
      .map((m) => `[${m.role}]: ${m.content.slice(0, 80)}${m.content.length > 80 ? "…" : ""}`)
      .join(" | ");
    blocks.push({
      role: "system",
      content: `[History summary — ${ancient.length} oldest messages]: ${summary}`,
    });
  }

  // Tier 2: messages 79–200 → 1 sentence per 30-msg block
  const tier2Start = Math.max(0, total - 200);
  const tier2End   = Math.min(total, total - 78);
  if (tier2End > tier2Start) {
    const tier2Msgs = messages.slice(tier2Start, tier2End);
    for (let i = 0; i < tier2Msgs.length; i += 30) {
      const block = tier2Msgs.slice(i, i + 30);
      const preview = block
        .map((m) => `[${m.role}]: ${m.content.slice(0, 60)}${m.content.length > 60 ? "…" : ""}`)
        .join(" | ");
      blocks.push({
        role: "system",
        content: `[Tier-2 block ${Math.floor(i / 30) + 1}]: ${preview}`,
      });
    }
  }

  // Tier 1: messages 31–78 → 1 sentence per 10-msg block
  const tier1Start = Math.max(0, total - 78);
  const tier1End   = Math.min(total, total - 30);
  if (tier1End > tier1Start) {
    const tier1Msgs = messages.slice(tier1Start, tier1End);
    for (let i = 0; i < tier1Msgs.length; i += 10) {
      const block = tier1Msgs.slice(i, i + 10);
      const preview = block
        .map((m) => `[${m.role}]: ${m.content.slice(0, 80)}${m.content.length > 80 ? "…" : ""}`)
        .join(" | ");
      blocks.push({
        role: "system",
        content: `[Tier-1 block ${Math.floor(i / 10) + 1}]: ${preview}`,
      });
    }
  }

  // Tier 0: last 30 messages — verbatim
  const tier0Start = Math.max(0, total - 30);
  for (let i = tier0Start; i < total; i++) {
    blocks.push({ role: messages[i].role, content: messages[i].content });
  }

  return blocks;
}

/**
 * Compress history into a compact, prompt-ready string.
 *
 * When the message list exceeds 30 items, applies golden-ratio chunking
 * via `summarizeHistory` to keep total tokens low while preserving
 * verbatim fidelity for the most recent messages.
 *
 * @param messages  Chat history, oldest first.
 * @param maxTokens Soft token budget — ignored for now (future LLM summarization).
 * @returns Compact string suitable for injection into the system prompt.
 */
export function compressHistory(
  messages: ChatMessage[],
  maxTokens: number = HISTORY_DEFAULT_MAX_TOKENS,
): string {
  if (messages.length <= 30) {
    // Short history — render verbatim
    return messages
      .map((m) => `[${m.role}]: ${m.content}`)
      .join("\n");
  }

  const blocks = summarizeHistory(messages);
  return blocks
    .map((b) => {
      if (b.role === "system") return `── ${b.content}`;
      return `[${b.role}]: ${b.content}`;
    })
    .join("\n");
}
