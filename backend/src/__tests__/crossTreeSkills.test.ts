/**
 * Integration test: Cross-tree skill aggregation (S5).
 *
 * Verifica que aggregateCrossTreeSkills() promedia correctamente
 * TreeSkill (per-tree) → WorkerSkill (global) promediando entre árboles.
 *
 * Run:
 *   cd backend && npx vitest run src/__tests__/crossTreeSkills.test.ts
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { app, prisma } from '../index';
import { aggregateCrossTreeSkills } from '../services/crossTreeSkillAggregator';

// ── Test state ─────────────────────────────────────────────────────────────────
let authToken: string;
let testUserId: string;
let treeAId: string;
let treeBId: string;
const TEST_USERNAME = `crosstree_${Date.now()}`;
const TEST_PASSWORD = 'testpass123';

// ── Setup ──────────────────────────────────────────────────────────────────────

beforeAll(async () => {
  // 1. Register test user (U1)
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
    throw new Error(`Failed to authenticate: ${JSON.stringify(registerRes.body)}`);
  }

  // 2. Create two trees (A and B)
  const treeARes = await request(app)
    .post('/api/trees')
    .set('Authorization', `Bearer ${authToken}`)
    .send({
      name: `CrossTree Test A ${Date.now()}`,
      description: 'Tree A for crossTreeSkills integration test',
      admissionPolicy: 'OPEN',
    });

  if (treeARes.status !== 201) {
    throw new Error(`Failed to create tree A: ${JSON.stringify(treeARes.body)}`);
  }
  treeAId = treeARes.body.id;

  const treeBRes = await request(app)
    .post('/api/trees')
    .set('Authorization', `Bearer ${authToken}`)
    .send({
      name: `CrossTree Test B ${Date.now()}`,
      description: 'Tree B for crossTreeSkills integration test',
      admissionPolicy: 'OPEN',
    });

  if (treeBRes.status !== 201) {
    throw new Error(`Failed to create tree B: ${JSON.stringify(treeBRes.body)}`);
  }
  treeBId = treeBRes.body.id;

  // 3. Insert TreeSkill records via raw SQL
  //    Tree A: python=8, diseno=6
  //    Tree B: python=4
  await prisma.$executeRawUnsafe(`
    INSERT INTO TreeSkill (id, treeId, userId, skill, xp, level, updatedAt)
    VALUES (UUID(), '${treeAId}', '${testUserId}', 'python', 800, 8, NOW()),
           (UUID(), '${treeAId}', '${testUserId}', 'diseno', 600, 6, NOW()),
           (UUID(), '${treeBId}', '${testUserId}', 'python', 400, 4, NOW())
  `);
}, 30000);

// ── Teardown ───────────────────────────────────────────────────────────────────

afterAll(async () => {
  // Clean up WorkerSkill entries created by the test
  await prisma.$executeRawUnsafe(`
    DELETE FROM WorkerSkill WHERE userId = '${testUserId}'
  `);

  // Delete trees (cascades to TreeSkill)
  for (const id of [treeAId, treeBId]) {
    if (id) {
      try { await prisma.tree.delete({ where: { id } }); } catch {}
    }
  }

  await prisma.$disconnect();
}, 15000);

// ── Tests ──────────────────────────────────────────────────────────────────────

describe('aggregateCrossTreeSkills', () => {
  it('should average skill levels across trees', async () => {
    // Execute the aggregator
    const result = await aggregateCrossTreeSkills(prisma);
    // result > 0 means rows were inserted/updated
    expect(result).toBeGreaterThan(0);

    // Query WorkerSkill for python — should be (8+4)/2 = 6
    const pythonWs = await prisma.workerSkill.findUnique({
      where: { userId_skill: { userId: testUserId, skill: 'python' } },
    });
    expect(pythonWs).not.toBeNull();
    expect(pythonWs!.level).toBe(6);

    // Query WorkerSkill for diseno — should be 6/1 = 6 (single tree)
    const disenoWs = await prisma.workerSkill.findUnique({
      where: { userId_skill: { userId: testUserId, skill: 'diseno' } },
    });
    expect(disenoWs).not.toBeNull();
    expect(disenoWs!.level).toBe(6);
  });

  it('should be idempotent (re-running produces same result)', async () => {
    // Run aggregator again
    const result = await aggregateCrossTreeSkills(prisma);
    expect(result).toBeGreaterThan(0);

    // Values should remain unchanged
    const pythonWs = await prisma.workerSkill.findUnique({
      where: { userId_skill: { userId: testUserId, skill: 'python' } },
    });
    expect(pythonWs!.level).toBe(6);

    const disenoWs = await prisma.workerSkill.findUnique({
      where: { userId_skill: { userId: testUserId, skill: 'diseno' } },
    });
    expect(disenoWs!.level).toBe(6);
  });
});
