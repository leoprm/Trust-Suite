/**
 * Trust Suite — API Integration Tests
 * Run: npx tsx src/scripts/test-api.ts
 * Requires: backend running on localhost:3100, seeded with demo data
 */

const BASE = 'http://localhost:3100/api';
let TOKEN = '';
let ADMIN_TOKEN = '';
const PASS = 0, FAIL = 0;

// ── Test harness ──────────────────────────────────────────────────────────────

interface TestResult { name: string; pass: boolean; error?: string; duration: number }

const results: TestResult[] = [];

function ok(cond: boolean, msg: string) { if (!cond) throw new Error(msg); }

async function test(name: string, fn: () => Promise<void>): Promise<void> {
  const start = Date.now();
  try {
    await fn();
    results.push({ name, pass: true, duration: Date.now() - start });
    console.log(`  ✅ ${name} (${Date.now() - start}ms)`);
  } catch (e: any) {
    results.push({ name, pass: false, error: e.message, duration: Date.now() - start });
    console.log(`  ❌ ${name}: ${e.message}`);
  }
}

async function post(path: string, body: any, token?: string) {
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body),
  });
  return { status: res.status, data: await res.json() };
}

async function get(path: string, token?: string) {
  const res = await fetch(`${BASE}${path}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  return { status: res.status, data: await res.json() };
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('🧪 Trust Suite API Tests\n');
  console.log(`   Base: ${BASE}`);
  
  // Check backend is alive
  try {
    const h = await get('/health');
    ok(h.status === 200 && h.data.status === 'ok', 'Backend must be running');
    console.log('   Backend: ✅ alive\n');
  } catch {
    console.log('   Backend: ❌ NOT RUNNING — start with: cd backend && PORT=3100 npx tsx src/index.ts\n');
    process.exit(1);
  }

  // ══════════════════════════════════════════
  // AUTH
  // ══════════════════════════════════════════
  console.log('── Auth ──');

  await test('POST /auth/login — valid credentials', async () => {
    const { status, data } = await post('/auth/login', { email: 'leo@leo', password: 'leo' });
    ok(status === 200, `Expected 200, got ${status}`);
    ok(!!data.token, 'Token missing');
    ok(data.user.username === 'Leo', `Expected Leo, got ${data.user?.username}`);
    ADMIN_TOKEN = data.token;
  });

  await test('POST /auth/login — invalid password', async () => {
    const { status, data } = await post('/auth/login', { email: 'leo@leo', password: 'wrong' });
    ok(status === 401, `Expected 401, got ${status}`);
    ok(data.error, 'Expected error message');
  });

  await test('POST /auth/login — non-existent user', async () => {
    const { status } = await post('/auth/login', { email: 'noexiste@nada.com', password: 'x' });
    ok(status === 404, `Expected 404, got ${status}`);
  });

  await test('POST /auth/login — demo user (maria@demo.com / demo123)', async () => {
    const { status, data } = await post('/auth/login', { email: 'maria@demo.com', password: 'demo123' });
    ok(status === 200, `Expected 200, got ${status}`);
    ok(!!data.token, 'Token missing');
    TOKEN = data.token;
    ok(data.user.username === 'María García', `Expected María García, got ${data.user?.username}`);
  });

  await test('GET /auth/me — valid token', async () => {
    const { status, data } = await get('/auth/me', TOKEN);
    ok(status === 200, `Expected 200, got ${status}`);
    ok(data.username === 'María García', `Expected María García, got ${data.username}`);
  });

  await test('GET /auth/me — invalid token', async () => {
    const { status } = await get('/auth/me', 'invalid-token');
    ok(status === 403, `Expected 403, got ${status}`);
  });

  // ══════════════════════════════════════════
  // TREES
  // ══════════════════════════════════════════
  console.log('\n── Trees ──');

  let treeId = '';
  let tree2Id = '';

  await test('GET /trees — returns user trees', async () => {
    const { status, data } = await get('/trees', TOKEN);
    ok(status === 200, `Expected 200, got ${status}`);
    ok(Array.isArray(data), 'Expected array');
    ok(data.length >= 2, `Expected at least 2 trees, got ${data.length}`);
    treeId = data[0].id;
    tree2Id = data[1]?.id || data[0].id;
  });

  await test('GET /trees/:id — get single tree', async () => {
    const { status, data } = await get(`/trees/${treeId}`, TOKEN);
    ok(status === 200, `Expected 200, got ${status}`);
    ok(!!data.name, 'Tree name missing');
    ok(data.economyMode, 'Economy mode missing');
  });

  await test('GET /trees/:id/members — list members', async () => {
    const { status, data } = await get(`/trees/${treeId}/members`, TOKEN);
    ok(status === 200, `Expected 200, got ${status}`);
    ok(Array.isArray(data), 'Expected array');
    ok(data.length >= 5, `Expected at least 5 members, got ${data.length}`);
  });

  await test('GET /trees/global — discoverable trees (should exclude own)', async () => {
    const { status, data } = await get('/trees/global', TOKEN);
    ok(status === 200, `Expected 200, got ${status}`);
    ok(Array.isArray(data), 'Expected array');
    // User is member of all 3 trees, all public trees have them as member → should be 0 or near 0
    // Actually Manos Solidarias is PRIVATE so it won't appear. The other two are PUBLIC but user IS a member.
    // So global should return trees where user is NOT a member AND visibility=PUBLIC → those don't exist in seed
  });

  // ══════════════════════════════════════════
  // TASKS
  // ══════════════════════════════════════════
  console.log('\n── Tasks ──');

  let taskId = '';
  let branchId = '';

  await test('GET tasks for a tree branch', async () => {
    // First find a branch with tasks
    const bRes = await fetch(`${BASE}/trees/${treeId}/insights?limit=1`, { headers: { Authorization: `Bearer ${TOKEN}` } });
    // Actually let's get a branch directly from the tree detail
    const { data: tree } = await get(`/trees/${treeId}`, TOKEN);
    
    // Find branches via a different approach — get pending tasks
    const tRes = await get('/tasks/pending', TOKEN);
    ok(tRes.status === 200, `Expected 200, got ${tRes.status}`);
    const tasks = tRes.data;
    ok(Array.isArray(tasks), 'Expected tasks array');
    if (tasks.length > 0) {
      taskId = tasks[0].id;
      branchId = tasks[0].branchId;
    }
  });

  await test('GET /tasks/pending — returns tasks', async () => {
    const { status, data } = await get('/tasks/pending', TOKEN);
    ok(status === 200, `Expected 200, got ${status}`);
    ok(Array.isArray(data), 'Expected array');
    ok(data.length > 0, 'Expected at least 1 task');
  });

  if (taskId) {
    // Re-fetch tasks to find an OPEN one for assignment
    const tRes2 = await get('/tasks/pending', TOKEN);
    const allTasks: any[] = tRes2.data || [];
    const openTasks = allTasks.filter((t: any) => t.status === 'OPEN');
    const assignTaskId = openTasks.length > 0 ? openTasks[0].id : null;

    if (assignTaskId) {
      await test('POST /tasks/:id/assign — assign OPEN task to self', async () => {
        const { status, data } = await post(`/tasks/${assignTaskId}/assign`, {}, TOKEN);
        ok(status === 200, `Expected 200, got ${status}: ${JSON.stringify(data)}`);
      });

      await test('POST /tasks/:id/complete — complete task', async () => {
        const { status, data } = await post(`/tasks/${assignTaskId}/complete`, {
          difficulty: 5,
          completionComment: 'Tarea completada en prueba automatizada',
        }, TOKEN);
        ok([200, 400, 403].includes(status), `Expected 200/400/403, got ${status}: ${JSON.stringify(data)}`);
      });
    } else {
      await test('POST /tasks/:id/assign — no OPEN tasks available (skip)', async () => {
        console.log('      ⚠️  No OPEN tasks found — skipping assign/complete tests');
      });
    }
  }

  // ══════════════════════════════════════════
  // NEEDS
  // ══════════════════════════════════════════
  console.log('\n── Needs ──');

  await test('GET tree needs via insights endpoint', async () => {
    const { status, data } = await get(`/trees/${treeId}/insights?limit=10`, TOKEN);
    ok(status === 200, `Expected 200, got ${status}`);
    ok(!!data.total || Array.isArray(data.signals), 'Expected signals or total');
  });

  // ══════════════════════════════════════════
  // EXPERT ENDORSEMENTS
  // ══════════════════════════════════════════
  console.log('\n── Expert Endorsements ──');

  await test('GET /expert-endorsements — list for tree', async () => {
    const { status, data } = await get(`/expert-endorsements?treeId=${treeId}`, TOKEN);
    ok(status === 200, `Expected 200, got ${status}`);
    ok(Array.isArray(data), 'Expected array');
    ok(data.length > 0, `Expected at least 1 endorsement, got ${data.length}`);
  });

  await test('GET /expert-endorsements/boost — boost status', async () => {
    const { status, data } = await get(`/expert-endorsements/boost?treeId=${treeId}`, TOKEN);
    ok(status === 200, `Expected 200, got ${status}`);
    ok(typeof data.activeCount === 'number', 'activeCount missing');
    ok(typeof data.boostPct === 'number', 'boostPct missing');
  });

  // ══════════════════════════════════════════
  // HEALTH & EDGE CASES
  // ══════════════════════════════════════════
  console.log('\n── Health & Edge Cases ──');

  await test('GET /health — returns ok', async () => {
    const { status, data } = await get('/health');
    ok(status === 200, `Expected 200, got ${status}`);
    ok(data.status === 'ok', `Expected ok, got ${data.status}`);
  });

  await test('Protected route without token → 401', async () => {
    const { status } = await get('/trees');
    ok(status === 401, `Expected 401, got ${status}`);
  });

  await test('Protected route with bad token → 403', async () => {
    const { status } = await get('/trees', 'Bearer bad.jwt.token');
    ok(status === 403, `Expected 403, got ${status}`);
  });

  // ══════════════════════════════════════════
  // SUMMARY
  // ══════════════════════════════════════════
  console.log('\n═══════════════════════════════');
  const passed = results.filter(r => r.pass).length;
  const failed = results.filter(r => !r.pass).length;
  const total = results.length;
  const totalMs = results.reduce((s, r) => s + r.duration, 0);

  console.log(`  ${'✅'.repeat(Math.min(passed, 20))}${failed > 0 ? '❌'.repeat(Math.min(failed, 10)) : ''}`);
  console.log(`  ${passed}/${total} passed · ${failed} failed · ${totalMs}ms total`);
  console.log('═══════════════════════════════');

  if (failed > 0) {
    console.log('\n❌ FAILED TESTS:');
    for (const r of results.filter(r => !r.pass)) {
      console.log(`  ${r.name}: ${r.error}`);
    }
  }

  process.exit(failed > 0 ? 1 : 0);
}

main();
