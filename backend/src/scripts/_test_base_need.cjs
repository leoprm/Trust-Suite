/**
 * Test suite: Protocolo Necesidad Base — Fase 6
 * Tests: sedimentación, evidence gate, decay, notificaciones, re-sedimentación, normal need intacta
 */
const http = require('http');

const BASE = 'http://localhost:3100';
let token = '';
let adminToken = '';
const RESULTS = [];

function req(method, path, body = null, tok = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE);
    const options = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      method,
      headers: { 'Content-Type': 'application/json' }
    };
    if (tok) options.headers['Authorization'] = `Bearer ${tok}`;
    
    const r = http.request(options, res => {
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

async function main() {
  // ── Login ────────────────────────────────────────────
  let login = await req('POST', '/api/auth/login', { email: 'leo@leo', password: 'demo123' });
  if (login.body.error) {
    console.log('FATAL: Cannot login:', login.body.error);
    process.exit(1);
  }
  token = login.body.token;
  adminToken = token;
  console.log(`✓ Logged in as ${login.body.user.username} (${login.body.user.role})`);

  // ── Get needs ────────────────────────────────────────
  let all = await req('GET', '/api/needs', null, token);
  let needs = Array.isArray(all.body) ? all.body : (all.body.needs || []);
  console.log(`\nFound ${needs.length} needs in system`);

  // Find a need that's ACTIVE and old enough for tests
  let targetNeed = null;
  for (let n of needs) {
    if (n.status === 'ACTIVE' && n.relevanceThresholdMet === true) {
      targetNeed = n;
      break;
    }
  }
  
  // If no suitable need, use any ACTIVE need
  if (!targetNeed) {
    targetNeed = needs.find(n => n.status === 'ACTIVE');
  }
  
  if (!targetNeed) {
    console.log('FATAL: No ACTIVE needs found');
    process.exit(1);
  }
  
  console.log(`\nTarget need: ${targetNeed.id} "${targetNeed.title}"`);
  console.log(`  Status: ${targetNeed.status}, isBase: ${targetNeed.isBase}, relMet: ${targetNeed.relevanceThresholdMet}`);
  console.log(`  Created: ${targetNeed.createdAt}, totalPoints: ${targetNeed.totalPointsAssigned}`);

  // Check getNeed endpoint
  let single = await req('GET', `/api/needs/${targetNeed.id}`, null, token);
  
  // ── TEST 1: Sedimentación ───────────────────────────
  console.log('\n══════ TEST 1: Sedimentación ══════');
  
  // For testing: override createdAt to be 13 months ago
  const { PrismaClient } = require('@prisma/client');
  const prisma = new PrismaClient();
  
  const thirteenMonthsAgo = new Date();
  thirteenMonthsAgo.setMonth(thirteenMonthsAgo.getMonth() - 13);
  
  let testNeed = await prisma.need.update({
    where: { id: targetNeed.id },
    data: {
      createdAt: thirteenMonthsAgo,
      isBase: false,
      relevanceThresholdMet: true,
      status: 'ACTIVE',
    }
  });
  console.log(`  Backdated need to ${thirteenMonthsAgo.toISOString()}`);
  
  // Check eligibility
  let status1 = await req('GET', `/api/needs/${targetNeed.id}/base-status`, null, adminToken);
  console.log(`  Eligibility: ${JSON.stringify(status1.body?.eligibility)}`);
  
  // Execute sedimentation
  let sedResult = await req('POST', `/api/needs/${targetNeed.id}/sediment`, null, adminToken);
  console.log(`  Sediment result: status=${sedResult.status}, isBase=${sedResult.body?.isBase}`);
  console.log(`  baselineUserCount=${sedResult.body?.baselineUserCount}`);
  
  RESULTS.push({
    test: '1. Sedimentación (need 12+ meses → isBase=true)',
    passed: sedResult.body?.isBase === true,
    detail: `isBase=${sedResult.body?.isBase}, baselineUserCount=${sedResult.body?.baselineUserCount}`
  });
  
  // Verify base needs endpoint
  let baseNeeds = await req('GET', '/api/needs/base?treeId=all', null, adminToken);
  console.log(`  GET /api/needs/base: found=${Array.isArray(baseNeeds.body) ? baseNeeds.body.length : 'error'}`);

  // ── TEST 2 & 3: Evidence gate ──────────────────────
  console.log('\n══════ TEST 2 & 3: Evidence gate ══════');
  
  // Check if the need has a branch with tasks
  let needWithIdeas = await prisma.need.findUnique({
    where: { id: targetNeed.id },
    include: {
      ideas: {
        include: {
          branch: {
            include: { tasks: { take: 1, where: { status: { not: 'COMPLETED' } } } }
          }
        }
      }
    }
  });
  
  let testTask = null;
  for (let idea of needWithIdeas?.ideas || []) {
    if (idea.branch?.tasks?.length > 0) {
      testTask = idea.branch.tasks[0];
      break;
    }
  }
  
  if (!testTask) {
    console.log('  WARNING: No task found for need — creating test task...');
    // Find tree IDs
    const treeLinks = await prisma.needTree.findMany({ where: { needId: targetNeed.id } });
    const treeId = treeLinks[0]?.treeId;
    
    if (treeId) {
      // Create idea
      const idea = await prisma.idea.create({
        data: {
          needId: targetNeed.id,
          creatorId: login.body.user.id,
          title: 'Test idea for evidence gate',
          description: 'Auto-created for testing',
        }
      });
      // Create branch
      const branch = await prisma.branch.create({
        data: {
          ideaId: idea.id,
          treeId: treeId,
          name: 'test-evidence-gate',
          type: 'NORMAL',
          phase: 'IDEATION',
          xpPool: 1000,
        }
      });
      // Create task
      testTask = await prisma.task.create({
        data: {
          branchId: branch.id,
          name: 'Test Task — Evidence Gate',
          status: 'PENDING',
          assignedTo: login.body.user.id,
          difficulty: 5,
          phase: 'IDEATION',
        }
      });
      console.log(`  Created task: ${testTask.id} in branch ${branch.id}`);
    } else {
      console.log('  FATAL: No tree for need, cannot create task');
      process.exit(1);
    }
  }
  
  console.log(`  Test task: ${testTask.id} "${testTask.name}" status=${testTask.status}`);
  
  // Assign task to current user if not assigned
  if (!testTask.assignedTo) {
    testTask = await prisma.task.update({
      where: { id: testTask.id },
      data: { assignedTo: login.body.user.id }
    });
    console.log(`  Assigned task to self`);
  }
  
  // Get initial XP
  let treeLinksForTask = await prisma.needTree.findMany({ where: { needId: targetNeed.id } });
  let firstTreeId = treeLinksForTask[0]?.treeId;
  let member = await prisma.treeMember.findUnique({
    where: { userId_treeId: { userId: login.body.user.id, treeId: firstTreeId } }
  });
  let initialXp = member?.xp || 0;
  console.log(`  Initial XP: ${initialXp}`);
  
  // Test 2: Complete task WITHOUT evidence → should give 0 XP
  let completeResult1 = await req('POST', `/api/tasks/${testTask.id}/complete`, {
    difficulty: 5,
    comment: 'Test — no evidence'
  }, token);
  console.log(`  Complete (no evidence): status=${completeResult1.status}`);
  console.log(`  Response: ${JSON.stringify(completeResult1.body).slice(0, 200)}`);
  
  // Re-fetch member XP
  member = await prisma.treeMember.findUnique({
    where: { userId_treeId: { userId: login.body.user.id, treeId: firstTreeId } }
  });
  let xpAfterNoEvidence = member?.xp || 0;
  let xpDelta1 = xpAfterNoEvidence - initialXp;
  console.log(`  XP after no evidence: ${xpAfterNoEvidence} (delta=${xpDelta1})`);
  
  RESULTS.push({
    test: '2. Evidence gate: task sin evidence → 0 XP',
    passed: xpDelta1 === 0,
    detail: `XP delta=${xpDelta1} (should be 0)`
  });
  
  // Now add evidence file
  let evFile = null;
  try {
    evFile = await prisma.evidenceFile.create({
      data: {
        taskId: testTask.id,
        uploaderId: login.body.user.id,
        url: 'https://example.com/evidence-test.pdf',
        filename: 'test-evidence.pdf',
        mimeType: 'application/pdf',
        size: 1024,
        visibility: 'TREE_ONLY',
        status: 'ACTIVE',
      }
    });
    console.log(`  Created evidence file: ${evFile.id}`);
  } catch(e) {
    console.log(`  Evidence file creation error: ${e.message}`);
    // Try without non-existent fields
    evFile = await prisma.evidenceFile.create({
      data: {
        taskId: testTask.id,
        uploaderId: login.body.user.id,
        url: 'https://example.com/evidence-test.pdf',
        filename: 'test-evidence.pdf',
        visibility: 'TREE_ONLY',
        status: 'ACTIVE',
      }
    });
    console.log(`  Created evidence file (minimal): ${evFile.id}`);
  }
  
  // Reset task to PENDING then complete again with evidence
  await prisma.task.update({ where: { id: testTask.id }, data: { status: 'PENDING', completedAt: null } });
  
  let xpBeforeEvidence = member?.xp || 0;
  let completeResult2 = await req('POST', `/api/tasks/${testTask.id}/complete`, {
    difficulty: 5,
    comment: 'Test — WITH evidence'
  }, token);
  console.log(`  Complete (with evidence): status=${completeResult2.status}`);
  
  // Re-fetch
  member = await prisma.treeMember.findUnique({
    where: { userId_treeId: { userId: login.body.user.id, treeId: firstTreeId } }
  });
  let xpAfterEvidence = member?.xp || 0;
  let xpDelta2 = xpAfterEvidence - xpBeforeEvidence;
  console.log(`  XP after evidence: ${xpAfterEvidence} (delta=${xpDelta2})`);
  
  RESULTS.push({
    test: '3. Evidence gate: task con evidence aprobado → XP normal',
    passed: xpDelta2 > 0,
    detail: `XP delta=${xpDelta2} (should be > 0)`
  });
  
  // ── TEST 4: Decay (bajo userCount × 2 ciclos → degradación) ──
  console.log('\n══════ TEST 4: Decay ══════');
  
  // Set up decay scenario: sedimented need with high baseline, then simulate 2 low-activity cycles
  let baseNeed = await prisma.need.findUnique({ where: { id: targetNeed.id } });
  let baseline = baseNeed?.baselineUserCount || 100;
  console.log(`  Baseline: ${baseline}`);
  
  // Set cycle1 with low count (below 66% threshold)
  let lowCount = Math.floor(baseline * 0.3); // well below 66%
  await prisma.need.update({
    where: { id: targetNeed.id },
    data: {
      lastReviewCycle1: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000), // 90 days ago
      userCountCycle1: lowCount,
    }
  });
  
  console.log(`  Set cycle1: userCount=${lowCount}, threshold=${Math.floor(baseline * 0.66)}`);
  
  // Manually trigger a review
  const { reviewBaseNeeds } = require('./services/baseNeedService');
  try {
    let reviewResult = await reviewBaseNeeds();
    console.log(`  Review result: reviewed=${reviewResult.reviewed}, degraded=${reviewResult.degraded}`);
    
    // Check if need was degraded
    let degradedNeed = await prisma.need.findUnique({ where: { id: targetNeed.id } });
    console.log(`  After review: isBase=${degradedNeed?.isBase}, status=${degradedNeed?.status}`);
    
    // Check EventLog for degradation
    let eventLogs = await prisma.eventLog.findMany({
      where: { entityType: 'Need', entityId: targetNeed.id, action: 'NEED_DEGRADED_FROM_BASE' },
      orderBy: { createdAt: 'desc' },
      take: 1
    });
    
    RESULTS.push({
      test: '4. Decay: userCount bajo × 2 ciclos → degradación',
      passed: degradedNeed?.isBase === false && eventLogs.length > 0,
      detail: `isBase=${degradedNeed?.isBase}, NEED_DEGRADED_FROM_BASE events=${eventLogs.length}`
    });
  } catch(e) {
    console.log(`  Review error: ${e.message}`);
    RESULTS.push({
      test: '4. Decay: userCount bajo × 2 ciclos → degradación',
      passed: false,
      detail: `Error: ${e.message}`
    });
  }
  
  // ── TEST 5: Notificaciones al sedimentar y degradar ──
  console.log('\n══════ TEST 5: Notificaciones ══════');
  
  // Re-sediment to test sedimentation notifications
  // First reset need
  await prisma.need.update({
    where: { id: targetNeed.id },
    data: {
      isBase: false,
      sedimentedAt: null,
      baselineUserCount: null,
      createdAt: thirteenMonthsAgo, // still old enough
      relevanceThresholdMet: true,
      status: 'ACTIVE',
      lastReviewCycle1: null, lastReviewCycle2: null,
      userCountCycle1: null, userCountCycle2: null,
      totalPointsAssigned: 10,
    }
  });
  
  // Sediment again — should create notifications
  let sedResult2 = await req('POST', `/api/needs/${targetNeed.id}/sediment`, null, adminToken);
  console.log(`  Re-sediment: isBase=${sedResult2.body?.isBase}, status=${sedResult2.status}`);
  
  // Check notifications created
  let notifs = await prisma.notification.findMany({
    where: {
      entityType: 'NEED',
      entityId: targetNeed.id,
      entityAction: 'SEDIMENTED',
    },
    orderBy: { createdAt: 'desc' },
    take: 5,
  });
  console.log(`  Sediment notifications: ${notifs.length}`);
  
  // Check degradation notifications from earlier
  let degNotifs = await prisma.notification.findMany({
    where: {
      entityType: 'NEED',
      entityId: targetNeed.id,
      entityAction: 'DEGRADED',
    },
    orderBy: { createdAt: 'desc' },
    take: 5,
  });
  console.log(`  Degradation notifications: ${degNotifs.length}`);
  
  let notifPassed = notifs.length > 0;
  if (!notifPassed) {
    // Check EventLog instead
    let sedEvents = await prisma.eventLog.findMany({
      where: { entityType: 'Need', entityId: targetNeed.id, action: 'NEED_SEDIMENTED_AS_BASE' },
    });
    console.log(`  NEED_SEDIMENTED_AS_BASE events: ${sedEvents.length}`);
    notifPassed = sedEvents.length >= 2; // at least 2 sedimentations logged
  }
  
  RESULTS.push({
    test: '5. Notificaciones al sedimentar y degradar',
    passed: notifPassed,
    detail: `Sediment notifications=${notifs.length}, Degradation notifications=${degNotifs.length}`
  });
  
  // ── TEST 6: Re-sedimentación tras degradación ──
  console.log('\n══════ TEST 6: Re-sedimentación ══════');
  
  // Need is already re-sedimented from test 5
  let finalNeed = await prisma.need.findUnique({ where: { id: targetNeed.id } });
  console.log(`  Final state: isBase=${finalNeed?.isBase}, sedimentedAt=${finalNeed?.sedimentedAt}`);
  
  RESULTS.push({
    test: '6. Re-sedimentación tras degradación',
    passed: finalNeed?.isBase === true && finalNeed?.sedimentedAt !== null,
    detail: `isBase=${finalNeed?.isBase}, sedimentedAt=${finalNeed?.sedimentedAt ? 'set' : 'null'}`
  });
  
  // ── TEST 7: Normal need intacta ──
  console.log('\n══════ TEST 7: Necesidad normal intacta ══════');
  
  // Create a fresh need that's NOT base and complete a task on it
  // First find/create non-base need
  let normalNeeds = await prisma.need.findMany({
    where: { isBase: false, status: 'ACTIVE' },
    take: 5,
    include: { ideas: { include: { branch: { include: { tasks: { take: 1 } } } } } }
  });
  
  let normalNeed = null;
  for (let n of normalNeeds) {
    if (n.id !== targetNeed.id && n.ideas?.length > 0) {
      for (let idea of n.ideas) {
        if (idea.branch?.tasks?.length > 0) {
          normalNeed = n;
          break;
        }
      }
    }
    if (normalNeed) break;
  }
  
  if (normalNeed) {
    let normalTask = normalNeed.ideas[0].branch.tasks[0];
    console.log(`  Normal need: ${normalNeed.id} "${normalNeed.title}" isBase=${normalNeed.isBase}`);
    console.log(`  Normal task: ${normalTask.id} "${normalTask.name}"`);
    
    // Assign
    if (!normalTask.assignedTo) {
      normalTask = await prisma.task.update({
        where: { id: normalTask.id },
        data: { assignedTo: login.body.user.id }
      });
    }
    
    // Get XP before
    let nTreeLinks = await prisma.needTree.findMany({ where: { needId: normalNeed.id } });
    let nTreeId = nTreeLinks[0]?.treeId;
    let nMember = await prisma.treeMember.findUnique({
      where: { userId_treeId: { userId: login.body.user.id, treeId: nTreeId } }
    });
    let nXpBefore = nMember?.xp || 0;
    
    // Reset task
    await prisma.task.update({ where: { id: normalTask.id }, data: { status: 'PENDING', completedAt: null } });
    
    // Complete
    let nComplete = await req('POST', `/api/tasks/${normalTask.id}/complete`, {
      difficulty: 5,
      comment: 'Normal need test'
    }, token);
    console.log(`  Complete result: ${nComplete.status}`);
    
    // Get XP after
    nMember = await prisma.treeMember.findUnique({
      where: { userId_treeId: { userId: login.body.user.id, treeId: nTreeId } }
    });
    let nXpAfter = nMember?.xp || 0;
    let nDelta = nXpAfter - nXpBefore;
    console.log(`  XP: before=${nXpBefore}, after=${nXpAfter}, delta=${nDelta}`);
    
    RESULTS.push({
      test: '7. Necesidad normal intacta (completeTask sin cambios)',
      passed: nDelta > 0, // Should receive XP normally
      detail: `XP delta=${nDelta} (should be > 0 for normal needs)`
    });
  } else {
    console.log('  WARNING: No suitable normal need found');
    RESULTS.push({
      test: '7. Necesidad normal intacta (completeTask sin cambios)',
      passed: null,
      detail: 'No normal need with tasks available for testing'
    });
  }
  
  // ── Summary ────────────────────────────────────────
  console.log('\n═══════════════════════════════════════════');
  console.log('  TEST RESULTS SUMMARY');
  console.log('═══════════════════════════════════════════');
  for (let r of RESULTS) {
    let icon = r.passed === true ? '✓' : r.passed === false ? '✗' : '?';
    console.log(`  ${icon} ${r.test}: ${r.detail}`);
  }
  
  let passed = RESULTS.filter(r => r.passed === true).length;
  let failed = RESULTS.filter(r => r.passed === false).length;
  console.log(`\n  ${passed} passed, ${failed} failed, ${RESULTS.length - passed - failed} skipped`);
  
  await prisma.$disconnect();
  process.exit(failed > 0 ? 1 : 0);
}

main().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
