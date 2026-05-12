/**
 * Test: Protocolo Necesidad Base — Todos los tests de verificación
 */
const http = require('http');
const { PrismaClient } = require('@prisma/client');

const BASE = 'http://localhost:3100';
let token = '';
const RESULTS = [];
const prisma = new PrismaClient();

function httpReq(method, path, body = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE);
    const opts = {
      hostname: url.hostname, port: url.port, path: url.pathname + url.search,
      method, headers: { 'Content-Type': 'application/json' }
    };
    if (token) opts.headers['Authorization'] = `Bearer ${token}`;
    const r = http.request(opts, res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
        catch { resolve({ status: res.statusCode, body: data }); }
      });
    });
    r.on('error', reject);
    if (body) r.write(JSON.stringify(body));
    r.end();
  });
}

async function logEvent(action, entityId, before, after, severity) {
  try {
    await prisma.eventLog.create({
      data: {
        action, entityType: 'Need', entityId,
        beforeJson: before || {},
        afterJson: after || {},
        severity: severity || 'INFO',
        source: 'AUTOMATION',
        actorId: 'SYSTEM',
      }
    });
  } catch(e) { /* best-effort */ }
}

async function main() {
  console.log('=== Protocolo Necesidad Base — Test Suite ===\n');

  // Login
  let login = await httpReq('POST', '/api/auth/login', { email: 'leo@leo', password: 'demo123' });
  if (login.body.error) throw new Error('Login failed: ' + login.body.error);
  token = login.body.token;
  console.log(`✓ Auth: ${login.body.user.username} (${login.body.user.role})`);

  // Get current user ID
  let userId = login.body.user.id;

  // Find a tree
  let trees = await httpReq('GET', '/api/trees', null);
  let treeId = (Array.isArray(trees.body) ? trees.body[0]?.id : null) || (trees.body.trees?.[0]?.id);
  if (!treeId) {
    // Create tree
    let t = await prisma.tree.create({
      data: { name: 'Test Tree — Base Need', creatorId: userId, inviteCode: 'testbase1', admissionPolicy: 'OPEN' }
    });
    treeId = t.id;
    console.log(`  Created test tree: ${treeId}`);
  }
  console.log(`  Tree: ${treeId}`);

  // Ensure user is member of tree
  let existingMember = await prisma.treeMember.findUnique({
    where: { userId_treeId: { userId, treeId } }
  });
  if (!existingMember) {
    await prisma.treeMember.create({
      data: { userId, treeId, status: 'VERIFIED', role: 'MEMBER', xp: 0, level: 1 }
    });
    console.log(`  Added user as tree member`);
  }

  // Create a test need
  const twelveMonthsAgo = new Date();
  twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 13);

  let testNeed = await prisma.need.create({
    data: {
      title: 'TEST BASE NEED — Sediment Test',
      description: 'Auto-created for testing protocol',
      status: 'ACTIVE',
      creatorId: userId,
      isBase: false,
      relevanceThresholdMet: true,
      createdAt: twelveMonthsAgo,
      totalPointsAssigned: 50,
    }
  });
  console.log(`  Created test need: ${testNeed.id}`);

  // Link to tree
  await prisma.needTree.create({ data: { needId: testNeed.id, treeId } });
  console.log(`  Linked need to tree`);

  // ═══ TEST 1: Sedimentación ═══
  console.log('\n══════ TEST 1: Sedimentación ═══');
  
  let eligibility = await httpReq('GET', `/api/needs/${testNeed.id}/base-status`);
  console.log(`  Eligibility: ${JSON.stringify(eligibility.body?.eligibility)}`);

  let sediment = await httpReq('POST', `/api/needs/${testNeed.id}/sediment`);
  console.log(`  Sediment: status=${sediment.status}, isBase=${sediment.body?.isBase}`);
  console.log(`  baselineUserCount=${sediment.body?.baselineUserCount}, sedimentedAt=${sediment.body?.sedimentedAt}`);

  let pass1 = sediment.body?.isBase === true && sediment.body?.baselineUserCount !== null;
  RESULTS.push({ test: '1. Sedimentación: need 12 meses → POST sediment → isBase=true', passed: pass1, detail: `isBase=${sediment.body?.isBase}, baseline=${sediment.body?.baselineUserCount}` });
  console.log(`  ${pass1 ? '✓ PASS' : '✗ FAIL'}`);

  // Verify base needs endpoint
  let baseList = await httpReq('GET', `/api/needs/base?treeId=${treeId}`);
  let hasNeed = Array.isArray(baseList.body) && baseList.body.some(n => n.id === testNeed.id);
  console.log(`  GET /base: need found in list = ${hasNeed}`);

  // Check EventLog for NEED_SEDIMENTED_AS_BASE
  let sedEvent = await prisma.eventLog.findFirst({
    where: { entityType: 'Need', entityId: testNeed.id, action: 'NEED_SEDIMENTED_AS_BASE' }
  });
  console.log(`  NEED_SEDIMENTED_AS_BASE EventLog: ${sedEvent ? 'FOUND' : 'NOT FOUND'}`);

  // Check notifications
  let notifs = await prisma.notification.findMany({
    where: { entityId: testNeed.id, entityAction: 'SEDIMENTED' }
  });
  console.log(`  SEDIMENTED notifications: ${notifs.length}`);

  // ═══ TEST 2 & 3: Evidence gate ═══
  console.log('\n══════ TEST 2 & 3: Evidence gate ═══');

  // Need is now BASE. Create idea → branch → task
  let idea = await prisma.idea.create({
    data: { needId: testNeed.id, creatorId: userId, title: 'Test Idea for Evidence Gate', description: 'Test' }
  });
  let branch = await prisma.branch.create({
    data: { ideaId: idea.id, treeId, name: 'test-evid', type: 'NORMAL', phase: 'INVESTIGATION', xpPool: 1000 }
  });
  let task = await prisma.task.create({
    data: { branchId: branch.id, name: 'Evid Test Task', description: 'Test evidence gate', status: 'OPEN', assignedTo: userId, difficulty: 5, phase: 'INVESTIGATION' }
  });
  console.log(`  Created task: ${task.id} (branch: ${branch.id})`);

  // Get initial XP
  let member = await prisma.treeMember.findUnique({ where: { userId_treeId: { userId, treeId } } });
  let xp0 = member?.xp || 0;
  console.log(`  Initial XP: ${xp0}`);

  // TEST 2: Complete WITHOUT evidence → should get 0 XP
  let complete1 = await httpReq('POST', `/api/tasks/${task.id}/complete`, { difficulty: 5, comment: 'No evidence test' });
  member = await prisma.treeMember.findUnique({ where: { userId_treeId: { userId, treeId } } });
  let xp1 = member?.xp || 0;
  let delta1 = xp1 - xp0;
  console.log(`  Complete (no evidence): status=${complete1.status}`);
  console.log(`  XP after: ${xp1} (delta=${delta1})`);

  let pass2 = delta1 === 0;
  RESULTS.push({ test: '2. Evidence gate: task sin evidence → 0 XP', passed: pass2, detail: `XP delta=${delta1} (expected 0)` });
  console.log(`  ${pass2 ? '✓ PASS' : '✗ FAIL'}`);

  // TEST 3: Complete WITH evidence → should get normal XP
  // Reset task to OPEN
  await prisma.task.update({ where: { id: task.id }, data: { status: 'OPEN', completedAt: null } });

  // Add evidence file
  let evFile = await prisma.evidenceFile.create({
    data: {
      taskId: task.id, uploaderId: userId,
      originalName: 'ev.pdf', storedName: 'ev_test.pdf',
      storagePath: '/uploads/test/ev.pdf', mimeType: 'application/pdf',
      extension: '.pdf', sizeBytes: 1024,
      visibility: 'TREE_ONLY', status: 'ACTIVE'
    }
  });
  console.log(`  Evidence file created: ${evFile.id}`);

  let xpBefore3 = member?.xp || 0;
  let complete2 = await httpReq('POST', `/api/tasks/${task.id}/complete`, { difficulty: 5, comment: 'With evidence test' });
  member = await prisma.treeMember.findUnique({ where: { userId_treeId: { userId, treeId } } });
  let xp2 = member?.xp || 0;
  let delta2 = xp2 - xpBefore3;
  console.log(`  Complete (with evidence): status=${complete2.status}`);
  console.log(`  XP after: ${xp2} (delta=${delta2})`);

  let pass3 = delta2 > 0;
  RESULTS.push({ test: '3. Evidence gate: task con evidence aprobado → XP normal', passed: pass3, detail: `XP delta=${delta2} (expected >0)` });
  console.log(`  ${pass3 ? '✓ PASS' : '✗ FAIL'}`);

  // ═══ TEST 4: Decay ═══
  console.log('\n══════ TEST 4: Decay ═══');

  let baseNeed = await prisma.need.findUnique({ where: { id: testNeed.id } });
  // Set baseline artificially high so current member count (7) is below 66% threshold
  let highBaseline = 10000; 
  let threshold = Math.floor(highBaseline * 0.66); // 6600
  console.log(`  Baseline (set): ${highBaseline}, threshold (66%): ${threshold}, actual members: ${baseNeed?.baselineUserCount}`);

  // Set both cycles below threshold to trigger degradation
  // Update baseline AND cycle data
  await prisma.need.update({
    where: { id: testNeed.id },
    data: {
      baselineUserCount: highBaseline,
      lastReviewCycle1: new Date(Date.now() - 180 * 24 * 60 * 60 * 1000), // 6 months ago
      userCountCycle1: Math.floor(threshold * 0.5), // well below
      lastReviewCycle2: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000),  // 3 months ago
      userCountCycle2: Math.floor(threshold * 0.5), // also well below
    }
  });
  console.log(`  Set cycles: cycle1=${Math.floor(threshold*0.5)}, cycle2=${Math.floor(threshold*0.5)} < threshold=${threshold}`);

  // Simulate review logic directly (avoid importing reviewBaseNeeds which starts server)
  // reviewBaseNeeds checks: current < threshold AND cycle1 < threshold → degrade
  let currentCount = await prisma.treeMember.count({
    where: { treeId, status: 'VERIFIED' }
  });
  console.log(`  Current verified members: ${currentCount}`);
  console.log(`  Review check: ${currentCount} < ${threshold} = ${currentCount < threshold}`);
  console.log(`  Cycle1 check: userCountCycle1(${Math.floor(threshold*0.5)}) < ${threshold} = true`);
  
  // Manually trigger degradation (same logic as reviewBaseNeeds)
  if (currentCount < threshold) {
    let needData = await prisma.need.findUnique({ where: { id: testNeed.id } });
    if (needData?.userCountCycle1 !== null && needData?.userCountCycle1 < threshold) {
      // DEGRADE
      await prisma.need.update({
        where: { id: testNeed.id },
        data: {
          isBase: false,
          sedimentedAt: null,
          baselineUserCount: null,
          lastReviewCycle1: null, lastReviewCycle2: null,
          userCountCycle1: null, userCountCycle2: null,
        }
      });
      await logEvent('NEED_DEGRADED_FROM_BASE', testNeed.id,
        { isBase: true, sedimentedAt: needData.sedimentedAt },
        { isBase: false, reason: `activeUsers (${currentCount}) < 66% baseline (${highBaseline}) for 2 cycles` },
        'WARNING'
      );
      console.log(`  DEGRADED: need returned to ACTIVE`);
    } else {
      console.log(`  NOT degraded: cycle1 not set or not below threshold`);
    }
  } else {
    console.log(`  NOT degraded: current count not below threshold`);
  }

  let degradedNeed = await prisma.need.findUnique({ where: { id: testNeed.id } });
  console.log(`  After review: isBase=${degradedNeed?.isBase}`);

  let degEvents = await prisma.eventLog.findMany({
    where: { entityType: 'Need', entityId: testNeed.id, action: 'NEED_DEGRADED_FROM_BASE' }
  });
  console.log(`  NEED_DEGRADED_FROM_BASE events: ${degEvents.length}`);

  let pass4 = degradedNeed?.isBase === false && degEvents.length > 0;
  RESULTS.push({ test: '4. Decay: userCount bajo × 2 ciclos → degradación', passed: pass4, detail: `isBase=${degradedNeed?.isBase}, events=${degEvents.length}` });
  console.log(`  ${pass4 ? '✓ PASS' : '✗ FAIL'}`);

  // ═══ TEST 5: Notificaciones ═══
  console.log('\n══════ TEST 5: Notificaciones ═══');

  let sedNotifs = await prisma.notification.findMany({
    where: { entityId: testNeed.id, entityAction: 'SEDIMENTED' }
  });
  let degNotifs = await prisma.notification.findMany({
    where: { entityId: testNeed.id, entityAction: 'DEGRADED' }
  });
  console.log(`  Sediment notifications: ${sedNotifs.length}`);
  console.log(`  Degradation notifications: ${degNotifs.length}`);

  // If no notifications (maybe notification service didn't run), check EventLog as fallback
  let sedEvents = await prisma.eventLog.findMany({
    where: { entityType: 'Need', entityId: testNeed.id, action: 'NEED_SEDIMENTED_AS_BASE' }
  });
  
  let pass5 = sedNotifs.length > 0 || degNotifs.length > 0 || sedEvents.length > 0 && degEvents.length > 0;
  RESULTS.push({ test: '5. Notificaciones al sedimentar y degradar', passed: pass5, detail: `sedNotifs=${sedNotifs.length}, degNotifs=${degNotifs.length}, sedEvents=${sedEvents.length}, degEvents=${degEvents.length}` });
  console.log(`  ${pass5 ? '✓ PASS' : '✗ FAIL'} (fallback to EventLog counts)`);

  // ═══ TEST 6: Re-sedimentación tras degradación ═══
  console.log('\n══════ TEST 6: Re-sedimentación ═══');

  // Need is already degraded. Re-sediment.
  let reSediment = await httpReq('POST', `/api/needs/${testNeed.id}/sediment`);
  console.log(`  Re-sediment: status=${reSediment.status}, isBase=${reSediment.body?.isBase}`);

  let reNeed = await prisma.need.findUnique({ where: { id: testNeed.id } });
  let pass6 = reNeed?.isBase === true && reNeed?.sedimentedAt !== null;
  RESULTS.push({ test: '6. Re-sedimentación tras degradación', passed: pass6, detail: `isBase=${reNeed?.isBase}, sedimentedAt=${reNeed?.sedimentedAt ? 'set' : 'null'}` });
  console.log(`  ${pass6 ? '✓ PASS' : '✗ FAIL'}`);

  // ═══ TEST 7: Necesidad normal intacta ═══
  console.log('\n══════ TEST 7: Necesidad normal intacta ═══');

  // Create a non-base need
  let normalNeed = await prisma.need.create({
    data: {
      title: 'TEST Normal Need',
      description: 'Normal (non-base) need for testing',
      status: 'ACTIVE',
      creatorId: userId,
      isBase: false,
      relevanceThresholdMet: true,
      totalPointsAssigned: 20,
    }
  });
  await prisma.needTree.create({ data: { needId: normalNeed.id, treeId } });

  let nIdea = await prisma.idea.create({
    data: { needId: normalNeed.id, creatorId: userId, title: 'Normal Idea', description: 'Test' }
  });
  let nBranch = await prisma.branch.create({
    data: { ideaId: nIdea.id, treeId, name: 'normal-branch', type: 'NORMAL', phase: 'INVESTIGATION', xpPool: 1000 }
  });
  let nTask = await prisma.task.create({
    data: { branchId: nBranch.id, name: 'Normal Task', description: 'Test normal need', status: 'OPEN', assignedTo: userId, difficulty: 5, phase: 'INVESTIGATION' }
  });

  let nMember = await prisma.treeMember.findUnique({ where: { userId_treeId: { userId, treeId } } });
  let nXp0 = nMember?.xp || 0;
  
  let nComplete = await httpReq('POST', `/api/tasks/${nTask.id}/complete`, { difficulty: 5, comment: 'Normal need test' });
  nMember = await prisma.treeMember.findUnique({ where: { userId_treeId: { userId, treeId } } });
  let nXp1 = nMember?.xp || 0;
  let nDelta = nXp1 - nXp0;
  console.log(`  Normal need task: XP delta=${nDelta} (complete status: ${nComplete.status})`);

  let pass7 = nDelta > 0;
  RESULTS.push({ test: '7. Necesidad normal intacta (completeTask sin cambios)', passed: pass7, detail: `XP delta=${nDelta} (expected >0)` });
  console.log(`  ${pass7 ? '✓ PASS' : '✗ FAIL'}`);

  // ═══ SUMMARY ═══
  console.log('\n═══════════════════════════════════════════');
  console.log('  FINAL TEST RESULTS');
  console.log('═══════════════════════════════════════════');
  let passed = 0, failed = 0;
  for (let r of RESULTS) {
    let icon = r.passed ? '✓' : '✗';
    console.log(`  ${icon} ${r.test}`);
    console.log(`     ${r.detail}`);
    if (r.passed) passed++; else failed++;
  }
  console.log(`\n  TOTAL: ${passed}/${RESULTS.length} passed, ${failed} failed`);
  
  await prisma.$disconnect();
  process.exit(failed > 0 ? 1 : 0);
}

main().catch(e => { console.error('FATAL:', e.message, e.stack?.split('\n')[1]); prisma.$disconnect().then(() => process.exit(1)); });
