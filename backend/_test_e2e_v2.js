/**
 * E2E Verification v2: human-worker + ExternalTask + Kanban webhook
 * Tests: CREATE(dispatcher-simulated) → CLAIM → DELIVER → APPROVE → WEBHOOK → KANBAN COMPLETE
 */
const jwt = require('jsonwebtoken');
const { execSync } = require('child_process');
const { PrismaClient } = require('@prisma/client');
require('dotenv').config();

const BASE = 'http://localhost:3100';
const JWT_SECRET = process.env.JWT_SECRET;
const INTERNAL_API_KEY = process.env.INTERNAL_API_KEY;
const TREE_ID = 'd48bd81b-3172-4687-8327-f6f743dac72d';
const WORKER_ID = '8d93fc6c-f486-49a9-9849-b58bc9201167';

function signToken(payload) { return jwt.sign(payload, JWT_SECRET); }

async function fetchJSON(url, options = {}) {
  const res = await fetch(url, { ...options, headers: { 'Content-Type': 'application/json', ...options.headers } });
  const body = await res.json();
  if (!res.ok) throw new Error(`${res.status} ${url}: ${JSON.stringify(body)}`);
  return body;
}

async function main() {
  console.log('═══ E2E Human-Worker + ExternalTask + Kanban Webhook v2 ═══\n');

  const systemToken = signToken({ id: 'ari', role: 'SYSTEM' });
  const sysAuth = { Authorization: `Bearer ${systemToken}` };
  const workerToken = signToken({ id: WORKER_ID });
  const workerAuth = { Authorization: `Bearer ${workerToken}` };

  // ── 0. Setup ───────────────────────────────────────────────────────────────
  const prisma = new PrismaClient();
  await prisma.user.update({ where: { id: WORKER_ID }, data: { availableForHire: true } });
  await prisma.$disconnect();

  const tree = await fetchJSON(`${BASE}/api/trees/${TREE_ID}`, { headers: sysAuth });
  console.log(`Tree: ${tree.name}`);

  // ── 1. Create Kanban task ──────────────────────────────────────────────────
  const kanbanOut = execSync(
    `hermes kanban create 'TEST-E2E-v2: dispatcher simulation' --assignee backend-eng --body 'E2E v2 test' --json`,
    { encoding: 'utf-8', timeout: 10000 }
  ).trim();
  const kanbanTask = JSON.parse(kanbanOut);
  console.log(`Kanban task: ${kanbanTask.id}`);

  // ── 2. Create ExternalTask (simulating dispatcher POST) ────────────────────
  const extTask = await fetchJSON(`${BASE}/api/external-tasks`, {
    method: 'POST', headers: sysAuth,
    body: JSON.stringify({
      treeId: TREE_ID, title: 'TEST-E2E-v2', description: 'E2E verification',
      skills: ['test'], budget: 5000, currency: 'CLP',
      kanbanTaskId: kanbanTask.id, kanbanBoard: 'main',
    }),
  });
  console.log(`ExternalTask: ${extTask.id} status=${extTask.status}`);

  // ── 3. CLAIM ───────────────────────────────────────────────────────────────
  const claimed = await fetchJSON(`${BASE}/api/external-tasks/${extTask.id}/claim`, { method: 'POST', headers: workerAuth });
  console.log(`Claim: ${claimed.status}`);

  // ── 4. DELIVER ─────────────────────────────────────────────────────────────
  const fd = new FormData();
  fd.append('deliverable', new Blob(['E2E evidence'], { type: 'text/plain' }), 'evidence.txt');
  const dRes = await fetch(`${BASE}/api/external-tasks/${extTask.id}/deliver`, { method: 'POST', headers: workerAuth, body: fd });
  const delivered = await dRes.json();
  if (!dRes.ok) throw new Error(`Deliver: ${JSON.stringify(delivered)}`);
  console.log(`Deliver: ${delivered.status}`);

  // ── 5. APPROVE ─────────────────────────────────────────────────────────────
  console.log('Approve (triggers webhook)...');
  const approved = await fetchJSON(`${BASE}/api/external-tasks/${extTask.id}/approve`, { method: 'POST', headers: sysAuth });
  console.log(`Approve: ${approved.status}`);

  // ── 6. Wait for async webhook ──────────────────────────────────────────────
  console.log('Waiting for webhook (async)...');
  await new Promise(r => setTimeout(r, 3000));

  // ── 7. Check Kanban ────────────────────────────────────────────────────────
  const kanbanShow = execSync(`hermes kanban show ${kanbanTask.id} --json`, { encoding: 'utf-8', timeout: 10000 }).trim();
  const ks = JSON.parse(kanbanShow);
  const kanbanStatus = ks.task?.status || ks.status;
  const kanbanSummary = ks.latest_summary || '';

  console.log(`\n═══ RESULTS ═══`);
  const checks = [
    ['ExternalTask created', extTask.status === 'OPEN'],
    ['Claim', claimed.status === 'CLAIMED'],
    ['Deliver', delivered.status === 'DELIVERED'],
    ['Approve', approved.status === 'APPROVED'],
    ['Kanban completed', kanbanStatus === 'done' || kanbanStatus === 'archived'],
    ['Kanban summary matches', kanbanSummary.includes('Approved via ExternalTask')],
  ];

  let allPassed = true;
  for (const [name, ok] of checks) {
    console.log(`  ${ok ? 'PASS' : 'FAIL'}: ${name}`);
    if (!ok) allPassed = false;
  }
  console.log(`Kanban status: ${kanbanStatus}`);
  console.log(`Kanban summary: "${kanbanSummary}"`);

  // ── Cleanup ────────────────────────────────────────────────────────────────
  if (kanbanStatus !== 'done' && kanbanStatus !== 'archived') {
    execSync(`hermes kanban archive ${kanbanTask.id}`, { encoding: 'utf-8', timeout: 5000 });
  }

  console.log(`\n${allPassed ? '═══ ALL PASSED ═══' : '═══ FAILURES DETECTED ═══'}`);
  process.exit(allPassed ? 0 : 1);
}

main().catch(err => { console.error('FAIL:', err.message); process.exit(1); });
