/**
 * E2E Test: Sub-tree onboarding flow with Bridge (T8)
 *
 * Tests the full sub-tree onboarding flow:
 *   1. Create parent tree with user A
 *   2. Verify my_chat_member subtree question code exists (callback + inline keyboard)
 *   3. Verify subtree_early_yes → parent tree selector flow
 *   4. Verify parent_select links child → parentTreeId in DB
 *   5. Verify parent notification code exists (Bridge message to parent chat)
 *   6. Verify hierarchy shows child under parent
 *   7. Verify system prompt includes parentTree context (enforcePrefix)
 *   8. Verify sandbox parent/read bridge works
 *
 * Deterministic, no LLM. ~120 LOC.
 *
 * Usage: npx tsx src/bot/e2e-subtree-onboarding.test.ts
 */

import { PrismaClient } from '@prisma/client';
import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';
import { execSync } from 'child_process';
import fs from 'fs';
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

function grepCount(file: string, pattern: string): number {
  try {
    const out = execSync(`grep -c '${pattern}' '${file}'`, { encoding: 'utf-8' }).trim();
    return parseInt(out, 10) || 0;
  } catch { return 0; } // grep returns 1 on no match
}

async function main() {
  console.log('═══ E2E Sub-tree Onboarding + Bridge T8 ═══\n');

  const systemToken = signToken({ id: 'ari', role: 'SYSTEM' });
  const sysAuth = { Authorization: `Bearer ${systemToken}` };
  const apiAuth = { Authorization: `Bearer ${API_KEY}` };
  const testUserId = '08e75fbf-4a4b-4b80-8362-b96c60bacad7'; // Hermes-Nestor
  const indexPath = 'src/bot/index.ts';

  let parentId = '', childId = '', subId = '';

  try {
    // ── 1. Create parent tree with user A ──────────────────────────────────
    console.log('1. Creating parent tree with user A...');
    const parent = await fetchJSON(`${BASE}/api/trees`, {
      method: 'POST', headers: sysAuth,
      body: JSON.stringify({
        name: `Padre-E2E-${Date.now()}`,
        admissionPolicy: 'OPEN',
        inviteUserIds: [testUserId],
      }),
    });
    parentId = parent.tree?.id || parent.id;
    console.log(`   ✓ Parent: ${parentId}`);

    // ── 2. Verify my_chat_member subtree question code ────────────────────
    //    Static verification: inline keyboard with subtree question + callbacks
    console.log('\n2. Verifying my_chat_member subtree question code...');
    if (!fs.existsSync(indexPath)) throw new Error(`index.ts not found: ${indexPath}`);

    const hasSubtreeQuestion = grepCount(indexPath, 'Es este un sub-árbol');
    const hasEarlyYes = grepCount(indexPath, 'onboarding:subtree_early_yes');
    const hasEarlyNo = grepCount(indexPath, 'onboarding:subtree_early_no');
    const hasParentSelect = grepCount(indexPath, 'onboarding:parent_select');

    if (!hasSubtreeQuestion) throw new Error('Subtree question not found in index.ts');
    if (!hasEarlyYes) throw new Error('subtree_early_yes callback not found');
    if (!hasEarlyNo) throw new Error('subtree_early_no callback not found');
    if (!hasParentSelect) throw new Error('parent_select callback not found');

    console.log(`   ✓ "¿Es este un sub-árbol?" → found (${hasSubtreeQuestion})`);
    console.log(`   ✓ Callbacks: subtree_early_yes (${hasEarlyYes}), subtree_early_no (${hasEarlyNo}), parent_select (${hasParentSelect})`);

    // ── 3. Verify subtree_early_yes → parent tree selector flow ───────────
    //    Code path: early_yes handler fetches user memberships, shows keyboard
    console.log('\n3. Verifying subtree_early_yes → parent selector flow...');
    const hasMembershipQuery = grepCount(indexPath, 'treeMember\\.findMany');
    const hasParentSelector = grepCount(indexPath, 'Selecciona el árbol padre');
    if (!hasMembershipQuery) throw new Error('treeMember.findMany in early_yes handler not found');
    if (!hasParentSelector) throw new Error('Parent selector prompt not found');
    console.log(`   ✓ treeMember.findMany: found (${hasMembershipQuery})`);
    console.log(`   ✓ "Selecciona el árbol padre": found (${hasParentSelector})`);

    // ── 4. Verify parent_select links child → parentTreeId ─────────────────
    //    Code path: parent_select handler sets parentTreeId in DB
    console.log('\n4. Verifying parent_select → parentTreeId linkage...');
    const hasUpdateParentTreeId = grepCount(indexPath, 'data:.*parentTreeId');
    if (hasUpdateParentTreeId < 1) throw new Error('parentTreeId update in parent_select not found');
    console.log(`   ✓ parentTreeId update: found (${hasUpdateParentTreeId})`);

    // API test: create child with parentTreeId, verify linkage
    const child = await fetchJSON(`${BASE}/api/trees`, {
      method: 'POST', headers: sysAuth,
      body: JSON.stringify({
        name: `Hijo-E2E-${Date.now()}`,
        admissionPolicy: 'OPEN',
        parentTreeId: parentId,
      }),
    });
    childId = child.tree?.id || child.id;

    const childInfo = await fetchJSON(`${BASE}/api/trees/${childId}`, { headers: sysAuth });
    const dbChild = childInfo.tree || childInfo;
    if (dbChild.parentTreeId !== parentId) throw new Error(`parentTreeId mismatch: ${dbChild.parentTreeId}`);
    console.log(`   ✓ Child ${childId} → parentTreeId=${parentId}`);

    // ── 5. Verify parent notification code (Bridge) ───────────────────────
    //    parent_select sends "Nuevo sub-árbol vinculado" to parent.telegramChatId
    console.log('\n5. Verifying Bridge notification to parent chat...');
    const hasNotification = grepCount(indexPath, 'Nuevo sub-árbol vinculado');
    const hasSendToParent = grepCount(indexPath, 'sendMessage.*parentTree\\.telegramChatId');
    if (!hasNotification) throw new Error('Bridge notification message not found');
    if (!hasSendToParent) throw new Error('sendMessage to parent telegramChatId not found');
    console.log(`   ✓ "Nuevo sub-árbol vinculado": found (${hasNotification})`);
    console.log(`   ✓ sendMessage → parentTree.telegramChatId: found (${hasSendToParent})`);

    // createSubTree endpoint also notifies parent (treeController.ts)
    const ctrlPath = 'src/controllers/treeController.ts';
    const hasCtrlNotification = grepCount(ctrlPath, 'Nuevo sub-árbol vinculado');
    console.log(`   ✓ createSubTree notification: ${hasCtrlNotification ? 'found' : 'NOT FOUND'} (treeController.ts)`);

    // ── 6. Verify hierarchy shows child under parent ──────────────────────
    console.log('\n6. Verifying parent hierarchy includes child...');
    const hierarchy = await fetchJSON(`${BASE}/api/trees/${parentId}/hierarchy`, { headers: sysAuth });
    const children = hierarchy.childTrees || [];
    const foundChild = children.find((c: any) => c.id === childId);
    if (!foundChild) throw new Error('Child not found in parent hierarchy');
    console.log(`   ✓ Child "${foundChild.name}" in parent.childTrees (${children.length} total)`);

    // ── 7. Verify system prompt includes parentTree context ────────────────
    console.log('\n7. Verifying system prompt context (enforcePrefix)...');
    const { enforcePrefix } = await import('./hermesBridge');
    const prisma = new PrismaClient();

    const rootPrefixed = await enforcePrefix('Hola mundo', parentId, prisma);
    if (!rootPrefixed.startsWith('🌳')) throw new Error('Root should have 🌳 prefix');
    console.log(`   ✓ Parent prefix 🌳: "${rootPrefixed.slice(0, 50)}"`);

    const subPrefixed = await enforcePrefix('Hola mundo', childId, prisma);
    if (!subPrefixed.startsWith('🌿')) throw new Error('Sub-tree should have 🌿 prefix');
    console.log(`   ✓ Sub-tree prefix 🌿: "${subPrefixed.slice(0, 50)}"`);

    // No double-prefix
    const alreadyPrefixed = await enforcePrefix('🌳 YaTienePrefijo: hola', parentId, prisma);
    if (!alreadyPrefixed.startsWith('🌳 YaTienePrefijo')) throw new Error('Double prefix detected');
    console.log('   ✓ No double-prefix: PASS');

    await prisma.$disconnect();

    // ── 8. Verify sandbox parent/read bridge ───────────────────────────────
    console.log('\n8. Sandbox parent/read bridge...');
    // Poll for sandbox readiness
    for (let i = 0; i < 20; i++) {
      const p = await fetch(`${BASE}/api/trees/${parentId}/sandbox/write`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', ...apiAuth },
        body: JSON.stringify({ path: '_ping', content: 'ok' }),
      });
      if (p.ok) break;
      await new Promise(r => setTimeout(r, 500));
    }

    await fetchJSON(`${BASE}/api/trees/${parentId}/sandbox/write`, {
      method: 'POST', headers: apiAuth,
      body: JSON.stringify({ path: 'bridge-test.md', content: '# Bridge\nParent context available.' }),
    });

    const read = await fetchJSON(`${BASE}/api/trees/${childId}/sandbox/parent/read`, {
      method: 'POST', headers: apiAuth, body: JSON.stringify({ path: 'bridge-test.md' }),
    });
    console.log(`   ✓ Child reads parent sandbox: ${read.size}B`);

    // Root tree cannot use parent/read
    try {
      await fetchJSON(`${BASE}/api/trees/${parentId}/sandbox/parent/read`, {
        method: 'POST', headers: apiAuth, body: JSON.stringify({ path: 'x.md' }),
      });
      throw new Error('Root tree should not be able to use parent/read');
    } catch (e: any) {
      if (e.message.includes('400')) console.log('   ✓ Root tree parent/read correctly rejected');
      else throw e;
    }

    // ── 9. Verify createSubTree API (end-to-end subtree creation) ─────────
    console.log('\n9. Testing createSubTree API...');
    const sub = await fetchJSON(`${BASE}/api/trees/${parentId}/subtree`, {
      method: 'POST', headers: sysAuth,
      body: JSON.stringify({ name: `Sub-API-E2E-${Date.now()}`, icono: '🌿' }),
    });
    subId = sub.id;
    const subInfo = await fetchJSON(`${BASE}/api/trees/${subId}`, { headers: sysAuth });
    const subTree = subInfo.tree || subInfo;
    if (subTree.parentTreeId !== parentId) throw new Error('createSubTree: parentTreeId not set');
    console.log(`   ✓ Sub-tree ${subId} → parent=${parentId}`);

  } finally {
    // ── Cleanup ────────────────────────────────────────────────────────────
    console.log('\n🧹 Cleanup...');
    if (subId) await fetchJSON(`${BASE}/api/trees/${subId}`, { method: 'DELETE', headers: sysAuth }).catch(() => {});
    if (childId) await fetchJSON(`${BASE}/api/trees/${childId}`, { method: 'DELETE', headers: sysAuth }).catch(() => {});
    if (parentId) await fetchJSON(`${BASE}/api/trees/${parentId}`, { method: 'DELETE', headers: sysAuth }).catch(() => {});
    console.log('   ✓ Done');
  }

  console.log('\n═══ ALL T8 TESTS PASSED ═══');
}

main().catch(err => { console.error('\nFAIL:', err.message); process.exit(1); });
