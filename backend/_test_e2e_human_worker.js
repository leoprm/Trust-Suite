/**
 * E2E Verification: human-worker + ExternalTask + Kanban webhook
 * 
 * Tests the FULL pipeline: CREATE → CLAIM → DELIVER → APPROVE → WEBHOOK → KANBAN COMPLETE
 * 
 * Usage: node _test_e2e_human_worker.js
 */
const jwt = require('jsonwebtoken');
const { execSync } = require('child_process');
require('dotenv').config();

const BASE = 'http://localhost:3100';
const JWT_SECRET = process.env.JWT_SECRET;
const INTERNAL_API_KEY = process.env.INTERNAL_API_KEY;
const TREE_ID = 'd48bd81b-3172-4687-8327-f6f743dac72d';
const WORKER_ID = '8d93fc6c-f486-49a9-9849-b58bc9201167'; // integration_test

function signToken(payload) {
  return jwt.sign(payload, JWT_SECRET);
}

async function fetchJSON(url, options = {}) {
  const res = await fetch(url, { ...options, headers: { 'Content-Type': 'application/json', ...options.headers } });
  const body = await res.json();
  if (!res.ok) throw new Error(`${res.status} ${url}: ${JSON.stringify(body)}`);
  return body;
}

async function main() {
  console.log('═══ E2E Human-Worker + ExternalTask + Kanban Webhook ═══\n');

  const systemToken = signToken({ id: 'ari', role: 'SYSTEM' });
  const sysAuth = { Authorization: `Bearer ${systemToken}` };
  const workerToken = signToken({ id: WORKER_ID });
  const workerAuth = { Authorization: `Bearer ${workerToken}` };

  // ── 0. Verify tree & enable availableForHire ───────────────────────────────
  console.log('0. Setup...');
  const tree = await fetchJSON(`${BASE}/api/trees/${TREE_ID}`, { headers: sysAuth });
  console.log(`   Tree: ${tree.name}`);

  // Enable availableForHire on the test user via a direct Prisma approach
  // Since there's no public endpoint for this, we'll use a quick inline script
  const { PrismaClient } = require('@prisma/client');
  const prisma = new PrismaClient();
  await prisma.user.update({
    where: { id: WORKER_ID },
    data: { availableForHire: true },
  });
  await prisma.$disconnect();
  console.log(`   User ${WORKER_ID}: availableForHire=true`);

  // ── 1. Create Kanban task ──────────────────────────────────────────────────
  console.log('\n1. Creating Kanban task...');
  const kanbanOutput = execSync(
    `hermes kanban create 'TEST-E2E-WEBHOOK: verify webhook completes kanban' --assignee backend-eng --body 'Test task for webhook verification' --json`,
    { encoding: 'utf-8', timeout: 10000 }
  ).trim();
  const kanbanTask = JSON.parse(kanbanOutput);
  console.log(`   Kanban task: ${kanbanTask.id}`);

  // ── 2. Create ExternalTask linked to Kanban ────────────────────────────────
  console.log('\n2. Creating ExternalTask...');
  const extTask = await fetchJSON(`${BASE}/api/external-tasks`, {
    method: 'POST',
    headers: sysAuth,
    body: JSON.stringify({
      treeId: TREE_ID,
      title: 'TEST-E2E: human-worker webhook verify',
      description: 'E2E verification — approve should trigger webhook',
      skills: ['test'],
      budget: 5000,
      currency: 'CLP',
      kanbanTaskId: kanbanTask.id,
      kanbanBoard: 'main',
    }),
  });
  console.log(`   ExternalTask: ${extTask.id} status=${extTask.status}`);

  // ── 3. Verify /available ───────────────────────────────────────────────────
  console.log('\n3. GET /available...');
  const available = await fetchJSON(`${BASE}/api/external-tasks/available`);
  const found = available.find(t => t.id === extTask.id);
  console.log(`   Found in available: ${!!found} (${available.length} total)`);

  // ── 4. CLAIM ───────────────────────────────────────────────────────────────
  console.log('\n4. CLAIM...');
  const claimed = await fetchJSON(`${BASE}/api/external-tasks/${extTask.id}/claim`, {
    method: 'POST',
    headers: workerAuth,
  });
  console.log(`   status=${claimed.status} workerId=${claimed.workerId}`);

  // ── 5. DELIVER ─────────────────────────────────────────────────────────────
  console.log('\n5. DELIVER...');
  const fd = new FormData();
  fd.append('deliverable', new Blob(['E2E verification evidence'], { type: 'text/plain' }), 'evidence.txt');
  const dRes = await fetch(`${BASE}/api/external-tasks/${extTask.id}/deliver`, {
    method: 'POST',
    headers: workerAuth,
    body: fd,
  });
  const delivered = await dRes.json();
  if (!dRes.ok) throw new Error(`Deliver failed: ${JSON.stringify(delivered)}`);
  console.log(`   status=${delivered.status}`);

  // ── 6. APPROVE — should fire webhook → Kanban complete ─────────────────────
  console.log('\n6. APPROVE (triggers webhook → Kanban complete)...');
  const approved = await fetchJSON(`${BASE}/api/external-tasks/${extTask.id}/approve`, {
    method: 'POST',
    headers: sysAuth,
  });
  console.log(`   status=${approved.status} approvedBy=${approved.approvedBy}`);

  // ── 7. Wait, then check Kanban task ────────────────────────────────────────
  console.log('\n7. Checking Kanban task status...');
  await new Promise(r => setTimeout(r, 2000));

  const kanbanShow = execSync(
    `hermes kanban show ${kanbanTask.id} --json`,
    { encoding: 'utf-8', timeout: 10000 }
  ).trim();
  const kanbanState = JSON.parse(kanbanShow);
  console.log(`   Kanban task status: ${kanbanState.status}`);

  // ── 8. Results ─────────────────────────────────────────────────────────────
  console.log('\n═══ VERIFICATION RESULTS ═══');
  
  const checks = {
    'ExternalTask created': extTask.status === 'OPEN',
    'Available listing': found !== undefined,
    'Claim works': claimed.status === 'CLAIMED',
    'Deliver works': delivered.status === 'DELIVERED',
    'Approve works': approved.status === 'APPROVED',
    'Kanban completed by webhook': kanbanState.status === 'done',
  };

  let allPassed = true;
  for (const [check, passed] of Object.entries(checks)) {
    console.log(`   ${passed ? 'PASS' : 'FAIL'}: ${check}`);
    if (!passed) allPassed = false;
  }

  console.log(`\n${allPassed ? '═══ ALL CHECKS PASSED ═══' : '═══ SOME CHECKS FAILED ═══'}`);

  // ── 9. Cleanup ─────────────────────────────────────────────────────────────
  console.log('\n9. Cleanup...');
  if (kanbanState.status !== 'done' && kanbanState.status !== 'archived') {
    try {
      execSync(`hermes kanban archive ${kanbanTask.id}`, { encoding: 'utf-8', timeout: 5000 });
      console.log(`   Kanban task archived`);
    } catch (e) {
      console.log(`   Could not archive: ${e.message}`);
    }
  } else {
    console.log(`   Kanban task ${kanbanState.status} — no cleanup needed`);
  }

  return allPassed;
}

main().catch(err => {
  console.error('\n═══ TEST FAILED ═══');
  console.error('Error:', err.message);
  process.exit(1);
});
