# OpenSpec: Thermo-Nuclear Hermes Bridge Cleanup

> **Source:** Code review of `src/bot/hermesBridge.ts` (1515 lines) — 10 críticos, 9 warnings, 5 sugerencias.
> **For Hermes:** Use subagent-driven-development to implement phase by phase. Delegate each task group to Kanban workers.

**Goal:** Refactor `hermesBridge.ts` from a 1515-line god-module into 6 focused modules (<400 lines each), fix all security/correctness issues, and eliminate duplicated logic.

**Architecture:** Split into `src/bot/hermesBridge/` directory with `index.ts` re-exporting the public API (`routeToHermes`, `shouldAriRespond`). Each concern gets its own file. No behavior changes — pure structural refactor with bug fixes.

**Tech Stack:** TypeScript, Express, Prisma, grammY, Node.js streams

---

## Phase 0 — Security Hotfixes (30 min, blocks nothing else)

These are the highest-severity fixes that can ship independently before the big refactor.

### Task 0.1: Validate treeId as UUID before path.join (C8)

**Files:**
- Modify: `src/bot/hermesBridge.ts:625,1139`

**Step 1: Add UUID validation helper**

```typescript
const UUID_RE = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;

function validateTreeId(treeId: string): void {
  if (!UUID_RE.test(treeId)) {
    throw new Error(`Invalid treeId format: ${treeId}`);
  }
}
```

**Step 2: Call at sandbox path construction**

At line 625:
```typescript
validateTreeId(treeId);
const sandboxDir = path.join(sandboxBase, treeId);
```

At line 1139:
```typescript
validateTreeId(treeId);
const sandboxDir = path.join(sandboxBase, treeId);
```

**Step 3: Commit**
```bash
git add src/bot/hermesBridge.ts
git commit -m "security: validate treeId as UUID before path.join"
```

### Task 0.2: Fix SSE parser to accept data: without space (W12)

**Files:**
- Modify: `src/bot/hermesBridge.ts:1288`

**Step 1: Change condition**
```typescript
// Before
if (!line.startsWith("data: ")) continue;

// After
if (!line.startsWith("data:")) continue;
const payload = line.slice(5).trimStart(); // handles both "data: " and "data:"
```

**Step 2: Commit**
```bash
git add src/bot/hermesBridge.ts
git commit -m "fix: accept SSE data: without space per spec"
```

---

## Phase 1 — File Decomposition (2h, the "code judo" move)

Split `hermesBridge.ts` into `src/bot/hermesBridge/` directory. This is the highest-impact structural change. Handles C1, C2 (duplication disappears), C10 (duplication disappears), W6 (god function shrinks), W14 (inconsistent path.join).

### Task 1.0: Create directory and index

**Files:**
- Create: `src/bot/hermesBridge/index.ts`

```typescript
export { routeToHermes } from "./route";
export { shouldAriRespond } from "./decision-filter";
export type { HermesBridgeResponse, ShouldRespondResult, ChatMessage } from "./types";
export { conversationWindows } from "./conversation-window";
export { sendTelegramMessage } from "./telegram-sender";
```

Commit:
```bash
mkdir -p src/bot/hermesBridge
git add src/bot/hermesBridge/index.ts
git commit -m "refactor: create hermesBridge/ directory with index"
```

### Task 1.1: Extract types

**Files:**
- Create: `src/bot/hermesBridge/types.ts`

Move from `hermesBridge.ts`:
- `HermesBridgeResponse`
- `ShouldRespondResult`
- `ChatMessage`
- `RecentMessage` (internal)
- `CollectedMessage` (internal)
- `WindowState`

```bash
git add src/bot/hermesBridge/types.ts
git commit -m "refactor: extract hermesBridge types"
```

### Task 1.2: Extract ConversationWindow

**Files:**
- Create: `src/bot/hermesBridge/conversation-window.ts`

Move `ConversationWindow` class + `conversationWindows` singleton. No logic changes.

### Task 1.3: Extract history module

**Files:**
- Create: `src/bot/hermesBridge/history.ts`

Move `collectRecentMessages`, `getChatHistory`, `summarizeHistory`, `compressHistory`, `agentsMdCache`, `getAgentsMd`.

