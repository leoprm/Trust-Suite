/**
 * E2E Test: ExternalTask full flow
 *
 * Tests: CREATE → AVAILABLE → CLAIM → DELIVER → APPROVE → WEBHOOK
 *
 * Usage: npx ts-node src/bot/e2e-external-task.test.ts
 */

import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';
dotenv.config();

const BASE = 'http://localhost:3100';
const JWT_SECRET = process.env.JWT_SECRET || 'test';
const INTERNAL_API_KEY = process.env.INTERNAL_API_KEY || '';

function signToken(payload: object): string {
  return jwt.sign(payload, JWT_SECRET);
}

async function fetchJSON(url: string, options: RequestInit = {}): Promise<any> {
  const res = await fetch(url, { ...options, headers: { 'Content-Type': 'application/json', ...options.headers } });
  const body = await res.json();
  if (!res.ok) throw new Error(`${res.status} ${url}: ${JSON.stringify(body)}`);
  return body;
}

async function main() {
  console.log('═══ E2E ExternalTask Test ═══\n');

  const systemToken = signToken({ id: 'ari', role: 'SYSTEM' });
  const sysAuth = { Authorization: `Bearer ${systemToken}` };

  // Discover tree
  console.log('0. Fetching trees/members...');
  const trees = await fetchJSON(`${BASE}/api/trees`, { headers: sysAuth });
  if (!trees?.length) throw new Error('No trees');
  const tree = trees[0];
  console.log(`   Tree: ${tree.id} (${tree.name})`);

  const members = await fetchJSON(`${BASE}/api/trees/${tree.id}/members`, { headers: sysAuth });
  const member = members[0];
  const workerId = member.user?.id || member.userId;
  const workerToken = signToken({ id: workerId });
  const workerAuth = { Authorization: `Bearer ${workerToken}` };
  console.log(`   Worker: ${workerId}\n`);

  // 1. CREATE
  console.log('1. CREATE...');
  const task = await fetchJSON(`${BASE}/api/external-tasks`, {
    method: 'POST', headers: sysAuth,
    body: JSON.stringify({ treeId: tree.id, title: 'E2E ' + Date.now(), description: 'E2E test task', skills: ['test'], budget: 5000, currency: 'CLP' }),
  });
  console.log(`   Created: ${task.id} status=${task.status}`);

  // 2. AVAILABLE
  console.log('2. GET /available...');
  const available = await fetchJSON(`${BASE}/api/external-tasks/available`);
  console.log(`   Found: ${!!available.find((t: any) => t.id === task.id)} (${available.length} total)`);

  // 3. CLAIM
  console.log('3. CLAIM...');
  const claimed = await fetchJSON(`${BASE}/api/external-tasks/${task.id}/claim`, { method: 'POST', headers: workerAuth });
  console.log(`   status=${claimed.status} workerId=${claimed.workerId}`);

  // 4. DELIVER (multipart)
  console.log('4. DELIVER...');
  const fd = new FormData();
  fd.append('deliverable', new Blob(['evidence'], { type: 'text/plain' }), 'evidence.txt');
  const dRes = await fetch(`${BASE}/api/external-tasks/${task.id}/deliver`, { method: 'POST', headers: workerAuth, body: fd });
  const delivered = await dRes.json();
  if (!dRes.ok) throw new Error(`Deliver: ${JSON.stringify(delivered)}`);
  console.log(`   status=${delivered.status}`);

  // 5. APPROVE
  console.log('5. APPROVE...');
  const approved = await fetchJSON(`${BASE}/api/external-tasks/${task.id}/approve`, { method: 'POST', headers: sysAuth });
  console.log(`   status=${approved.status} approvedBy=${approved.approvedBy}`);

  // 6. WEBHOOK
  console.log('6. Webhook...');
  const hook = await fetchJSON(`${BASE}/api/hooks/external-task-completed`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': INTERNAL_API_KEY },
    body: JSON.stringify({ externalTaskId: task.id, status: 'APPROVED', kanbanTaskId: 't_e2e_test', kanbanBoard: 'test' }),
  });
  console.log(`   Webhook: ${JSON.stringify(hook)}`);

  // 7. MY tasks
  console.log('7. GET /my...');
  const my = await fetchJSON(`${BASE}/api/external-tasks/my`, { headers: workerAuth });
  console.log(`   Worker sees ${my.length} tasks`);

  console.log('\n═══ PASSED ═══');
}

main().catch(err => { console.error('FAIL:', err.message); process.exit(1); });
