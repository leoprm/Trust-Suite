/**
 * Integration test: Survey close workflow (V5).
 *
 * Verifica el flujo completo de cierre de encuestas:
 *   1. Crear encuesta
 *   2. 3 miembros votan (1, 5, 10)
 *   3. Forzar closesAt = now
 *   4. Ejecutar cron de cierre
 *   5. Verificar avg = 5.33, visible = true
 *   6. Verificar SatisfactionScore actualizado
 *
 * Run:
 *   cd backend && npx vitest run src/__tests__/surveyClose.test.ts
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import crypto from 'crypto';
import { app, prisma } from '../index';
import { runSurveyClose } from '../cron/surveyCloseCron';

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Compute anonymous voter hash: SHA256(userId:surveyId) — same as encuesta.ts */
function voterHash(userId: string, surveyId: string): string {
  return crypto.createHash('sha256').update(`${userId}:${surveyId}`).digest('hex');
}

// ── Test state ───────────────────────────────────────────────────────────────

const TEST_ADMIN_USERNAME = `surveytest_admin_${Date.now()}`;
const TEST_PASSWORD = 'testpass123';
let adminToken: string;
let adminUserId: string;
let treeId: string;

interface MemberInfo {
  userId: string;
  username: string;
  token: string;
}

const members: MemberInfo[] = [];

// ── Setup ────────────────────────────────────────────────────────────────────

beforeAll(async () => {
  // 1. Register admin user
  const adminRegister = await request(app)
    .post('/api/auth/register')
    .send({
      username: TEST_ADMIN_USERNAME,
      email: `${TEST_ADMIN_USERNAME}@test.com`,
      password: TEST_PASSWORD,
    });

  if (adminRegister.status === 201) {
    adminToken = adminRegister.body.accessToken;
    adminUserId = adminRegister.body.user?.id;
  } else if (
    adminRegister.status === 400 &&
    adminRegister.body.error?.includes('already')
  ) {
    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ username: TEST_ADMIN_USERNAME, password: TEST_PASSWORD });
    adminToken = loginRes.body.accessToken;
    adminUserId = loginRes.body.user?.id;
  }

  if (!adminToken || !adminUserId) {
    throw new Error(
      `Failed to authenticate admin: ${JSON.stringify(adminRegister.body)}`,
    );
  }

  // 2. Create a tree
  const treeRes = await request(app)
    .post('/api/trees')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({
      name: `SurveyTest Tree ${Date.now()}`,
      description: 'Tree for surveyClose integration test',
      admissionPolicy: 'OPEN',
    });

  if (treeRes.status !== 201) {
    throw new Error(`Failed to create tree: ${JSON.stringify(treeRes.body)}`);
  }
  treeId = treeRes.body.id;

  // 3. Register 3 member users and add them to the tree
  for (const i of [1, 2, 3]) {
    const username = `surveyvoter_${i}_${Date.now()}`;
    const regRes = await request(app)
      .post('/api/auth/register')
      .send({
        username,
        email: `${username}@test.com`,
        password: TEST_PASSWORD,
      });

    if (regRes.status === 201) {
      // Add to tree via raw SQL (no membership endpoint exposed)
      await prisma.$executeRawUnsafe(`
        INSERT INTO TreeMember (id, userId, treeId, status, role, joinedAt)
        VALUES (UUID(), '${regRes.body.user.id}', '${treeId}', 'ACTIVE', 'MEMBER', NOW())
        ON DUPLICATE KEY UPDATE status = 'ACTIVE'
      `);

      members.push({
        userId: regRes.body.user.id,
        username,
        token: regRes.body.accessToken,
      });
    } else {
      throw new Error(`Failed to register voter ${i}: ${JSON.stringify(regRes.body)}`);
    }
  }
}, 60000);

// ── Teardown ─────────────────────────────────────────────────────────────────

afterAll(async () => {
  // Delete tree (cascades to SatisfactionSurvey, SurveyVote, TreeMember)
  if (treeId) {
    try {
      await prisma.$executeRawUnsafe(`
        DELETE FROM SurveyVote WHERE surveyId IN (
          SELECT id FROM SatisfactionSurvey WHERE treeId = '${treeId}'
        )
      `);
      await prisma.$executeRawUnsafe(`
        DELETE FROM SatisfactionSurvey WHERE treeId = '${treeId}'
      `);
      await prisma.tree.delete({ where: { id: treeId } });
    } catch {
      // Best-effort cleanup
    }
  }

  // Clean up SatisfactionScore entries created by test
  if (adminUserId) {
    try {
      await prisma.$executeRawUnsafe(`
        DELETE FROM SatisfactionScore WHERE userId = '${adminUserId}'
      `);
    } catch { /* ok */ }
  }

  await prisma.$disconnect();
}, 30000);

// ── Tests ────────────────────────────────────────────────────────────────────

describe('Survey close integration', () => {
  it('should close survey, calculate avg 5.33, update SatisfactionScore', async () => {
    // -- Step 1: Create survey with closesAt in the past --
    const now = new Date();
    const closesAt = new Date(now.getTime() - 60_000); // 1 minute ago
    const skill = `typescript_${Date.now()}`;

    const survey: any = await prisma.satisfactionSurvey.create({
      data: {
        treeId,
        targetUserId: adminUserId,
        skill,
        createdBy: adminUserId,
        closesAt,
        visible: false,
      },
    });

    const surveyId = survey.id;

    // -- Step 2: 3 members vote (scores 1, 5, 10) --
    const scores = [1, 5, 10];
    for (let i = 0; i < 3; i++) {
      const member = members[i];
      const hash = voterHash(member.userId, surveyId);
      await prisma.surveyVote.create({
        data: {
          surveyId,
          voterId: hash,
          score: scores[i],
        },
      });
    }

    // -- Step 3: Run close cron -- 
    // Pass null for bot (no Telegram notifications in test)
    const results = await runSurveyClose(prisma, null);

    // -- Step 4: Verify close results --
    const closedResult = results.find((r) => r.surveyId === surveyId);
    expect(closedResult).toBeDefined();
    expect(closedResult!.closed).toBe(true);
    expect(closedResult!.voteCount).toBe(3);
    expect(closedResult!.avgScore).toBeCloseTo(5.33, 1); // (1+5+10)/3 = 5.33

    // -- Step 5: Verify survey is now visible --
    const updatedSurvey = await prisma.satisfactionSurvey.findUnique({
      where: { id: surveyId },
    });
    expect(updatedSurvey.visible).toBe(true);

    // -- Step 6: Verify SatisfactionScore was created/updated --
    const score = await prisma.satisfactionScore.findUnique({
      where: {
        userId_skill: {
          userId: adminUserId,
          skill,
        },
      },
    });
    expect(score).not.toBeNull();
    expect(score.avgScore).toBeCloseTo(5.33, 1);
    expect(score.totalSurveys).toBe(3);

    // -- Step 7: Verify idempotent (re-running doesn't change anything) --
    const results2 = await runSurveyClose(prisma, null);
    const closedAgain = results2.find((r) => r.surveyId === surveyId);

    // Survey should NOT be in results2 (already visible=true, query filters for visible=false)
    expect(closedAgain).toBeUndefined();

    // -- Step 8: Verify no change in SatisfactionScore --
    const scoreAfterReRun = await prisma.satisfactionScore.findUnique({
      where: {
        userId_skill: {
          userId: adminUserId,
          skill,
        },
      },
    });
    expect(scoreAfterReRun.avgScore).toBeCloseTo(5.33, 1);
    expect(scoreAfterReRun.totalSurveys).toBe(3);
  }, 30000);
});
