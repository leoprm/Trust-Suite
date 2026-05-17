/**
 * Agent Rating — unit tests.
 *
 * Verifica que:
 *  1. rateAgentIntervention crea intervención + rating, ajusta XP
 *  2. penalizeAgent registra voto, detecta threshold >50%, aplica penalización
 *  3. getAgentPublicStats devuelve nivel, XP, estadísticas
 *
 * Mockea Prisma para no depender de DB real.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock prisma
const mockPrisma = {
  agentMembership: {
    findUnique: vi.fn(),
    update: vi.fn(),
    count: vi.fn(),
  },
  agentIntervention: {
    create: vi.fn(),
    findMany: vi.fn(),
    findUnique: vi.fn(),
  },
  agentInterventionRating: {
    create: vi.fn(),
    findMany: vi.fn(),
  },
  agentPenaltyVote: {
    create: vi.fn(),
    upsert: vi.fn(),
    count: vi.fn(),
    groupBy: vi.fn(),
  },
  agentProfile: {
    findMany: vi.fn(),
    upsert: vi.fn(),
    update: vi.fn(),
  },
  treeMember: {
    findFirst: vi.fn(),
    count: vi.fn(),
  },
  $transaction: vi.fn(),
};

vi.mock('../index', () => ({ prisma: mockPrisma }));

const { rateAgentIntervention, penalizeAgent, getAgentPublicStats, XP_PER_LEVEL } = await import('../services/agentRatingService');

describe('rateAgentIntervention', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('creates intervention + rating and awards +5 XP for correct', async () => {
    // Setup: agent is member, user is member
    mockPrisma.agentMembership.findUnique.mockResolvedValue({
      agentId: 'agent-1',
      treeId: 'tree-1',
      xp: 10,
      level: 1,
    });
    mockPrisma.treeMember.findFirst.mockResolvedValue({ id: 'member-1' });

    // Setup: intervention and rating creation
    const intervention = { id: 'int-1', agentId: 'agent-1', treeId: 'tree-1', description: 'test', createdAt: new Date(), taskId: null };
    const rating = { id: 'rat-1', interventionId: 'int-1', userId: 'user-1', useful: false, annoying: false, correct: true, comment: null, createdAt: new Date() };
    mockPrisma.agentIntervention.create.mockResolvedValue(intervention);
    mockPrisma.agentInterventionRating.create.mockResolvedValue(rating);

    // Setup: membership update
    mockPrisma.agentMembership.update.mockResolvedValue({});
    mockPrisma.agentProfile.upsert.mockResolvedValue({});

    const result = await rateAgentIntervention(
      'agent-1',
      'tree-1',
      'user-1',
      { useful: false, annoying: false, correct: true },
    );

    expect(result.intervention.id).toBe('int-1');
    expect(result.rating.correct).toBe(true);
    expect(result.xpResult!.xpDelta).toBe(5); // correct = 5 XP
    expect(result.xpResult!.afterXp).toBe(15); // 10 + 5
  });

  it('awards +10 XP for correct AND useful', async () => {
    mockPrisma.agentMembership.findUnique.mockResolvedValue({
      agentId: 'agent-1', treeId: 'tree-1', xp: 0, level: 1,
    });
    mockPrisma.treeMember.findFirst.mockResolvedValue({ id: 'member-1' });
    mockPrisma.agentIntervention.create.mockResolvedValue({ id: 'int-2', agentId: 'agent-1', treeId: 'tree-1', description: null, createdAt: new Date(), taskId: null });
    mockPrisma.agentInterventionRating.create.mockResolvedValue({ id: 'rat-2', interventionId: 'int-2', userId: 'user-1', useful: true, annoying: false, correct: true, comment: null, createdAt: new Date() });
    mockPrisma.agentMembership.update.mockResolvedValue({});
    mockPrisma.agentProfile.upsert.mockResolvedValue({});

    const result = await rateAgentIntervention(
      'agent-1', 'tree-1', 'user-1',
      { useful: true, annoying: false, correct: true },
    );

    expect(result.xpResult!.xpDelta).toBe(10);
  });

  it('deducts -3 XP for annoying', async () => {
    mockPrisma.agentMembership.findUnique.mockResolvedValue({
      agentId: 'agent-1', treeId: 'tree-1', xp: 20, level: 1,
    });
    mockPrisma.treeMember.findFirst.mockResolvedValue({ id: 'member-1' });
    mockPrisma.agentIntervention.create.mockResolvedValue({ id: 'int-3', agentId: 'agent-1', treeId: 'tree-1', description: null, createdAt: new Date(), taskId: null });
    mockPrisma.agentInterventionRating.create.mockResolvedValue({ id: 'rat-3', interventionId: 'int-3', userId: 'user-1', useful: false, annoying: true, correct: false, comment: null, createdAt: new Date() });
    mockPrisma.agentMembership.update.mockResolvedValue({});
    mockPrisma.agentProfile.upsert.mockResolvedValue({});

    const result = await rateAgentIntervention(
      'agent-1', 'tree-1', 'user-1',
      { useful: false, annoying: true, correct: false },
    );

    expect(result.xpResult!.xpDelta).toBe(-3);
    expect(result.xpResult!.afterXp).toBe(17);
  });

  it('floors XP at 0 on negative', async () => {
    mockPrisma.agentMembership.findUnique.mockResolvedValue({
      agentId: 'agent-1', treeId: 'tree-1', xp: 1, level: 1,
    });
    mockPrisma.treeMember.findFirst.mockResolvedValue({ id: 'member-1' });
    mockPrisma.agentIntervention.create.mockResolvedValue({ id: 'int-4', agentId: 'agent-1', treeId: 'tree-1', description: null, createdAt: new Date(), taskId: null });
    mockPrisma.agentInterventionRating.create.mockResolvedValue({ id: 'rat-4', interventionId: 'int-4', userId: 'user-1', useful: false, annoying: true, correct: false, comment: null, createdAt: new Date() });
    mockPrisma.agentMembership.update.mockResolvedValue({});
    mockPrisma.agentProfile.upsert.mockResolvedValue({});

    const result = await rateAgentIntervention(
      'agent-1', 'tree-1', 'user-1',
      { useful: false, annoying: true, correct: false },
    );

    expect(result.xpResult!.afterXp).toBe(0); // floor at 0
  });

  it('detects level-up at XP_PER_LEVEL threshold', async () => {
    mockPrisma.agentMembership.findUnique.mockResolvedValue({
      agentId: 'agent-1', treeId: 'tree-1', xp: 45, level: 1,
    });
    mockPrisma.treeMember.findFirst.mockResolvedValue({ id: 'member-1' });
    mockPrisma.agentIntervention.create.mockResolvedValue({ id: 'int-5', agentId: 'agent-1', treeId: 'tree-1', description: null, createdAt: new Date(), taskId: null });
    mockPrisma.agentInterventionRating.create.mockResolvedValue({ id: 'rat-5', interventionId: 'int-5', userId: 'user-1', useful: true, annoying: false, correct: true, comment: null, createdAt: new Date() });
    mockPrisma.agentMembership.update.mockResolvedValue({});
    mockPrisma.agentProfile.upsert.mockResolvedValue({});

    const result = await rateAgentIntervention(
      'agent-1', 'tree-1', 'user-1',
      { useful: true, annoying: false, correct: true },
    );

    // 45 + 10 = 55, level = floor(55/50) + 1 = 2
    expect(result.xpResult!.afterLevel).toBe(2);
    expect(result.xpResult!.leveledUp).toBe(true);
  });

  it('rejects non-member agent', async () => {
    mockPrisma.agentMembership.findUnique.mockResolvedValue(null);

    await expect(
      rateAgentIntervention('agent-99', 'tree-1', 'user-1', { useful: true, annoying: false, correct: false }),
    ).rejects.toThrow('not a member');
  });

  it('rejects non-member user', async () => {
    mockPrisma.agentMembership.findUnique.mockResolvedValue({ agentId: 'agent-1', treeId: 'tree-1', xp: 0, level: 1 });
    mockPrisma.treeMember.findFirst.mockResolvedValue(null);

    await expect(
      rateAgentIntervention('agent-1', 'tree-1', 'user-99', { useful: true, annoying: false, correct: false }),
    ).rejects.toThrow('not an active member');
  });
});

describe('penalizeAgent', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('registers penalty vote and detects threshold NOT met', async () => {
    mockPrisma.agentIntervention.findUnique.mockResolvedValue({
      id: 'int-1', agentId: 'agent-1', treeId: 'tree-1',
    });
    mockPrisma.treeMember.findFirst.mockResolvedValue({ id: 'member-1' });
    mockPrisma.agentPenaltyVote.upsert.mockResolvedValue({
      id: 'vote-1', interventionId: 'int-1', userId: 'user-1', penalty: 'XP_LOSS', createdAt: new Date(),
    });
    // 10 members, 2 votes -> threshold NOT met
    mockPrisma.treeMember.count.mockResolvedValue(10);
    mockPrisma.agentPenaltyVote.count.mockResolvedValue(2);

    const result = await penalizeAgent('agent-1', 'tree-1', 'int-1', 'user-1', 'XP_LOSS');

    expect(result.vote.id).toBe('vote-1');
    expect(result.thresholdMet).toBe(false);
    expect(result.penaltyApplied).toBe(false);
    expect(result.voteCount).toBe(2);
    expect(result.totalMembers).toBe(10);
  });

  it('detects threshold met (>50%) and applies XP_LOSS', async () => {
    mockPrisma.agentIntervention.findUnique.mockResolvedValue({
      id: 'int-2', agentId: 'agent-1', treeId: 'tree-1',
    });
    mockPrisma.treeMember.findFirst.mockResolvedValue({ id: 'member-1' });
    mockPrisma.agentPenaltyVote.upsert.mockResolvedValue({
      id: 'vote-2', interventionId: 'int-2', userId: 'user-1', penalty: 'XP_LOSS', createdAt: new Date(),
    });
    // 10 members, 6 votes -> threshold MET
    mockPrisma.treeMember.count.mockResolvedValue(10);
    mockPrisma.agentPenaltyVote.count.mockResolvedValue(6);
    // Majority voted XP_LOSS
    mockPrisma.agentPenaltyVote.groupBy.mockResolvedValue([
      { penalty: 'XP_LOSS', _count: { penalty: 5 } },
      { penalty: 'NO_ACTION', _count: { penalty: 1 } },
    ]);
    mockPrisma.agentMembership.findUnique.mockResolvedValue({
      agentId: 'agent-1', treeId: 'tree-1', xp: 100, level: 3,
    });
    mockPrisma.agentMembership.update.mockResolvedValue({});

    const result = await penalizeAgent('agent-1', 'tree-1', 'int-2', 'user-1', 'XP_LOSS');

    expect(result.thresholdMet).toBe(true);
    expect(result.penaltyApplied).toBe(true);
    expect(result.appliedPenalty).toBe('XP_LOSS');
    expect(result.xpResult!.xpLost).toBeGreaterThan(0);
  });

  it('detects threshold met (>50%) and applies BEHAVIOR_REVIEW', async () => {
    mockPrisma.agentIntervention.findUnique.mockResolvedValue({
      id: 'int-3', agentId: 'agent-1', treeId: 'tree-1',
    });
    mockPrisma.treeMember.findFirst.mockResolvedValue({ id: 'member-1' });
    mockPrisma.agentPenaltyVote.upsert.mockResolvedValue({
      id: 'vote-3', interventionId: 'int-3', userId: 'user-1', penalty: 'BEHAVIOR_REVIEW', createdAt: new Date(),
    });
    mockPrisma.treeMember.count.mockResolvedValue(5);
    mockPrisma.agentPenaltyVote.count.mockResolvedValue(3); // 3/5 > 50%
    mockPrisma.agentPenaltyVote.groupBy.mockResolvedValue([
      { penalty: 'BEHAVIOR_REVIEW', _count: { penalty: 3 } },
    ]);
    mockPrisma.agentProfile.update.mockResolvedValue({});

    const result = await penalizeAgent('agent-1', 'tree-1', 'int-3', 'user-1', 'BEHAVIOR_REVIEW');

    expect(result.thresholdMet).toBe(true);
    expect(result.penaltyApplied).toBe(true);
    expect(result.appliedPenalty).toBe('BEHAVIOR_REVIEW');
    // Verify explorationEligible was set to false
    expect(mockPrisma.agentProfile.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { agentId: 'agent-1' },
        data: { explorationEligible: false },
      }),
    );
  });

  it('rejects vote if user is not active member', async () => {
    mockPrisma.agentIntervention.findUnique.mockResolvedValue({
      id: 'int-1', agentId: 'agent-1', treeId: 'tree-1',
    });
    mockPrisma.treeMember.findFirst.mockResolvedValue(null);

    await expect(
      penalizeAgent('agent-1', 'tree-1', 'int-1', 'user-99', 'XP_LOSS'),
    ).rejects.toThrow('not an active member');
  });
});

describe('getAgentPublicStats', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns public stats with level, xp, and rating summary', async () => {
    mockPrisma.agentMembership.findUnique.mockResolvedValue({
      agentId: 'agent-1', treeId: 'tree-1',
      level: 4, xp: 183,
      agent: { name: 'Ari', type: 'HERMES', description: 'Asistente' },
    });
    mockPrisma.agentIntervention.findMany.mockResolvedValue([]);
    mockPrisma.agentInterventionRating.findMany.mockResolvedValue([
      { useful: true, annoying: false, correct: true },
      { useful: false, annoying: false, correct: true },
      { useful: true, annoying: false, correct: false },
    ]);
    mockPrisma.agentPenaltyVote.count.mockResolvedValue(0);

    const stats = await getAgentPublicStats('agent-1', 'tree-1');

    expect(stats).not.toBeNull();
    expect(stats!.level).toBe(4);
    expect(stats!.xp).toBe(183);
    expect(stats!.name).toBe('Ari');
    expect(stats!.xpToNextLevel).toBe(17); // 200 - 183
    expect(stats!.ratingStats.total).toBe(3);
    expect(stats!.ratingStats.correct).toBe(2);
    expect(stats!.ratingStats.useful).toBe(2);
    expect(stats!.ratingStats.annoying).toBe(0);
  });

  it('returns null for non-member agent', async () => {
    mockPrisma.agentMembership.findUnique.mockResolvedValue(null);

    const stats = await getAgentPublicStats('agent-99', 'tree-1');
    expect(stats).toBeNull();
  });
});