### Task 1.4: Extract decision filter

**Files:**
- Create: `src/bot/hermesBridge/decision-filter.ts`

Move `shouldAriRespond`, `scanForKeywords`, `scanForKeywordMatch`, `shouldAriRespondLocal`, `ENGAGEMENT_KEYWORDS`.

### Task 1.5: Extract system prompt builder

**Files:**
- Create: `src/bot/hermesBridge/system-prompt.ts`

Move `buildSystemPrompt`, `checkKanbanCompletions`, `spawnHermesShow`, `taskCounters`.

### Task 1.6: Extract routeToHermes (core)

**Files:**
- Create: `src/bot/hermesBridge/route.ts`

Move `routeToHermes`, `enforcePrefix`, `addMultiTreePrefix` (new helper — deduplicates C2/C10 from the start).

### Task 1.7: Extract telegram sender

**Files:**
- Create: `src/bot/hermesBridge/telegram-sender.ts`

Move `sendTelegramMessage`, `splitAtBoundary`, `TELEGRAM_MAX_CHARS`.

### Task 1.8: Update imports in original file

**Files:**
- Modify: `src/bot/hermesBridge.ts` → becomes re-export-only, then delete or keep as deprecated.

```typescript
// Deprecated: use src/bot/hermesBridge/index.ts instead
export * from "./hermesBridge/index";
```

### Task 1.9: Update all consumers

**Files:**
- Find all imports of `from "../bot/hermesBridge"` or `from "./hermesBridge"` in the codebase
- Update to `from "../bot/hermesBridge/index"` or just `from "../bot/hermesBridge"` (barrel)

```bash
grep -rn "from.*hermesBridge" src/ --include="*.ts" | grep -v hermesBridge/
```

Update each import. Verify with `npx tsc --noEmit`.

### Task 1.10: Full test sweep

```bash
npx tsc --noEmit          # type check
npm test 2>&1 | tail -20   # run tests
```

---

## Phase 2 — routeToHermes Fire-and-Forget + DB Fixes (1h)

Handles C2 (duplication), C9 (truncation), W7 (blocking awaits), W11 (orphan messages), W19 (blocking awaits).

### Task 2.1: Extract addMultiTreePrefix helper (fixes C2, C10)

**Files:**
- Create in `src/bot/hermesBridge/route.ts`:

```typescript
async function addMultiTreePrefix(
  content: string,
  treeId: string | null,
  chatId: number | undefined,
  prisma: any,
): Promise<string> {
  if (chatId === undefined || !treeId) return content;
  try {
    const treeCount = await prisma.tree.count({
      where: { telegramChatId: String(chatId) },
    });
    if (treeCount > 1) {
      const tree = await prisma.tree.findUnique({
        where: { id: treeId },
        select: { name: true, icono: true },
      });
      if (tree?.name) {
        const icon = tree.icono || "";
        const prefix = `${icon} ${tree.name}`.trim();
        return `- ${prefix}:\n\n${content}`;
      }
    }
  } catch { /* non-critical */ }
  return content;
}
```

Replace both occurrences (happy path and catch path) with `accumulatedContent = await addMultiTreePrefix(accumulatedContent, treeId, chatId, prisma);`

### Task 2.2: Fire-and-forget daily log + DB persist (W7, W19)

**Files:**
- Modify: `src/bot/hermesBridge/route.ts`

Change blocking awaits to fire-and-forget:

```typescript
// Before (blocking)
const [{ appendToDailyLog }, { prisma: p }] = await Promise.all([...]);
appendToDailyLog(...);
await (p as any).chatMessage.create({...});

// After (fire-and-forget)
void (async () => {
  try {
    const [{ appendToDailyLog }, { prisma: p }] = await Promise.all([
      import("../lib/dailyLog"),
      import("../index"),
    ]);
    appendToDailyLog(treeId, new Date(), "Ari", accumulatedContent, false, "assistant");
    // ... dbUserId resolution ...
    await (p as any).chatMessage.create({
      data: {
        userId: dbUserId2,
        treeId,
        role: "assistant",
        content: accumulatedContent.slice(0, ASSISTANT_MESSAGE_MAX_CHARS),
      },
    });
  } catch (err: any) {
    console.error(`[hermesBridge] Failed to persist assistant response: ${err?.message || err}`);
  }
})();
```

