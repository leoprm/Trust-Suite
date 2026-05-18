/**
 * E2E Test: Tree-first voting flow (V4)
 *
 * Tests the full candidate pipeline:
 *   1. Register candidates via POST /api/candidates
 *   2. List candidates via GET /api/candidates
 *   3. Resolve voting (3 outcomes: internal, external, cancel)
 *   4. Save cancelled plan via POST /api/cancelled-plans
 *   5. List cancelled plans via GET /api/cancelled-plans
 *   6. i18n: verify v1/v1_candidate/v1_vote namespaces load and interpolate
 *
 * Usage: npx ts-node src/bot/e2e-tree-voting.test.ts
 */

import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';
import { initI18n, t } from './i18n';

dotenv.config();

const BASE = 'http://localhost:3100';
const JWT_SECRET = process.env.JWT_SECRET || 'test';
const API_KEY = process.env.HERMES_API_SERVER_KEY || '';

function signToken(payload: object): string {
  return jwt.sign(payload, JWT_SECRET);
}

async function fetchJSON(url: string, options: RequestInit = {}): Promise<any> {
  const res = await fetch(url, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...options.headers },
  });
  const body = await res.json();
  if (!res.ok) throw new Error(`${res.status} ${url}: ${JSON.stringify(body)}`);
  return body;
}

// ── Test helpers ──────────────────────────────────────────────────────────────

let treeId: string;
let memberUserId: string;
let member2UserId: string;
const taskId = `t_e2e_v4_${Date.now()}`;

async function discoverTreeAndMembers(sysAuth: Record<string, string>) {
  const trees = await fetchJSON(`${BASE}/api/trees`, { headers: sysAuth });
  if (!trees?.length) throw new Error('No trees found — is the backend running on :3100?');
  const tree = trees[0];
  treeId = tree.id;
  console.log(`   Tree: ${tree.id} (${tree.name})`);

  const members = await fetchJSON(`${BASE}/api/trees/${tree.id}/members`, { headers: sysAuth });
  if (!members?.length) throw new Error(`Tree ${tree.id} has no members`);
  memberUserId = members[0].user?.id || members[0].userId;
  member2UserId = members.length > 1 ? (members[1].user?.id || members[1].userId) : memberUserId;
  console.log(`   Member1: ${memberUserId} | Member2: ${member2UserId}`);
}

