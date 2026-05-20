/**
 * E2E Verification: REJECT flow → Webhook blocks Kanban
 */
const jwt = require('jsonwebtoken');
const { execSync } = require('child_process');
const { PrismaClient } = require('@prisma/client');
require('dotenv').config();

const BASE = 'http://localhost:3100';
const JWT_SECRET = process.env.JWT_SECRET;
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
  console.log('═══ E2E REJECT Flow ═══\n');

  const systemToken = signToken({ id: 'ari', role: 'SYSTEM' });
  const sysAuth = { Authorization: `Bearer ${systemToken}` };
  const workerToken = signToken({ id: WORKER_ID });
  const workerAuth = { Authorization: `Bearer ${workerToken}` };

  const prisma = new PrismaClient();
  await prisma.user.update({ where: { id: WORKER_ID }, data: { availableForHire: true } });
  await prisma.$disconnect();

  // Create Kanban task
  const kanbanOut = execSync(
    `hermes kanban create 'TEST-E2E-REJECT: verify webhook blocks kanban' --assignee backend-eng --body 'Reject test' --json`,
    { encoding: 'utf-8', timeout: 10000 }
  ).trim();
  const kanbanTask = JSON.parse(kanbanOut);
  console.log(`Kanban: ${kanbanTask.id}`);

  // Create ExternalTask
  const extTask = await fetchJSON(`${BASE}/api/external-tasks`, {
    method: 'POST', headers: sysAuth,
    body: JSON.stringify({
      treeId: TREE_ID, title: 'TEST-E2E-REJECT', description: 'Reject test',
      skills: ['test'], budget: 5000, currency: 'CLP',
      kanbanTaskId: kanbanTask.id, kanbanBoard: 'main',
    }),
  });
  console.log(`ExternalTask: ${extTask.id}`);

  // Claim → Deliver
  await fetchJSON(`${BASE}/api/external-tasks/${extTask.id}/claim`, { method: 'POST', headers: workerAuth });

  const fd = new FormData();
  fd.append('deliverable', new Blob(['evidence'], { type: 'text/plain' }), 'evidence.txt');
  await fetch(`${BASE}/api/external-tasks/${extTask.id}/deliver`, { method: 'POST', headers: workerAuth, body: fd });

  // REJECT - use worker token (worker IS tree member)
  console.log('Rejecting...');
  const rejected = await fetchJSON(`${BASE}/api/external-tasks/${extTask.id}/reject`, {
    method: 'POST', headers: workerAuth,
    body: JSON.stringify({ reason: 'Test rejection' }),
  });
  console.log(`Reject: ${rejected.status}`);

  // Wait for webhook
  await new Promise(r => setTimeout(r, 3000));

  // Check Kanban
  const kanbanShow = execSync(`hermes kanban show ${kanbanTask.id} --json`, { encoding: 'utf-8', timeout: 10000 }).trim();
  const ks = JSON.parse(kanbanShow);
  const kanbanStatus = ks.task?.status || ks.status;

  console.log(`\n═══ RESULT ═══`);
  const checks = [
    ['Reject works', rejected.status === 'REJECTED'],
    ['Kanban blocked', kanbanStatus === 'blocked'],
  ];
  let allPassed = true;
  for (const [name, ok] of checks) {
    console.log(`  ${ok ? 'PASS' : 'FAIL'}: ${name}`);
    if (!ok) allPassed = false;
  }
  console.log(`Kanban status: ${kanbanStatus}`);

  // Cleanup
  if (kanbanStatus === 'blocked') {
    execSync(`hermes kanban archive ${kanbanTask.id}`, { encoding: 'utf-8', timeout: 5000 });
    console.log('Archived test task');
  }

  console.log(`\n${allPassed ? '═══ ALL PASSED ═══' : '═══ FAILURES ═══'}`);
  process.exit(allPassed ? 0 : 1);
}

main().catch(err => { console.error('FAIL:', err.message); process.exit(1); });