### Task 2.3: Move user persist AFTER assistant response (W11)

**Files:**
- Modify: `src/bot/hermesBridge/route.ts`

Move the user message persistence (lines 1172-1195) to AFTER the assistant message persistence, inside the same fire-and-forget block. This ensures no orphaned user messages.

### Task 2.4: Increase ASSISTANT_MESSAGE_MAX_CHARS or use TEXT column (C9)

**Files:**
- Modify: `src/bot/hermesBridge/route.ts`

```typescript
const ASSISTANT_MESSAGE_MAX_CHARS = 8000; // was 2000 — matches Telegram's ~4096 * 2 for split messages
```

If DB schema uses `VARCHAR(2000)`, migrate to `TEXT`:
```sql
ALTER TABLE ChatMessage MODIFY COLUMN content TEXT;
```

---

## Phase 3 — Robustez (1h)

Handles C3 (hardcoded path), C4 (sudo), C5 (N+1 queries), C6 (SSE buffer limit), C7 (hardcoded Spanish errors), W8 (silent kanban failures), W16 (master key for summary).

### Task 3.1: Resolve Hermes binary dynamically (C3)

**Files:**
- Modify: `src/bot/hermesBridge/system-prompt.ts`

```typescript
const hermesBin = process.env.HERMES_BIN || "hermes"; // use PATH
```

### Task 3.2: Remove sudo, verify permissions at startup (C4)

**Files:**
- Modify: `src/bot/hermesBridge/system-prompt.ts`

```typescript
function spawnHermesShow(taskId: string): Promise<string> {
  const bin = process.env.HERMES_BIN || "hermes";
  return new Promise((resolve, reject) => {
    const child = spawn(bin, ["kanban", "show", taskId, "--json"], {
      stdio: ["ignore", "pipe", "pipe"],
      timeout: 30_000,
    });
    // ... rest unchanged
  });
}
```

Add startup check in `src/bot/hermesBridge/index.ts`:
```typescript
import { execSync } from "child_process";
try {
  execSync("hermes kanban --help", { timeout: 5000 });
} catch {
  console.error("[hermesBridge] WARNING: 'hermes' CLI not found. checkKanbanCompletions will fail.");
}
```

### Task 3.3: Batch buildSystemPrompt queries (C5)

**Files:**
- Modify: `src/bot/hermesBridge/system-prompt.ts`

```typescript
// Before: 6+ sequential queries
const tree = await prisma.tree.findUnique(...);
const needs = await prisma.need.findMany(...);
const members = await prisma.treeMember.findMany(...);
const todos = await prisma.todo.findMany(...);
const childTrees = await prisma.tree.findMany(...);

// After: single transaction
const [tree, needs, members, todos, childTrees] = await prisma.$transaction([
  prisma.tree.findUnique({ where: { id: treeId }, select: { ... } }),
  prisma.need.findMany({ where: { treeId, status: "OPEN" }, ... }),
  prisma.treeMember.findMany({ where: { treeId, status: "ACTIVE" }, ... }),
  prisma.todo.findMany({ where: { treeId, status: "PENDING" }, ... }),
  prisma.tree.findMany({ where: { parentTreeId: treeId }, ... }),
]);
```

For ancestor chain, use recursive raw query instead of while-loop:
```sql
WITH RECURSIVE ancestors AS (
  SELECT id, name, icono, parentTreeId FROM Tree WHERE id = ?
  UNION ALL
  SELECT t.id, t.name, t.icono, t.parentTreeId FROM Tree t
  JOIN ancestors a ON t.id = a.parentTreeId
)
SELECT * FROM ancestors WHERE id != ?;
```

### Task 3.4: Add SSE buffer limit (C6)

**Files:**
- Modify: `src/bot/hermesBridge/route.ts`

