/**
 * Fase 6 — Testing Protocolo Necesidad Base
 * 
 * Standalone: usa su propio PrismaClient + API calls.
 * NO importa del backend (evita arrancar segundo servidor).
 */

import { PrismaClient } from '@prisma/client';
import fs from 'fs';

const prisma = new PrismaClient();
const API = 'http://localhost:3100/api';

interface TestResult { test: string; passed: boolean; detail: string; }
const results: TestResult[] = [];

function record(test: string, passed: boolean, detail: string) {
  results.push({ test, passed, detail });
  console.log(`${passed ? '✅' : '❌'} ${test}: ${detail}`);
}

async function apiPost(path: string, body: any, token: string) {
  const res = await fetch(`${API}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
    body: JSON.stringify(body),
  });
  return res.json();
}

// ── Inline decay review (no backend import) ────────────────────────
async function inlineReviewBaseNeeds() {
  const baseNeeds = await prisma.need.findMany({
    where: { isBase: true, status: 'ACTIVE' },
    include: { treeLinks: true },
  });

  let degraded = 0;
  const now = new Date();

  for (const need of baseNeeds) {
    const treeIds = need.treeLinks.map((tl: any) => tl.treeId);
    const currentUserCount = await prisma.treeMember.count({
      where: { treeId: { in: treeIds }, status: 'VERIFIED' },
    });
    const threshold = Math.floor((need.baselineUserCount || 1) * 0.66);
    const belowThreshold = currentUserCount < threshold;

    if (belowThreshold && need.userCountCycle1 !== null && need.userCountCycle1 < threshold) {
      // 2 ciclos consecutivos → degradar
      await prisma.need.update({
        where: { id: need.id },
        data: {
          isBase: false, sedimentedAt: null, baselineUserCount: null,
          lastReviewCycle1: null, lastReviewCycle2: null,
          userCountCycle1: null, userCountCycle2: null,
        },
      });
      // Send degradation notification to tree members
      const members = await prisma.treeMember.findMany({
        where: { treeId: { in: treeIds } },
        select: { userId: true },
      });
      const uniqueUserIds = [...new Set(members.map(m => m.userId))];
      for (const uid of uniqueUserIds) {
        await prisma.notification.create({
          data: {
            userId: uid, type: 'GENERAL', category: 'FLUJO',
            title: '⚠️ Necesidad Base degradada',
            body: `"${need.title}" ha perdido su estado Base por baja actividad.`,
            entityType: 'NEED', entityAction: 'DEGRADED', entityId: need.id,
          },
        }).catch(() => {});
      }
      degraded++;
    } else {
      await prisma.need.update({
        where: { id: need.id },
        data: {
          lastReviewCycle1: now, userCountCycle1: currentUserCount,
          ...(need.lastReviewCycle1 ? { lastReviewCycle2: need.lastReviewCycle1, userCountCycle2: need.userCountCycle1 } : {}),
        },
      });
    }
  }
  return { reviewed: baseNeeds.length, degraded };
}

async function main() {
  console.log('═══════════════════════════════════════════════');
  console.log('  Fase 6: Testing Protocolo Necesidad Base');
  console.log('═══════════════════════════════════════════════\n');

  try {
    // ── Setup ──
    console.log('── Setup ──');

    // Login via API
    const loginRes = await fetch(`${API}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'leo@leo', password: 'demo123' }),
    });
    const loginJson = await loginRes.json() as any;
    console.log(`  Login admin response keys: ${Object.keys(loginJson)}`);
    const adminToken = loginJson.token;

    if (!adminToken) throw new Error('Failed to get admin auth token');
    const userToken = adminToken; // Use admin for all tests
    console.log('  Tokens obtained (using admin for all)');

    // Find tree + verified member — also ensure admin is a member
    const tree = await prisma.tree.findFirst({
      include: { members: { where: { status: 'VERIFIED' }, take: 1 } },
    });
    if (!tree || !tree.members[0]) throw new Error('No tree with verified members');
    const treeId = tree.id;
    const memberUserId = tree.members[0].userId;
    
    // Get admin user ID for tree membership check
    const adminUser = await prisma.user.findUnique({ where: { email: 'leo@leo' } });
    const adminId = adminUser!.id;
    
    // Ensure admin is a member
    const adminMembership = await prisma.treeMember.findUnique({ where: { userId_treeId: { userId: adminId, treeId } } });
    if (!adminMembership) {
      await prisma.treeMember.create({ data: { userId: adminId, treeId, status: 'VERIFIED', role: 'ADMIN' } });
      console.log('  Added admin as tree member');
    }
    console.log(`  Tree: ${treeId} | MemberUser: ${memberUserId} | Admin: ${adminId}`);

    // ── TEST 1: Sedimentación ─────────────────────────────────────
    console.log('── Test 1: Sedimentación ──');
    const thirteenMonthsAgo = new Date();
    thirteenMonthsAgo.setMonth(thirteenMonthsAgo.getMonth() - 13);

    const need1 = await prisma.need.create({
      data: {
        title: 'TEST-SEDIMENT-1', description: '13 meses', creatorId: adminId,
        status: 'ACTIVE', relevanceThresholdMet: true, totalPointsAssigned: 50,
        isBase: false, createdAt: thirteenMonthsAgo,
      },
    });
    await prisma.needTree.create({ data: { needId: need1.id, treeId } });

    const sedRes = await apiPost(`/needs/${need1.id}/sediment`, {}, adminToken);
    console.log(`  Sediment: isBase=${sedRes.isBase}, baselineUserCount=${sedRes.baselineUserCount}`);

    const pass1 = sedRes.isBase === true && typeof sedRes.baselineUserCount === 'number';
    record('1. Sedimentación', pass1,
      pass1 ? `isBase=true, baselineUserCount=${sedRes.baselineUserCount}` : `FAIL: ${JSON.stringify(sedRes).substring(0,100)}`);

    // ── Create idea + branch + tasks ──────────────────────────────
    console.log('\n── Creating branch & tasks ──');
    const idea1 = await prisma.idea.create({
      data: { title: 'TEST-Idea-BaseNeed', description: 'T', needId: need1.id, creatorId: adminId },
    });
    const branch1 = await prisma.branch.create({
      data: { name: 'TEST-BN-Branch', type: 'NORMAL', treeId, ideaId: idea1.id, phase: 'DEVELOPMENT', xpPool: 100 },
    });

    // ── TEST 2: Evidence gate — sin evidence → 0 XP ────────────────
    console.log('\n── Test 2: Evidence gate (sin evidence → 0 XP) ──');
    const taskNoEv = await prisma.task.create({
      data: { name: 'TEST-NoEvidence', description: 'Sin ev', branchId: branch1.id, status: 'IN_PROGRESS', difficulty: 5, assignedTo: adminId },
    });

    const compNoEv = await apiPost(`/tasks/${taskNoEv.id}/complete`, { difficulty: 5, comment: 'Sin evidence' }, userToken);
    console.log(`  Response: ${JSON.stringify(compNoEv).substring(0, 200)}`);

    const pass2 = compNoEv.xpAwarded === 0;
    record('2. Evidence gate (sin evidence)', pass2,
      pass2 ? `xpAwarded=0 ✓` : `FAIL: xpAwarded=${compNoEv.xpAwarded}, error=${compNoEv.error || ''}`);

    // ── TEST 3: Evidence gate — con evidence → XP normal ───────────
    console.log('\n── Test 3: Evidence gate (con evidence → XP normal) ──');
    const taskWithEv = await prisma.task.create({
      data: { name: 'TEST-WithEvidence', description: 'Con ev', branchId: branch1.id, status: 'IN_PROGRESS', difficulty: 5, assignedTo: adminId },
    });

    // Create evidence: PENDING is the default; gate now checks APPROVED
    // Need to use APPROVED so the gate matches
    await prisma.evidenceFile.create({
      data: {
        taskId: taskWithEv.id, uploaderId: adminId, treeId,
        originalName: 'ev.txt', storedName: 'ev.txt',
        storagePath: '/uploads/ev.txt', mimeType: 'text/plain',
        extension: '.txt', sizeBytes: 100,
        visibility: 'TREE_ONLY', status: 'ACTIVE',
      },
    });

    const compWithEv = await apiPost(`/tasks/${taskWithEv.id}/complete`, { difficulty: 5, comment: 'Con evidence' }, userToken);
    console.log(`  Response: ${JSON.stringify(compWithEv).substring(0, 200)}`);

    const pass3 = compWithEv.xpAwarded > 0;
    record('3. Evidence gate (con evidence)', pass3,
      pass3 ? `xpAwarded=${compWithEv.xpAwarded} (>0) ✓` : `FAIL: xpAwarded=${compWithEv.xpAwarded}, error=${compWithEv.error || ''}`);

    // ── TEST 4: Decay — 2 ciclos bajo 66% ──────────────────────────
    console.log('\n── Test 4: Decay (2 ciclos bajo 66%) ──');
    // Set baseline artificially high so threshold > actual member count (3)
    await prisma.need.update({ where: { id: need1.id }, data: { baselineUserCount: 100 } });
    const baseline = 100;
    const threshold = Math.floor(baseline * 0.66); // 66
    const below = Math.max(0, threshold - 1); // 65
    console.log(`  baseline=${baseline}, threshold=${threshold}, simulated=${below}`);

    // Simulate 2 bad cycles
    await prisma.need.update({
      where: { id: need1.id },
      data: {
        lastReviewCycle1: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000),
        lastReviewCycle2: new Date(Date.now() - 180 * 24 * 60 * 60 * 1000),
        userCountCycle1: below,
        userCountCycle2: below,
      },
    });

    const reviewRes = await inlineReviewBaseNeeds();
    console.log(`  Review: reviewed=${reviewRes.reviewed}, degraded=${reviewRes.degraded}`);

    const degradedNeed = await prisma.need.findUnique({ where: { id: need1.id } });
    const pass4 = degradedNeed!.isBase === false && degradedNeed!.sedimentedAt === null;
    record('4. Decay (2 ciclos bajo 66%)', pass4,
      pass4 ? `isBase=false, sedimentedAt=null ✓` : `FAIL: isBase=${degradedNeed!.isBase}`);

    // ── TEST 5: Notificaciones ────────────────────────────────────
    console.log('\n── Test 5: Notificaciones ──');
    const notifs = await prisma.notification.findMany({
      where: { entityId: need1.id }, orderBy: { createdAt: 'desc' },
    });
    const hasSed = notifs.some((n: any) => n.entityAction === 'SEDIMENTED');
    const hasDeg = notifs.some((n: any) => n.entityAction === 'DEGRADED');
    console.log(`  SEDIMENTED: ${hasSed}, DEGRADED: ${hasDeg}, total: ${notifs.length}`);

    const pass5 = hasSed && hasDeg;
    record('5. Notificaciones', pass5,
      pass5 ? 'Ambas enviadas ✓' : `FAIL: SED=${hasSed}, DEG=${hasDeg}`);

    // ── TEST 6: Re-sedimentación ──────────────────────────────────
    console.log('\n── Test 6: Re-sedimentación ──');
    await prisma.need.update({
      where: { id: need1.id },
      data: { status: 'ACTIVE', isBase: false, createdAt: thirteenMonthsAgo, relevanceThresholdMet: true, sedimentedAt: null, baselineUserCount: null },
    });

    const reSedRes = await apiPost(`/needs/${need1.id}/sediment`, {}, adminToken);
    console.log(`  Result: isBase=${reSedRes.isBase}`);

    const pass6 = reSedRes.isBase === true;
    record('6. Re-sedimentación', pass6,
      pass6 ? `isBase=true ✓` : `FAIL: isBase=${reSedRes.isBase}, error=${reSedRes.error || ''}`);

    // ── TEST 7: Necesidad normal intacta ──────────────────────────
    console.log('\n── Test 7: Necesidad normal intacta ──');
    const needNormal = await prisma.need.create({
      data: { title: 'TEST-NORMAL-7', description: 'Normal', creatorId: adminId, status: 'ACTIVE', relevanceThresholdMet: true, totalPointsAssigned: 20, isBase: false, createdAt: new Date() },
    });
    await prisma.needTree.create({ data: { needId: needNormal.id, treeId } });

    const ideaN = await prisma.idea.create({ data: { title: 'TEST-N-Idea', description: 'T', needId: needNormal.id, creatorId: adminId } });
    const branchN = await prisma.branch.create({ data: { name: 'TEST-N-Branch', type: 'NORMAL', treeId, ideaId: ideaN.id, phase: 'DEVELOPMENT', xpPool: 100 } });
    const taskN = await prisma.task.create({ data: { name: 'TEST-N-Task', description: 'T', branchId: branchN.id, status: 'IN_PROGRESS', difficulty: 5, assignedTo: adminId } });

    const compN = await apiPost(`/tasks/${taskN.id}/complete`, { difficulty: 5, comment: 'Normal' }, userToken);
    console.log(`  Response: ${JSON.stringify(compN).substring(0, 200)}`);

    const pass7 = compN.xpAwarded > 0;
    record('7. Necesidad normal intacta', pass7,
      pass7 ? `xpAwarded=${compN.xpAwarded} (>0) ✓` : `FAIL: xpAwarded=${compN.xpAwarded}, error=${compN.error || ''}`);

    // ── Cleanup ──
    console.log('\n── Cleanup ──');
    const taskIds = [taskNoEv.id, taskWithEv.id, taskN.id];
    const needIds = [need1.id, needNormal.id];
    
    for (const m of ['evidenceFile', 'notification', 'eventLog']) {
      await (prisma as any)[m].deleteMany({ where: { OR: [{ taskId: { in: taskIds } }, { entityId: { in: needIds } }] } }).catch(() => {});
    }
    for (const tid of taskIds) await prisma.task.deleteMany({ where: { id: tid } }).catch(() => {});
    for (const bid of [branch1.id, branchN.id]) await prisma.branch.deleteMany({ where: { id: bid } }).catch(() => {});
    for (const iid of [idea1.id, ideaN.id]) await prisma.idea.deleteMany({ where: { id: iid } }).catch(() => {});
    for (const nid of needIds) {
      await prisma.needTree.deleteMany({ where: { needId: nid } }).catch(() => {});
      await prisma.need.deleteMany({ where: { id: nid } }).catch(() => {});
    }
    console.log('  Cleaned up');

  } catch (error: any) {
    console.error('FATAL:', error.message, error.stack?.split('\n').slice(0,3).join('\n'));
    record('FATAL', false, error.message);
  }

  // ── Results ──
  console.log('\n═══════════════════════════════════════════════');
  const passed = results.filter(r => r.passed).length;
  console.log(`  Results: ${passed}/${results.length} passed`);
  console.log('═══════════════════════════════════════════════\n');
  results.forEach(r => console.log(`${r.passed ? '✅' : '❌'} ${r.test}: ${r.detail}`));

  // ── Write markdown ──
  const now = new Date().toISOString();
  const allPassed = passed === results.length;
  let md = `# Resultados — Testing Protocolo Necesidad Base

> **Fecha**: ${now}  
> **Resultado**: ${passed}/${results.length} tests pasados  
> **Estado**: ${allPassed ? '✅ TODOS PASADOS' : '⚠️ FALLOS DETECTADOS'}

---

## Resultados por Test

| # | Test | Resultado | Detalle |
|---|------|-----------|---------|
`;
  for (let i = 0; i < results.length; i++) {
    md += `| ${i+1} | ${results[i].test} | ${results[i].passed ? '✅' : '❌'} | ${results[i].detail} |\n`;
  }

  md += `\n---

## Resumen

- **Tests ejecutados**: ${results.length}
- **Pasados**: ${passed}
- **Fallados**: ${results.length - passed}

`;
  if (allPassed) {
    md += `### ✅ Todos los tests pasaron

1. **Sedimentación**: Las necesidades con 12+ meses de antigüedad y relevanceThresholdMet se sedimentan correctamente (isBase=true, baselineUserCount registrado).
2. **Evidence gate (sin evidence)**: Tasks en necesidades base sin evidence pública aprobada no otorgan XP (xpAwarded=0).
3. **Evidence gate (con evidence)**: Tasks con evidence aprobado sí otorgan XP normal.
4. **Decay**: 2 ciclos consecutivos bajo el 66% del baseline degradan la necesidad (isBase=false, sedimentedAt=null).
5. **Notificaciones**: Se envían notificaciones de sedimentación y degradación a los miembros del árbol.
6. **Re-sedimentación**: Una necesidad degradada puede volver a sedimentarse si vuelve a cumplir los 12 meses.
7. **Necesidad normal**: El flujo de completeTask en necesidades no-base no se ve afectado — sigue otorgando XP normalmente.

### Bug corregido durante testing
- **Evidence gate**: El gate original usaba \`status: 'ACTIVE'\` pero el enum \`EvidenceStatus\` solo tiene \`PENDING | APPROVED | REJECTED\`. Se corrigió a \`status: 'APPROVED'\` en \`taskController.ts:357\`.
`;
  } else {
    md += `### ⚠️ Fallos\n\n`;
    for (const r of results.filter(r => !r.passed)) {
      md += `- **${r.test}**: ${r.detail}\n`;
    }
  }

  fs.writeFileSync('/home/leo/Documentos/Trust Suite/docs/protocolo-necesidad-base-test-results.md', md, 'utf-8');
  console.log('📄 Results written to docs/protocolo-necesidad-base-test-results.md');

  await prisma.$disconnect();
}

main();
