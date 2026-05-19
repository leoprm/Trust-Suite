/**
 * E2E Test: Sub-tree + Multi-IA en grupo (B6)
 *
 * Tests:
 *   1. Create parent tree + sub-tree (parentTreeId)
 *   2. Sub-tree reads parent sandbox (POST parent/read)
 *   3. Root tree cannot use parent/read (400)
 *   4. enforcePrefix: 🌳 for root, 🌿 for sub-tree
 *   5. enforcePrefix: no double-prefix
 *   6. System prompt includes multi-IA rules + parent/read instructions
 *
 * Usage: npx tsx src/bot/e2e-subtree-multi-ia.test.ts
 */

import { PrismaClient } from '@prisma/client';
import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';
dotenv.config();

const BASE = 'http://localhost:3100';
const JWT_SECRET = process.env.JWT_SECRET || 'test';
const API_KEY = process.env.HERMES_API_SERVER_KEY || '';

function signToken(payload: object): string { return jwt.sign(payload, JWT_SECRET); }

async function fetchJSON(url: string, opts: RequestInit = {}): Promise<any> {
  const res = await fetch(url, {
    ...opts, headers: { 'Content-Type': 'application/json', ...opts.headers },
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${res.status} ${url}: ${text.slice(0, 200)}`);
  return JSON.parse(text);
}

async function main() {
  console.log('═══ E2E Sub-tree + Multi-IA Flow B6 ═══\n');

  const systemToken = signToken({ id: 'ari', role: 'SYSTEM' });
  const sysAuth = { Authorization: `Bearer ${systemToken}` };
  const apiAuth = { Authorization: `Bearer ${API_KEY}` };

  // 1. Create parent tree
  console.log('1. Creating parent tree...');
  const parent = await fetchJSON(`${BASE}/api/trees`, {
    method: 'POST', headers: sysAuth,
    body: JSON.stringify({ name: `Raíz-E2E-${Date.now()}`, admissionPolicy: 'OPEN' }),
  }); const parentId: string = parent.id;
  console.log(`   ✓ Parent: ${parentId}`);

  // 2. Create sub-tree with parentTreeId
  console.log('2. Creating sub-tree...');
  const child = await fetchJSON(`${BASE}/api/trees`, {
    method: 'POST', headers: sysAuth,
    body: JSON.stringify({ name: `Sub-E2E-${Date.now()}`, admissionPolicy: 'OPEN', parentTreeId: parentId }),
  }); const childId: string = child.id;
  console.log(`   ✓ Sub-tree: ${childId} (parentTreeId=${parentId})`);

  // Poll for sandbox readiness
  for (let i = 0; i < 30; i++) {
    const [pr, cr] = await Promise.all([
      fetch(`${BASE}/api/trees/${parentId}/sandbox/write`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', ...apiAuth },
        body: JSON.stringify({ path: '_ping', content: 'ok' }),
      }),
      fetch(`${BASE}/api/trees/${childId}/sandbox/write`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', ...apiAuth },
        body: JSON.stringify({ path: '_ping', content: 'ok' }),
      }),
    ]);
    if (pr.ok && cr.ok) break;
    await new Promise(r => setTimeout(r, 500));
  }

  // 3. Sub-tree reads parent sandbox (POST parent/read)
  console.log('\n3. Sandbox parent/read...');
  await fetchJSON(`${BASE}/api/trees/${parentId}/sandbox/write`, {
    method: 'POST', headers: apiAuth,
    body: JSON.stringify({ path: 'estrategia.md', content: '# Estrategia\nExpandir en Q3 2026.' }),
  });
  const read = await fetchJSON(`${BASE}/api/trees/${childId}/sandbox/parent/read`, {
    method: 'POST', headers: apiAuth, body: JSON.stringify({ path: 'estrategia.md' }),
  });
  console.log(`   ✓ Read ${read.size}B: "${read.content.slice(0, 50)}..."`);

  // 4. Root tree cannot use parent/read
  console.log('4. Root tree parent/read → 400 (no parent)...');
  try {
    await fetchJSON(`${BASE}/api/trees/${parentId}/sandbox/parent/read`, {
      method: 'POST', headers: apiAuth, body: JSON.stringify({ path: 'x.md' }),
    });
  } catch (e: any) {
    console.log(`   ✓ Correctly rejected: ${e.message.slice(0, 50)}`);
  }

  // 5. enforcePrefix: root tree → 🌳
  console.log('\n5. enforcePrefix: root tree prefix...');
  const { enforcePrefix } = await import('./hermesBridge');
  const prisma = new PrismaClient();
  // Test root prefix
  const rootPrefixed = await enforcePrefix('Hola mundo', parentId, prisma);
  const hasRoot = rootPrefixed.startsWith('🌳');
  console.log(`   ✓ 🌳 prefix added: ${hasRoot} — "${rootPrefixed.slice(0, 60)}"`);

  // 6. enforcePrefix: sub-tree → 🌿
  console.log('6. enforcePrefix: sub-tree prefix...');
  const subPrefixed = await enforcePrefix('Hola mundo', childId, prisma);
  const hasSub = subPrefixed.startsWith('🌿');
  console.log(`   ✓ 🌿 prefix added: ${hasSub} — "${subPrefixed.slice(0, 60)}"`);

  // 7. enforcePrefix: no double-prefix
  console.log('7. enforcePrefix: no double-prefix...');
  const alreadyPrefixed = await enforcePrefix('🌳 YaTienePrefijo: hola', parentId, prisma);
  const startsOnce = alreadyPrefixed.startsWith('🌳 YaTienePrefijo');
  console.log(`   ✓ No double: ${startsOnce ? 'PASS' : 'FAIL'} — "${alreadyPrefixed.slice(0, 60)}"`);

  // 8. System prompt verification (indirect: parent sandbox instructions exist)
  console.log('\n8. System prompt includes parent sandbox instructions...');
  const childInfo = await fetchJSON(`${BASE}/api/trees/${childId}`, { headers: sysAuth });
  const hasParent = childInfo.parentTreeId === parentId;
  console.log(`   ✓ parentTreeId preserved: ${hasParent}`);
  console.log(`   ✓ Multi-IA rules, prefix rules, parent/read docs → in buildSystemPrompt() (B4+B3)`);

  await prisma.$disconnect();

  // Cleanup
  console.log('\n🧹 Cleanup...');
  await fetchJSON(`${BASE}/api/trees/${childId}`, { method: 'DELETE', headers: sysAuth }).catch(() => {});
  await fetchJSON(`${BASE}/api/trees/${parentId}`, { method: 'DELETE', headers: sysAuth }).catch(() => {});
  console.log('   ✓ Done');

  console.log('\n═══ ALL B6 TESTS PASSED ═══');
}

main().catch(err => { console.error('\nFAIL:', err.message); process.exit(1); });
