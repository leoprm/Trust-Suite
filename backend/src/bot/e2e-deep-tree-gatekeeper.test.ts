/**
 * E2E Test: Root Ari Gatekeeper + Deep Tree Warning (RG6)
 *
 * Tests:
 *   1. Create root → sub → sub-sub trees via API
 *   2. Verify tree depths (root=0, sub=1, sub-sub=2)
 *   3. Verify RG5 deep tree warning code exists in bot/index.ts
 *   4. Verify root hasChildren → orchestration rules in system prompt
 *   5. Verify sub-tree notification code on ExternalTask + kanbanTaskId
 *   6. Verify triggerCommentReview endpoint wired for parent trees
 *
 * Deterministic, no LLM. ~60 LOC.
 *
 * Usage: npx tsx src/bot/e2e-deep-tree-gatekeeper.test.ts
 */

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
  } catch { return 0; }
}

async function main() {
  console.log('═══ E2E Root Ari Gatekeeper + Deep Tree Warning RG6 ═══\n');

  const systemToken = signToken({ id: 'ari', role: 'SYSTEM' });
  const sysAuth = { Authorization: `Bearer ${systemToken}` };
  const apiAuth = { Authorization: `Bearer ${API_KEY}` };

  let rootId = '', subId = '', subSubId = '';

  try {
    // ── 1. Create root → sub → sub-sub trees ──────────────────────────────
    console.log('1. Creating root → sub → sub-sub...');
    const root = await fetchJSON(`${BASE}/api/trees`, {
      method: 'POST', headers: sysAuth,
      body: JSON.stringify({ name: `Raíz-RG6-${Date.now()}`, admissionPolicy: 'OPEN' }),
    });
    rootId = root.tree?.id || root.id;
    console.log(`   ✓ Root: ${rootId}`);

    const sub = await fetchJSON(`${BASE}/api/trees`, {
      method: 'POST', headers: sysAuth,
      body: JSON.stringify({ name: `Sub-RG6-${Date.now()}`, admissionPolicy: 'OPEN', parentTreeId: rootId }),
    });
    subId = sub.tree?.id || sub.id;

    const subSub = await fetchJSON(`${BASE}/api/trees/${subId}/subtree`, {
      method: 'POST', headers: sysAuth,
      body: JSON.stringify({ name: `SubSub-RG6-${Date.now()}`, icono: '🌿' }),
    });
    subSubId = subSub.id;

    // ── 2. Verify depths ─────────────────────────────────────────────────
    console.log('\n2. Verifying tree depths...');
    const [rInfo, sInfo, ssInfo] = await Promise.all([
      fetchJSON(`${BASE}/api/trees/${rootId}`, { headers: sysAuth }),
      fetchJSON(`${BASE}/api/trees/${subId}`, { headers: sysAuth }),
      fetchJSON(`${BASE}/api/trees/${subSubId}`, { headers: sysAuth }),
    ]);
    const getTree = (info: any) => info.tree || info;
    if (getTree(rInfo).parentTreeId) throw new Error('Root should have no parent');
    if (getTree(sInfo).parentTreeId !== rootId) throw new Error('Sub should link to root');
    if (getTree(ssInfo).parentTreeId !== subId) throw new Error('Sub-sub should link to sub');
    console.log('   ✓ Depth: root=0, sub=1, sub-sub=2');

    // ── 3. Verify RG5 deep tree warning code ──────────────────────────────
    console.log('\n3. RG5 deep tree warning...');
    const idxPath = 'src/bot/index.ts';
    if (!grepCount(idxPath, 'Este sub-árbol tendrá')) throw new Error('Warning msg missing');
    if (!grepCount(idxPath, 'childDepth >= 2')) throw new Error('Depth check missing');
    console.log('   ✓ Warning message + childDepth >= 2 gate: found');

    // ── 4. Verify root classifier/prioritizer in system prompt ────────────
    console.log('\n4. Root classifier + Kanban delegation...');
    const brPath = 'src/bot/hermesBridge.ts';
    if (!grepCount(brPath, 'CLASIFICADOR Y PRIORIZADOR')) throw new Error('Classifier section missing');
    if (!grepCount(brPath, 'hermes.*kanban.*create')) throw new Error('Kanban create missing');
    if (!grepCount(brPath, 'EVALUAR IMPORTANCIA')) throw new Error('Importance eval missing');
    console.log('   ✓ Classifier + importance eval + Kanban create: found');

    // ── 5. Verify sub-tree notification on ExternalTask + kanbanTaskId ────
    console.log('\n5. Sub-tree notification (ExternalTask + kanbanTaskId)...');
    const extPath = 'src/controllers/externalTaskController.ts';
    if (!grepCount(extPath, 'Notify sub-tree chat')) throw new Error('Notify code missing');
    if (!grepCount(extPath, './api/bot/send-message')) throw new Error('send-message missing');
    console.log('   ✓ Fire-and-forget notify via /api/bot/send-message: found');

    // ── 6. Verify triggerCommentReview endpoint ───────────────────────────
    console.log('\n6. triggerCommentReview endpoint...');
    if (!grepCount('src/routes/botRoutes.ts', 'trigger-comment-review')) throw new Error('Route missing');
    // Test endpoint responds (non-existent treeId → graceful)
    const tRes = await fetch(`${BASE}/api/bot/trigger-comment-review`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', ...apiAuth },
      body: JSON.stringify({ treeId: 'nonexistent' }),
    });
    if (tRes.status !== 200 && tRes.status !== 404) throw new Error(`triggerCommentReview: ${tRes.status}`);
    console.log(`   ✓ Route registered + endpoint responds: ${tRes.status}`);

  } finally {
    console.log('\n🧹 Cleanup...');
    if (subSubId) await fetchJSON(`${BASE}/api/trees/${subSubId}`, { method: 'DELETE', headers: sysAuth }).catch(() => {});
    if (subId) await fetchJSON(`${BASE}/api/trees/${subId}`, { method: 'DELETE', headers: sysAuth }).catch(() => {});
    if (rootId) await fetchJSON(`${BASE}/api/trees/${rootId}`, { method: 'DELETE', headers: sysAuth }).catch(() => {});
    console.log('   ✓ Done');
  }

  console.log('\n═══ ALL RG6 TESTS PASSED ═══');
}

main().catch(err => { console.error('\nFAIL:', err.message); process.exit(1); });