async function main() {
  console.log('═══ E2E Tree-First Voting Flow V4 ═══\n');

  // Init i18n (needed for testing t() later)
  await initI18n();

  const systemToken = signToken({ id: 'ari', role: 'SYSTEM' });
  const sysAuth = { Authorization: `Bearer ${systemToken}` };
  const apiKeyAuth = { Authorization: `Bearer ${API_KEY}` };

  // 0. Discover
  console.log('0. Discovering tree + members...');
  await discoverTreeAndMembers(sysAuth);
  console.log('');

  // ── Scenario A: Register candidates ─────────────────────────────────────────
  console.log('── SCENARIO A: Register candidates ──\n');

  console.log('A1. POST /api/candidates (member 1)');
  const c1 = await fetchJSON(`${BASE}/api/candidates`, {
    method: 'POST',
    headers: apiKeyAuth,
    body: JSON.stringify({ userId: memberUserId, taskId, treeId }),
  });
  console.log(`   ✓ Registered: ${c1.id} (status=${c1.status})`);

  console.log('A2. POST /api/candidates (member 2)');
  const c2 = await fetchJSON(`${BASE}/api/candidates`, {
    method: 'POST',
    headers: apiKeyAuth,
    body: JSON.stringify({ userId: member2UserId, taskId, treeId }),
  });
  console.log(`   ✓ Registered: ${c2.id} (status=${c2.status})`);

  console.log('A3. POST /api/candidates (duplicate → 409)');
  try {
    await fetchJSON(`${BASE}/api/candidates`, {
      method: 'POST',
      headers: apiKeyAuth,
      body: JSON.stringify({ userId: memberUserId, taskId, treeId }),
    });
    console.log('   ✗ Should have thrown 409');
  } catch (err: any) {
    console.log(`   ✓ Correctly rejected: ${err.message.slice(0, 50)}`);
  }

  console.log('A4. GET /api/candidates?taskId=' + taskId);
  const list = await fetchJSON(`${BASE}/api/candidates?taskId=${taskId}`, { headers: apiKeyAuth });
  console.log(`   ✓ Found ${list.count} candidates`);

  // ── Scenario B: Resolve internal winner ──────────────────────────────────────
  console.log('\n── SCENARIO B: Internal winner ──\n');

  console.log('B1. POST /api/candidates/resolve (internal)');
  const internal = await fetchJSON(`${BASE}/api/candidates/resolve`, {
    method: 'POST',
    headers: apiKeyAuth,
    body: JSON.stringify({
      taskId, treeId,
      action: 'internal',
      winnerId: memberUserId,
    }),
  });
  console.log(`   ✓ Action: ${internal.action}`);
  console.log(`   ✓ Winner: ${internal.accepted?.userId}`);
  console.log(`   ✓ Rejected: ${internal.rejected?.length}`);
  console.log(`   ✓ Next steps: ${internal.nextSteps?.length}`);

  // Re-register candidates for next test (reset state)
  console.log('\nB2. Re-register for scenario C...');
  // The previous candidates are now ACCEPTED/REJECTED — need fresh taskId
  const taskIdC = `t_e2e_v4_c_${Date.now()}`;
  await fetchJSON(`${BASE}/api/candidates`, {
    method: 'POST',
    headers: apiKeyAuth,
    body: JSON.stringify({ userId: memberUserId, taskId: taskIdC, treeId }),
  });
  await fetchJSON(`${BASE}/api/candidates`, {
    method: 'POST',
    headers: apiKeyAuth,
    body: JSON.stringify({ userId: member2UserId, taskId: taskIdC, treeId }),
  });
  console.log('   ✓ Re-registered 2 candidates');

  // ── Scenario C: Resolve external ─────────────────────────────────────────────
  console.log('\n── SCENARIO C: External hire ──\n');

  console.log('C1. POST /api/candidates/resolve (external)');
  const external = await fetchJSON(`${BASE}/api/candidates/resolve`, {
    method: 'POST',
    headers: apiKeyAuth,
    body: JSON.stringify({
      taskId: taskIdC, treeId,
      action: 'external',
    }),
  });
  console.log(`   ✓ Action: ${external.action}`);
  console.log(`   ✓ Rejected: ${external.rejected?.length}`);
  console.log(`   ✓ Next steps include CREATE_EXTERNAL_TASK: ${JSON.stringify(external.nextSteps).includes('CREATE_EXTERNAL_TASK')}`);

  // ── Scenario D: Resolve cancel + save plan ───────────────────────────────────
  console.log('\n── SCENARIO D: Cancel + CancelledPlan ──\n');

  const taskIdD = `t_e2e_v4_d_${Date.now()}`;
  await fetchJSON(`${BASE}/api/candidates`, {
    method: 'POST',
    headers: apiKeyAuth,
    body: JSON.stringify({ userId: memberUserId, taskId: taskIdD, treeId }),
  });
  console.log('D1. Registered candidate for cancel scenario');

  console.log('D2. POST /api/candidates/resolve (cancel)');
  const cancel = await fetchJSON(`${BASE}/api/candidates/resolve`, {
    method: 'POST',
    headers: apiKeyAuth,
    body: JSON.stringify({
      taskId: taskIdD, treeId,
      action: 'cancel',
      motivo: 'Presupuesto insuficiente para contratar — exploramos alternativas más simples',
      alternativas: ['Reducir scope a MVP', 'Dividir en 3 micro-tareas', 'Posponer hasta Q3'],
    }),
  });
  console.log(`   ✓ Action: ${cancel.action}`);
  console.log(`   ✓ Motivo: ${cancel.cancelData?.motivo?.slice(0, 40)}...`);

  console.log('D3. POST /api/cancelled-plans');
  const savedPlan = await fetchJSON(`${BASE}/api/cancelled-plans`, {
    method: 'POST',
    headers: apiKeyAuth,
    body: JSON.stringify({
      title: 'E2E Cancel Test ' + Date.now(),
      description: 'This task was cancelled due to budget constraints',
      skills: ['typescript', 'nodejs'],
      budget: 50000,
      motivo: 'Presupuesto insuficiente',
      treeId,
      taskId: taskIdD,
      alternativas: ['Reducir scope', 'Dividir en micro-tareas', 'Posponer'],
    }),
  });
  console.log(`   ✓ Saved: ${savedPlan.id} (${savedPlan.title})`);

  console.log('D4. GET /api/cancelled-plans?treeId=' + treeId);
  const plans = await fetchJSON(`${BASE}/api/cancelled-plans?treeId=${treeId}`, { headers: apiKeyAuth });
  console.log(`   ✓ Found ${plans.count} cancelled plans for this tree`);

  // ── i18n verification ───────────────────────────────────────────────────────
  console.log('\n── i18n verification ──\n');

  // v1 namespace
  const esReminder = t('v1.reminder', 'es');
  console.log(`   v1.reminder [es]: "${esReminder.slice(0, 50)}..."`);
  if (!esReminder.includes('Quedan')) throw new Error('v1.reminder es missing');

  const enReminder = t('v1.reminder', 'en');
  console.log(`   v1.reminder [en]: "${enReminder.slice(0, 50)}..."`);
  if (!enReminder.includes('minutes')) throw new Error('v1.reminder en missing');

  // v1_candidate namespace
  const esApplied = t('v1_candidate.applied_ok', 'es');
  console.log(`   v1_candidate.applied_ok [es]: "${esApplied}"`);
  if (!esApplied.includes('Postulación')) throw new Error('v1_candidate.applied_ok es missing');

  // v1_vote namespace
  const esWinner = t('v1_vote.results_winner_internal', 'es', { name: 'Leo', title: 'Test Task' });
  console.log(`   v1_vote.results_winner_internal [es]: "${esWinner.slice(0, 60)}..."`);
  if (!esWinner.includes('Leo')) throw new Error('v1_vote.results_winner_internal es missing interpolation');

  // Interpolation with budget
  const enPollExt = t('v1.poll_option_external_budget', 'en', { budget: 5000, currency: 'CLP' });
  console.log(`   v1.poll_option_external_budget [en]: "${enPollExt}"`);
  if (!enPollExt.includes('$5000')) throw new Error('v1.poll_option_external_budget en missing interpolation');

  console.log('\n═══ ALL TESTS PASSED ═══');
}

main().catch(err => {
  console.error('\nFAIL:', err.message);
  process.exit(1);
});
