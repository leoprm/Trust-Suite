/**
 * Hermes Bridge type definitions.
 *
 * All shared types for the Hermes Bridge module.
 * Consumed by hermesBridge.ts and re-exported via the barrel index.ts.
 */

// ── Conversation Window ───────────────────────────────────────────────────

export interface WindowState {
  treeId: string;
  keyword: string | null;
  remaining: number;
  openedAt: Date;
}

// ── API Response Types ────────────────────────────────────────────────────

export interface HermesBridgeResponse {
  text: string | null;
  /** When true, the message is queued (Ari is busy). Caller should tell user their position. */
  queued?: boolean;
  /** Position in queue (1-based) when queued is true. */
  queuePosition?: number;
  /** Saturation message when the queue is full. Caller must reply with this. */
  saturationMessage?: string;
}

export interface ShouldRespondResult {
  shouldRespond: boolean;
}

// ── Chat / Message Types ──────────────────────────────────────────────────

export interface RecentMessage {
  senderName: string;
  content: string;
}

/** Lightweight message returned by collectRecentMessages */
export interface CollectedMessage {
  displayName: string;
  text: string;
}

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}
