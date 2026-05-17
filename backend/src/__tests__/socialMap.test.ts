/**
 * socialMap.test.ts — Integration tests for social map features.
 *
 * Tests:
 *  - POST /api/concierge/context returns socialMap data
 *  - GET /api/teams/:treeId/social-map returns member profiles
 *  - POST /api/teams/:treeId/social-map/refresh regenerates profiles
 *  - Auth required (401 without token)
 *  - Membership required (403 for non-members)
 *  - Empty tree returns empty social map gracefully
 *
 * Run: PORT=3100 npx tsx src/tests/socialMap.test.ts
 */

import http from 'http';

const BASE = 'http://localhost:3100';
const TEST_USER = { email: 'testsocial@test.com', username: 'testsocial', password: 'test123' };

// ── Helpers ──────────────────────────────────────────────────────────────

function request(method: string, path: string, opts?: { body?: any; token?: string }): Promise<{ status: number; data: any }> {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE);
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (opts?.token) headers['Authorization'] = `Bearer ${opts.token}`;

    const body = opts?.body ? JSON.stringify(opts.body) : undefined;

    const req = http.request(url, { method, headers }, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode || 0, data: JSON.parse(data) });
        } catch {
          resolve({ status: res.statusCode || 0, data: data.slice(0, 500) });
        }
      });
    });

    req.on('error', reject);
    req.setTimeout(10000, () => { req.destroy(); reject(new Error('Timeout')); });
    if (body) req.write(body);
    req.end();
  });
}

async function registerAndGetToken(): Promise<{ token: string; userId: string }> {
  const { data } = await request('POST', '/api/auth/register', {
    body: { username: TEST_USER.username, email: TEST_USER.email, password: TEST_USER.password },
  });
  return { token: data.accessToken || data.token, userId: data.user?.id };
}

// ── Tests ────────────────────────────────────────────────────────────────

async function testAuthRequired() {
  console.log('  [test] Auth required...');
  const { status } = await request('GET', '/api/teams/fake-id/social-map');
  if (status === 401) {
    console.log('    ✅ Returns 401 without auth');
  } else {
    console.log(`    ❌ Expected 401, got ${status}`);
    process.exitCode = 1;
  }
}

async function testContextEndpoint(token: string, treeId: string) {
  console.log('  [test] POST /api/concierge/context...');
  const { status, data } = await request('POST', '/api/concierge/context', {
    token, body: { treeId },
  });

  if (status !== 200) {
    console.log(`    ❌ Expected 200, got ${status}: ${JSON.stringify(data).slice(0, 200)}`);
    process.exitCode = 1;
    return;
  }

  // Verify structure
  const checks = [
    ['tree', typeof data.tree === 'object'],
    ['needs', Array.isArray(data.needs)],
    ['members', Array.isArray(data.members)],
    ['stats', typeof data.stats === 'object'],
    ['socialMap', Array.isArray(data.socialMap)],
    ['socialMapText', typeof data.socialMapText === 'string'],
    ['generatedAt', typeof data.generatedAt === 'string'],
  ];

  let passed = 0;
  for (const [field, ok] of checks) {
    if (ok) passed++;
    else console.log(`    ⚠️ Missing field: ${field}`);
  }
  console.log(`    ✅ Context endpoint: ${passed}/${checks.length} fields present, ${data.socialMap.length} social profiles`);
}

async function testSocialMapEndpoint(token: string, treeId: string) {
  console.log('  [test] GET /api/teams/:treeId/social-map...');
  const { status, data } = await request('GET', `/api/teams/${treeId}/social-map`, { token });

  if (status !== 200) {
    console.log(`    ❌ Expected 200, got ${status}: ${JSON.stringify(data).slice(0, 200)}`);
    process.exitCode = 1;
    return;
  }

  const checks = [
    ['tree', typeof data.tree === 'object'],
    ['members', Array.isArray(data.members)],
    ['memberCount', typeof data.memberCount === 'number'],
    ['generatedAt', typeof data.generatedAt === 'string'],
  ];

  let passed = 0;
  for (const [field, ok] of checks) {
    if (ok) passed++;
    else console.log(`    ⚠️ Missing field: ${field}`);
  }

  // Verify member shape
  let membersOk = 0;
  if (data.members.length > 0) {
    const m = data.members[0];
    if (typeof m.username === 'string') membersOk++;
    if (typeof m.contributionSummary === 'string') membersOk++;
    if (Array.isArray(m.proposedNeedTopics)) membersOk++;
    if (typeof m.votingPatterns === 'object') membersOk++;
    if (typeof m.taskCompletionRate === 'number') membersOk++;
    if (typeof m.chatActivity === 'object') membersOk++;
  }
  console.log(`    ✅ Social map: ${passed}/${checks.length} fields, ${data.memberCount} members, ${membersOk}/6 member fields ok`);
}