```typescript
const MAX_RESPONSE_CHARS = maxTokens * 4; // ~4 chars per token
let accumulatedContent = "";

// In the stream loop:
if (delta) {
  accumulatedContent += delta;
  if (accumulatedContent.length > MAX_RESPONSE_CHARS) {
    console.warn(`[hermesBridge] Response exceeded ${MAX_RESPONSE_CHARS} chars — truncating`);
    accumulatedContent = accumulatedContent.slice(0, MAX_RESPONSE_CHARS);
    streamDone = true;
    break;
  }
}
```

### Task 3.5: Localize error messages (C7, W5)

**Files:**
- Modify: `src/bot/hermesBridge/route.ts`

```typescript
const ERROR_MESSAGES: Record<string, Record<string, string>> = {
  timeout: {
    es: "⚠️ El servidor de IA no respondió a tiempo...",
    en: "⚠️ The AI server didn't respond in time...",
    pt: "⚠️ O servidor de IA não respondeu a tempo...",
  },
  server_error: {
    es: "⚠️ Error del servidor de IA ({status})...",
    en: "⚠️ AI server error ({status})...",
    pt: "⚠️ Erro do servidor de IA ({status})...",
  },
  empty_response: {
    es: "⚠️ Procesé tu solicitud pero no pude generar una respuesta completa...",
    en: "⚠️ I processed your request but couldn't generate a complete response...",
    pt: "⚠️ Processei sua solicitação mas não consegui gerar uma resposta completa...",
  },
};

function getErrorMessage(treeId: string | null, key: string, params?: Record<string, string>): string {
  const lang = treeLanguageCache.get(treeId ?? "") ?? "es"; // cache tree language
  let msg = ERROR_MESSAGES[key]?.[lang] ?? ERROR_MESSAGES[key]?.es ?? "";
  if (params) {
    for (const [k, v] of Object.entries(params)) msg = msg.replace(`{${k}}`, v);
  }
  return msg;
}
```

### Task 3.6: Add kanban failure alert (W8, W18)

**Files:**
- Modify: `src/bot/hermesBridge/system-prompt.ts`

In `checkKanbanCompletions`, on `spawnHermesShow` failure, write to a dead-letter file:
```typescript
} catch {
  // Write to dead-letter log so we don't silently lose tasks
  const dlqPath = path.join(sandboxDir, "kanban_dlq.json");
  fs.appendFileSync(dlqPath, JSON.stringify({ task_id: entry.task_id, error: "spawn failed", timestamp: new Date().toISOString() }) + "\n");
  remaining.push(entry);
}
```

And in `routeToHermes`, after `checkKanbanCompletions`, check for DLQ:
```typescript
const dlqPath = path.join(sandboxDir, "kanban_dlq.json");
if (fs.existsSync(dlqPath)) {
  systemPrompt += `\n\n⚠️ Algunas tareas Kanban no pudieron verificarse. Revisar kanban_dlq.json en el sandbox.`;
}
```

### Task 3.7: Use derived key for summarizeHistory (W16)

**Files:**
- Modify: `src/bot/hermesBridge/history.ts`

```typescript
async function summarizeHistory(chatHistory: ChatMessage[], treeId: string): Promise<string | null> {
  // Use derived key instead of master key
  const masterKey = process.env.HERMES_API_SERVER_KEY ?? "";
  const apiKey = masterKey && treeId
    ? crypto.createHmac("sha256", masterKey).update(treeId).digest("hex")
    : masterKey;
  // ...
}
```

---

## Phase 4 — Consistencia (45 min)

Handles W13 (API_SERVER_KEY extraction), W14 (path.join consistency), W15 (SSE non-streaming detection), W17 (dead code).

### Task 4.1: Extract getHermesApiKey helper (W13)

**Files:**
- Create in `src/bot/hermesBridge/`:

```typescript
export function getHermesApiKey(treeId?: string | null): string {
  const masterKey = process.env.HERMES_API_SERVER_KEY ?? "";
  if (treeId && masterKey) {
    return crypto.createHmac("sha256", masterKey).update(treeId).digest("hex");
  }
  return masterKey || process.env.HERMES_SUPPORT_API_KEY || "";
}
```

Replace all 3 occurrences (summarizeHistory, shouldAriRespond, routeToHermes).

### Task 4.2: SSE non-streaming early break (W15)

**Files:**
- Modify: `src/bot/hermesBridge/route.ts`

