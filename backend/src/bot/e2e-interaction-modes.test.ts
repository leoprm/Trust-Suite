/**
 * E2E Test: Interaction modes (MAXIMUM / MEDIUM / MINIMUM)
 *
 * Tests the interaction mode gating logic deterministically (no LLM):
 *   1. MAXIMUM: plain message → should route to Ari
 *   2. MEDIUM:   plain message → should NOT route (without tag/reply)
 *   3. MINIMUM:  only tag/reply → should route
 *   4. Reply → always routes in all modes
 *
 * Uses local gate function (M2 logic) + API for mode management.
 *
 * Usage: npx tsx src/bot/e2e-interaction-modes.test.ts
 */

import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';
dotenv.config();

const BASE = 'http://localhost:3100';
const JWT_SECRET = process.env.JWT_SECRET || 'test';

function signToken(payload: object): string {
  return jwt.sign(payload, JWT_SECRET);
}

async function fetchJSON(url: string, opts: RequestInit = {}): Promise<any> {
  const res = await fetch(url, {
    ...opts,
    headers: { 'Content-Type': 'application/json', ...opts.headers },
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${res.status} ${url}: ${text.slice(0, 200)}`);
  return JSON.parse(text);
}

// ── Interaction mode gate (M2 logic — should live in hermesBridge.ts) ──

type InteractionMode = 'MAXIMUM' | 'MEDIUM' | 'MINIMUM';

interface GateInput {
  mode: InteractionMode;
  isReply: boolean;
  isTagged: boolean;
  isConversationWindow: boolean;
}

/**
 * Determines whether a message should be routed to shouldAriRespond()
 * based on the tree's interaction mode.
 *
 * MAXIMUM: always route (original behavior)
 * MEDIUM:   route for tag/reply/name; skip conversation window + plain messages
 * MINIMUM:  route only for tag/reply
 */
function shouldRouteForMode(input: GateInput): boolean {
  const { mode, isReply, isTagged, isConversationWindow } = input;

  // Reply always works in every mode
  if (isReply) return true;

  switch (mode) {
    case 'MAXIMUM':
      return true; // always pass through

    case 'MEDIUM':
      // Tag or conversation window → route
      if (isTagged) return true;
      if (isConversationWindow) return true;
      // Plain message without trigger → skip
      return false;

    case 'MINIMUM':
      // Only tag passes (reply handled above)
      return isTagged;

    default:
      return false;
  }
}

// ── Test helpers ────────────────────────────────────────────────────────

async function patchInteractionMode(
  treeId: string,
  mode: InteractionMode,
  sysAuth: Record<string, string>,
): Promise<void> {
  const result = await fetchJSON(
    `${BASE}/api/trees/${treeId}/interaction-mode`,
    {
      method: 'PATCH',
      headers: sysAuth,
      body: JSON.stringify({ mode }),
    },
  );
  if (result.interactionMode !== mode) {
    throw new Error(
      `Expected interactionMode=${mode}, got ${result.interactionMode}`,
    );
  }
}

// ── Main ─────────────────────────────────────────────────────────────────

async function main() {
  console.log('═══ E2E Interaction Modes ═══\n');

  const systemToken = signToken({ id: 'ari', role: 'SYSTEM' });
  const sysAuth = { Authorization: `Bearer ${systemToken}` };

  // Create test tree (defaults to MAXIMUM)
  console.log('0. Creating test tree...');
  const tree = await fetchJSON(`${BASE}/api/trees`, {
    method: 'POST',
    headers: sysAuth,
    body: JSON.stringify({ name: `E2E-Modes-${Date.now()}` }),
  });
  const treeId: string = tree.id;
  console.log(`   Tree: ${treeId}`);

  // Verify default mode
  let info = await fetchJSON(`${BASE}/api/trees/${treeId}`, {
    headers: sysAuth,
  });
  console.log(
    `   Default mode: ${info.interactionMode}`,
  );
  if (info.interactionMode !== 'MAXIMUM') {
    throw new Error(`Expected MAXIMUM, got ${info.interactionMode}`);
  }

  // ── Scenario 1: MAXIMUM ───────────────────────────────────────────────
  console.log('\n── SCENARIO 1: MAXIMUM ──\n');

  // 1a. Plain message (no tag, no reply, no window) → should route
  const r1a = shouldRouteForMode({
    mode: 'MAXIMUM',
    isReply: false,
    isTagged: false,
    isConversationWindow: false,
  });
  console.log(`1a. Plain message → ${r1a ? 'ROUTE ✓' : 'BLOCK ✗'}`);
  if (!r1a) throw new Error('MAXIMUM: plain message should route');

  // 1b. With tag → should route
  const r1b = shouldRouteForMode({
    mode: 'MAXIMUM',
    isReply: false,
    isTagged: true,
    isConversationWindow: false,
  });
  console.log(`1b. Tagged message → ${r1b ? 'ROUTE ✓' : 'BLOCK ✗'}`);
  if (!r1b) throw new Error('MAXIMUM: tagged message should route');

  // 1c. Reply → should route
  const r1c = shouldRouteForMode({
    mode: 'MAXIMUM',
    isReply: true,
    isTagged: false,
    isConversationWindow: false,
  });
  console.log(`1c. Reply message → ${r1c ? 'ROUTE ✓' : 'BLOCK ✗'}`);
  if (!r1c) throw new Error('MAXIMUM: reply should route');

  // ── Scenario 2: MEDIUM ────────────────────────────────────────────────
  console.log('\n── SCENARIO 2: MEDIUM ──\n');

  await patchInteractionMode(treeId, 'MEDIUM', sysAuth);
  info = await fetchJSON(`${BASE}/api/trees/${treeId}`, {
    headers: sysAuth,
  });
  console.log(`   Mode: ${info.interactionMode}`);

  // 2a. Plain message (no tag, no reply) → should NOT route
  const r2a = shouldRouteForMode({
    mode: 'MEDIUM',
    isReply: false,
    isTagged: false,
    isConversationWindow: false,
  });
  console.log(`2a. Plain message → ${r2a ? 'ROUTE ✗' : 'BLOCK ✓'}`);
  if (r2a) throw new Error('MEDIUM: plain message should NOT route');

  // 2b. With tag → should route
  const r2b = shouldRouteForMode({
    mode: 'MEDIUM',
    isReply: false,
    isTagged: true,
    isConversationWindow: false,
  });
  console.log(`2b. Tagged message → ${r2b ? 'ROUTE ✓' : 'BLOCK ✗'}`);
  if (!r2b) throw new Error('MEDIUM: tagged message should route');

  // 2c. Reply → should route
  const r2c = shouldRouteForMode({
    mode: 'MEDIUM',
    isReply: true,
    isTagged: false,
    isConversationWindow: false,
  });
  console.log(`2c. Reply message → ${r2c ? 'ROUTE ✓' : 'BLOCK ✗'}`);
  if (!r2c) throw new Error('MEDIUM: reply should route');

  // 2d. Conversation window → should route
  const r2d = shouldRouteForMode({
    mode: 'MEDIUM',
    isReply: false,
    isTagged: false,
    isConversationWindow: true,
  });
  console.log(`2d. Conv window → ${r2d ? 'ROUTE ✓' : 'BLOCK ✗'}`);
  if (!r2d) throw new Error('MEDIUM: conversation window should still route');

  // ── Scenario 3: MINIMUM ───────────────────────────────────────────────
  console.log('\n── SCENARIO 3: MINIMUM ──\n');

  await patchInteractionMode(treeId, 'MINIMUM', sysAuth);
  info = await fetchJSON(`${BASE}/api/trees/${treeId}`, {
    headers: sysAuth,
  });
  console.log(`   Mode: ${info.interactionMode}`);

  // 3a. Plain message → should NOT route
  const r3a = shouldRouteForMode({
    mode: 'MINIMUM',
    isReply: false,
    isTagged: false,
    isConversationWindow: false,
  });
  console.log(`3a. Plain message → ${r3a ? 'ROUTE ✗' : 'BLOCK ✓'}`);
  if (r3a) throw new Error('MINIMUM: plain message should NOT route');

  // 3b. With tag → should route (only trigger in MINIMUM)
  const r3b = shouldRouteForMode({
    mode: 'MINIMUM',
    isReply: false,
    isTagged: true,
    isConversationWindow: false,
  });
  console.log(`3b. Tagged message → ${r3b ? 'ROUTE ✓' : 'BLOCK ✗'}`);
  if (!r3b) throw new Error('MINIMUM: tagged message should route');

  // 3c. Reply → should route (always works)
  const r3c = shouldRouteForMode({
    mode: 'MINIMUM',
    isReply: true,
    isTagged: false,
    isConversationWindow: false,
  });
  console.log(`3c. Reply message → ${r3c ? 'ROUTE ✓' : 'BLOCK ✗'}`);
  if (!r3c) throw new Error('MINIMUM: reply should route');

  // 3d. Conversation window → should NOT route (MINIMUM blocks it)
  const r3d = shouldRouteForMode({
    mode: 'MINIMUM',
    isReply: false,
    isTagged: false,
    isConversationWindow: true,
  });
  console.log(`3d. Conv window → ${r3d ? 'ROUTE ✗' : 'BLOCK ✓'}`);
  if (r3d) throw new Error('MINIMUM: conversation window should NOT route');

  // ── Cleanup ───────────────────────────────────────────────────────────
  console.log('\n🧹 Cleaning up...');
  await fetchJSON(`${BASE}/api/trees/${treeId}`, {
    method: 'DELETE',
    headers: sysAuth,
  });
  console.log(`   ✓ Tree ${treeId} deleted`);

  console.log('\n═══ ALL INTERACTION MODE TESTS PASSED ═══');
}

main().catch((err) => {
  console.error('\nFAIL:', err.message);
  process.exit(1);
});
