/**
 * CompactController — Golden Ratio context compaction.
 *
 * POST /api/trees/:treeId/sandbox/compact
 * Body: { messages: string[], iteration?: number }
 * Response: { compacted: string, levels: number, originalCount: number, compactedChars: number }
 *
 * Golden Ratio chunking (φ=1.618):
 *   Level 0 (< 30 msg):  full text
 *   Level 1 (30-78 msg):  1 sentence summary per 10-msg block
 *   Level 2 (78-200 msg): 1 sentence summary per 30-msg block
 *   Level 3 (200+ msg):   executive summary of all ancient history
 */

import { Request, Response } from "express";

const PHI = 1.618;

// Fibonacci-ish thresholds: each level covers φ× more messages
const LEVEL_THRESHOLDS = [30, 78, 200];
const BLOCK_SIZES = [10, 30, 60];

function determineLevel(msgCount: number): number {
  for (let i = 0; i < LEVEL_THRESHOLDS.length; i++) {
    if (msgCount <= LEVEL_THRESHOLDS[i]) return i;
  }
  return LEVEL_THRESHOLDS.length; // level 3+
}

function compactMessages(messages: string[], level: number): string {
  if (level === 0 || messages.length <= LEVEL_THRESHOLDS[0]) {
    // Full text, just join
    return messages.join("\n");
  }

  const blockSize = level <= BLOCK_SIZES.length ? BLOCK_SIZES[level - 1] : 60;
  const blocks: string[] = [];

  for (let i = 0; i < messages.length; i += blockSize) {
    const block = messages.slice(i, i + blockSize);
    const joined = block.join(" ");
    // Simple extractive summary: first sentence of first message + key phrases
    const firstSentence = joined.split(/[.!?]/, 1)[0]?.trim() || joined.slice(0, 150);
    blocks.push(`[${i + 1}-${Math.min(i + blockSize, messages.length)}] ${firstSentence}`);
  }

  if (level === 3) {
    // Executive summary: top 3 blocks
    const top = blocks.slice(0, 3);
    return `Resumen ejecutivo (${messages.length} mensajes):\n${top.join("\n")}`;
  }

  return blocks.join("\n");
}

export const compactContext = async (req: Request, res: Response) => {
  try {
    const { messages, iteration } = req.body;

    if (!messages || !Array.isArray(messages)) {
      return res.status(400).json({ error: "messages array is required" });
    }

    const msgCount = messages.length;
    const level = Math.min(determineLevel(msgCount), iteration || determineLevel(msgCount));
    const compacted = compactMessages(messages, level);

    res.json({
      compacted,
      level,
      originalCount: msgCount,
      compactedChars: compacted.length,
      originalChars: messages.join("").length,
      compressionRatio: msgCount > 0
        ? Math.round((1 - compacted.length / messages.join("").length) * 100)
        : 0,
    });
  } catch (err: any) {
    console.error("[compactContext]", err?.message || err);
    res.status(500).json({ error: "Compaction failed" });
  }
};