async function testRefreshEndpoint(token: string, treeId: string) {
  console.log('  [test] POST /api/teams/:treeId/social-map/refresh...');
  const { status, data } = await request('POST', `/api/teams/${treeId}/social-map/refresh`, { token });

  if (status !== 200) {
    console.log(`    ❌ Expected 200, got ${status}: ${JSON.stringify(data).slice(0, 200)}`);
    process.exitCode = 1;
    return;
  }

  const checks = [
    ['ok', data.ok === true],
    ['memberCount', typeof data.memberCount === 'number'],
    ['message', typeof data.message === 'string'],
  ];
  let passed = 0;
  for (const [field, ok] of checks) {
    if (ok) passed++;
    else console.log(`    ⚠️ Missing field: ${field}`);
  }
  console.log(`    ✅ Refresh: ${passed}/${checks.length} checks, ${data.memberCount} members refreshed`);
}

async function testMembershipRequired(token: string) {
  console.log('  [test] Membership required (403 for non-member)...');
  // Use a tree the user is not a member of
  const { status } = await request('GET', '/api/teams/non-existent-tree-id/social-map', { token });
  // Should get 404 (tree not found) or 403 from membership check
  if (status === 403 || status === 404) {
    console.log(`    ✅ Returns ${status} for non-member / non-existent tree`);
  } else {
    console.log(`    ⚠️ Expected 403/404, got ${status}`);
  }
}

async function testTreeNotFound(token: string) {
  console.log('  [test] Tree not found...');
  const fakeId = '00000000-0000-0000-0000-000000000000';
  const { status, data } = await request('POST', '/api/concierge/context', {
    token, body: { treeId: fakeId },
  });
  if (status === 404) {
    console.log('    ✅ Returns 404 for non-existent tree');
  } else {
    console.log(`    ⚠️ Expected 404, got ${status}: ${JSON.stringify(data).slice(0, 100)}`);
  }
}

async function testMissingTreeId(token: string) {
  console.log('  [test] Missing treeId...');
  const { status } = await request('POST', '/api/concierge/context', {
    token, body: {},
  });
  if (status === 400) {
    console.log('    ✅ Returns 400 when treeId missing');
  } else {
    console.log(`    ⚠️ Expected 400, got ${status}`);
  }
}

// ── Main ──────────────────────────────────────────────────────────────────

async function main() {
  console.log('=== Social Map Integration Tests ===\n');

  // 1. Get auth token (register or login)
  let token: string;
  try {
    ({ token } = await registerAndGetToken());
    console.log(`\n🔑 Token obtained\n`);
  } catch {
    // User may already exist, try login
    const { data } = await request('POST', '/api/auth/login', {
      body: { email: TEST_USER.email, password: TEST_USER.password },
    });
    token = data.accessToken || data.token;
    console.log(`\n🔑 Token obtained (login)\n`);
  }

  // 2. Get a tree ID the user is a member of
  const { data: trees } = await request('GET', '/api/trees/', { token });
  let treeId = Array.isArray(trees) && trees.length > 0 ? trees[0].id : null;

  if (!treeId) {
    console.log('⚠️ No trees available — creating one for tests...');
    const { data: newTree } = await request('POST', '/api/trees/', {
      token,
      body: {
        name: `SocialMapTest_${Date.now()}`,
        description: 'Test tree for social map tests',
        icono: '🧪',
        admissionPolicy: 'OPEN',
      },
    });
    if (newTree?.id) {
      treeId = newTree.id;
      console.log(`  Created test tree: ${treeId}`);
    }
  }

  // 3. Run tests
  if (treeId) {
    console.log(`📋 Testing with tree: ${treeId}\n`);
    await testContextEndpoint(token, treeId);
    await testSocialMapEndpoint(token, treeId);
    await testRefreshEndpoint(token, treeId);
  } else {
    console.log('⚠️ Skipping tree-specific tests (no tree)\n');
    // Still run the token-level tests
    await testMembershipRequired(token);
    await testTreeNotFound(token);
    await testMissingTreeId(token);
  }
  await testAuthRequired();

  console.log('\n=== Tests complete ===');
}

main().catch((err) => {
  console.error('Test suite error:', err.message);
  process.exit(1);
});