```typescript
// After JSON.parse:
const msg = parsed?.choices?.[0]?.message?.content;
if (msg) {
  accumulatedContent = msg; // full response in one chunk
  streamDone = true;
  break;
}
const delta = parsed?.choices?.[0]?.delta?.content;
if (delta) accumulatedContent += delta;
```

### Task 4.3: Evaluate removing collectRecentMessages (W17)

**Files:**
- Review: `src/bot/hermesBridge/history.ts`

Check if `collectRecentMessages` (Telethon fallback) is ever hit in production logs:
```bash
grep "Telethon fallback" logs/*.log | wc -l
```

If zero hits in 30 days, remove the function and the `TELEGRAM_API_ID` / `TELEGRAM_API_HASH` env var dependency. If it's needed, add a metric counter.

---

## Phase 5 — Pulido (30 min)

Handles S13 (configurable keywords), S14 (deduplicate imports), S15 (simplify abort), S16 (named constant).

### Task 5.1: Load keywords from sandbox (S13)

**Files:**
- Modify: `src/bot/hermesBridge/decision-filter.ts`

```typescript
async function loadKeywords(sandboxDir: string): Promise<RegExp[]> {
  const kwPath = path.join(sandboxDir, "keywords.json");
  if (fs.existsSync(kwPath)) {
    try {
      const custom = JSON.parse(fs.readFileSync(kwPath, "utf-8"));
      return custom.map((s: string) => new RegExp(s, "i"));
    } catch { /* fall through to defaults */ }
  }
  return ENGAGEMENT_KEYWORDS; // built-in defaults
}
```

### Task 5.2: Deduplicate prisma import (S14)

**Files:**
- Modify: `src/bot/hermesBridge/route.ts`

```typescript
export async function routeToHermes(...): Promise<HermesBridgeResponse | null> {
  // Single import at the top
  const { prisma } = await import("../index");
  // Remove duplicate imports at lines 1175 and 1349
}
```

### Task 5.3: Simplify timeout (S15)

**Files:**
- Modify: `src/bot/hermesBridge/route.ts`

Remove `abortPromise` + `Promise.race`. Just use `setTimeout`:
```typescript
const controller = new AbortController();
const timeoutId = setTimeout(() => controller.abort(), 900_000);
// ... stream loop ...
clearTimeout(timeoutId);
```

`reader.read()` will naturally reject with `AbortError` when the signal fires via `fetch` — no need for manual abort promise.

### Task 5.4: Named constant for max chars (S16)

**Files:**
- Modify: `src/bot/hermesBridge/route.ts`

```typescript
const ASSISTANT_MESSAGE_MAX_CHARS = 8000;
```

Replace all `slice(0, 2000)` with `slice(0, ASSISTANT_MESSAGE_MAX_CHARS)`.

---

## Acceptance Criteria

- [ ] `hermesBridge.ts` is split into `src/bot/hermesBridge/` with 6-7 focused files, all <400 lines
- [ ] `npx tsc --noEmit` passes
- [ ] All existing tests pass
- [ ] `treeId` validated as UUID before any path.join
- [ ] SSE parser handles `data:` with and without space
- [ ] `addMultiTreePrefix` deduplicates the 15-line block
- [ ] Fire-and-forget on daily log + DB persist
- [ ] User message persisted AFTER assistant (no orphans)
- [ ] `ASSISTANT_MESSAGE_MAX_CHARS` raised to 8000
- [ ] Hermes binary resolved via PATH/env, not hardcoded
- [ ] `sudo` removed from kanban check
- [ ] `buildSystemPrompt` queries batched in `$transaction`
- [ ] SSE stream has hard buffer limit
- [ ] Error messages localized by tree language
- [ ] Kanban dead-letter queue for failed checks
- [ ] `getHermesApiKey` centralizes all 3 auth patterns
- [ ] Keywords loadable per-tree from sandbox

## Execution Strategy

Phase 0 ships immediately (2 hotfixes, no behavior change).
Phase 1 is the big refactor — delegate each task to Kanban workers in parallel where possible.
Phases 2-5 are sequential fixes on the new module structure.

**Estimated total: 5 hours of focused work across all phases.**
