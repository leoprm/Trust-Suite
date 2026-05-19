/**
 * Integration tests: MySQL isolation + sandbox/query security.
 *
 * Covers:
 *   1. Direct MySQL connection as sandbox user (trustmaker) → blocked by iptables
 *   2. Sandbox query returns only authenticated treeId data
 *   3. Non-SELECT SQL queries → 400 Bad Request
 *   4. Rate limit: 10 queries/min → 11th returns 429
 *
 * Run:
 *   cd backend && npx vitest run src/__tests__/sandboxSqlIsolation.test.ts
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { execSync } from 'child_process';
import { app, prisma } from '../index';

// Sandbox DB credentials for integration tests.
// In production these come from TRUST_SANDBOX_RO_PASSWORD env var or
// /home/trustmaker/.sandbox_db_creds (chmod 600). We set them here so
// tests don't depend on filesystem permissions or user ownership.
if (!process.env.TRUST_SANDBOX_RO_PASSWORD) {
  process.env.TRUST_SANDBOX_RO_PASSWORD = 'ce144417704a3d7dd31ff5d203088c7e';
}

// ── Test state ─────────────────────────────────────────────────────────────────
let authToken: string;
let testUserId: string;
const TEST_USERNAME = `sqliso_${Date.now()}`;
const TEST_PASSWORD = 'testpass123';

// ── Setup / Teardown ───────────────────────────────────────────────────────────

beforeAll(async () => {
  // Register or login test user
  const registerRes = await request(app)
    .post('/api/auth/register')
    .send({
      username: TEST_USERNAME,
      email: `${TEST_USERNAME}@test.com`,
      password: TEST_PASSWORD,
    });

  if (registerRes.status === 201) {
    authToken = registerRes.body.accessToken;
    testUserId = registerRes.body.user?.id;
  } else if (registerRes.status === 400 && registerRes.body.error?.includes('already')) {
    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ username: TEST_USERNAME, password: TEST_PASSWORD });
    authToken = loginRes.body.accessToken;
    testUserId = loginRes.body.user?.id;
  }

  if (!authToken) {
    throw new Error(`Auth failed: ${JSON.stringify(registerRes.body)}`);
  }
}, 15000);

afterAll(async () => {
  // Cleanup: delete all trees created by test user (cascades TreeSkill, TreeMember, etc.)
  const trees = await prisma.tree.findMany({
    where: { creatorId: testUserId },
    select: { id: true },
  });
  for (const t of trees) {
    try { await prisma.tree.delete({ where: { id: t.id } }); } catch {}
  }

  await prisma.$disconnect();
}, 15000);

// ── Helper ─────────────────────────────────────────────────────────────────────

function auth() {
  return { Authorization: `Bearer ${authToken}` };
}

// ── Tests ──────────────────────────────────────────────────────────────────────

describe('Sandbox SQL Isolation', () => {
  let treeAId: string;
  let treeBId: string;

  beforeAll(async () => {
    // Create tree A
    const resA = await request(app)
      .post('/api/trees')
      .set(auth())
      .send({ name: 'SQL Iso Tree A', admissionPolicy: 'OPEN' });
    expect(resA.status).toBe(201);
    treeAId = resA.body.id;

    // Create tree B
    const resB = await request(app)
      .post('/api/trees')
      .set(auth())
      .send({ name: 'SQL Iso Tree B', admissionPolicy: 'OPEN' });
    expect(resB.status).toBe(201);
    treeBId = resB.body.id;

    // Join both trees (querySql requires membership)
    await request(app)
      .post('/api/trees/join')
      .set(auth())
      .send({ treeId: treeAId });
    await request(app)
      .post('/api/trees/join')
      .set(auth())
      .send({ treeId: treeBId });

    // Seed TreeSkill data: different skills in each tree
    await prisma.treeSkill.create({
      data: { treeId: treeAId, userId: testUserId, skill: 'skill-only-in-a' },
    });
    await prisma.treeSkill.create({
      data: { treeId: treeBId, userId: testUserId, skill: 'skill-only-in-b' },
    });

    // Give fire-and-forget sandbox creation a moment
    await new Promise(r => setTimeout(r, 500));
  }, 15000);

  // ── Test 1: Direct MySQL connection is blocked for sandbox user ───────────────
  it('1. direct MySQL connection as trustmaker is blocked', () => {
    // iptables DROP rule silently discards packets → connect hangs.
    // Use timeout(1) wrapper to get a non-zero exit quickly.
    let blocked = false;
    try {
      execSync(
        'sudo -u trustmaker timeout 3 mysql -u trust_suite -proot -h 127.0.0.1 -e "SELECT 1" 2>&1',
        { timeout: 8000, stdio: 'pipe' },
      );
    } catch (e: any) {
      const msg = (e.stderr?.toString() || e.stdout?.toString() || e.message || '').toLowerCase();
      blocked = e.status !== 0 || msg.includes('refused') || msg.includes('error') || msg.includes('timeout');
    }
    expect(blocked).toBe(true);
  }, 15000);

  // ── Test 2: Sandbox query is tree-isolated ────────────────────────────────────
  it('2. sandbox query returns only data from authenticated tree', async () => {
    const res = await request(app)
      .post(`/api/trees/${treeAId}/sandbox/query`)
      .set(auth())
      .send({ sql: 'SELECT * FROM TreeSkill' });

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.rows)).toBe(true);

    // Every returned row must belong to treeA
    for (const row of res.body.rows) {
      expect(row.treeId).toBe(treeAId);
    }

    // Skill from tree A must be present; skill from tree B must NOT
    const skills = res.body.rows.map((r: any) => r.skill);
    expect(skills).toContain('skill-only-in-a');
    expect(skills).not.toContain('skill-only-in-b');
  });

  // ── Test 3: Non-SELECT SQL rejected ───────────────────────────────────────────
  it('3. non-SELECT SQL query is rejected with 400', async () => {
    const res = await request(app)
      .post(`/api/trees/${treeAId}/sandbox/query`)
      .set(auth())
      .send({ sql: 'DROP TABLE Tree' });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Only SELECT/i);
  });

  // ── Test 4: Rate limit blocks after 10 queries per minute ─────────────────────
  it('4. rate limit returns 429 on 11th query', async () => {
    // Create a dedicated tree for rate-limit test to avoid sharing
    // the rate limiter bucket with tests 2 and 3.
    const resC = await request(app)
      .post('/api/trees')
      .set(auth())
      .send({ name: 'SQL Iso Rate Limit', admissionPolicy: 'OPEN' });
    expect(resC.status).toBe(201);
    const treeCId = resC.body.id;

    // Join the tree (querySql requires membership)
    await request(app)
      .post('/api/trees/join')
      .set(auth())
      .send({ treeId: treeCId });

    // Give sandbox creation a moment
    await new Promise(r => setTimeout(r, 500));

    const url = `/api/trees/${treeCId}/sandbox/query`;

    // Fire 10 successful queries
    for (let i = 0; i < 10; i++) {
      const res = await request(app)
        .post(url)
        .set(auth())
        .send({ sql: 'SELECT * FROM TreeSkill LIMIT 1' });
      expect(res.status).toBe(200);
    }

    // 11th must be 429
    const rateLimited = await request(app)
      .post(url)
      .set(auth())
      .send({ sql: 'SELECT * FROM TreeSkill LIMIT 1' });

    expect(rateLimited.status).toBe(429);
    expect(rateLimited.body.error).toMatch(/Rate limit/i);

    // Cleanup: remove the tree (cascades sandbox)
    try { await prisma.tree.delete({ where: { id: treeCId } }); } catch {}
  });
});
