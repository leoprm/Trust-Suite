/**
 * Hermes Bridge constants.
 *
 * All named constants for the Hermes Bridge module and its consumers.
 * Import individually or via the barrel index.ts.
 */

/** Max chars stored in ChatMessage.content for assistant responses.
 *  Prisma schema field is TEXT, no hard limit, but we cap to keep rows
 *  manageable and avoid ballooning conversation history. */
export const ASSISTANT_MESSAGE_MAX_CHARS = 8000;

/** Max chars for general-purpose DB string fields like rejectReason.
 *  Matches the VARCHAR(2000) default in the Prisma schema. */
export const DB_STRING_FIELD_MAX_CHARS = 2000;

/** Max chars of AGENTS.md injected into the system prompt.
 *  Kept at 2000 to prevent the prompt from growing too large. */
export const AGENTS_MD_MAX_CHARS = 2000;

/** Default soft token budget for compressHistory.
 *  Used as the default parameter value; callers can override. */
export const HISTORY_DEFAULT_MAX_TOKENS = 2000;
