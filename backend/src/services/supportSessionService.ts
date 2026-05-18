import fs from "fs";
import path from "path";

// ── Types ───────────────────────────────────────────────────────────────────

interface UserSession {
  turnsUsed: number;
  month: string; // "YYYY-MM"
  lastTurnAt: string; // ISO
}

interface SessionStore {
  [userId: string]: UserSession;
}

// ── Config ──────────────────────────────────────────────────────────────────

const MAX_TURNS_PER_MONTH = 30;
const DATA_DIR = path.resolve(__dirname, "../../data");
const DATA_FILE = path.join(DATA_DIR, "supportSessions.json");

// ── Helpers ─────────────────────────────────────────────────────────────────

function currentMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

function readStore(): SessionStore {
  try {
    if (!fs.existsSync(DATA_FILE)) return {};
    const raw = fs.readFileSync(DATA_FILE, "utf-8");
    return JSON.parse(raw) as SessionStore;
  } catch {
    return {};
  }
}

function writeStore(store: SessionStore): void {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  fs.writeFileSync(DATA_FILE, JSON.stringify(store, null, 2), "utf-8");
}

function getOrCreateUser(store: SessionStore, userId: string): UserSession {
  const month = currentMonth();

  if (!store[userId] || store[userId].month !== month) {
    store[userId] = { turnsUsed: 0, month, lastTurnAt: "" };
  }

  return store[userId];
}

// ── Public API ──────────────────────────────────────────────────────────────

/** Returns how many turns the user has left this month (0–20). */
export function getRemainingTurns(userId: string): number {
  const store = readStore();
  const user = getOrCreateUser(store, userId);
  return Math.max(0, MAX_TURNS_PER_MONTH - user.turnsUsed);
}

/** Consumes one turn. Returns remaining turns. Saves to disk. */
export function useTurn(userId: string): number {
  const store = readStore();
  const user = getOrCreateUser(store, userId);

  user.turnsUsed += 1;
  user.lastTurnAt = new Date().toISOString();

  writeStore(store);

  return Math.max(0, MAX_TURNS_PER_MONTH - user.turnsUsed);
}
