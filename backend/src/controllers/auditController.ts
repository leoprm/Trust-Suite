import { Request, Response } from 'express';
import { prisma } from '../index';

/**
 * GET /api/audit/promotion/:needId
 * 
 * Full transparency audit of a Need→Branch promotion.
 * Exposes all internal voting system variables:
 *   A — Skill influence per skill tag
 *   B — Relevance + quorum thresholds
 *   C — Weighted voting (influence × concentration) + podium math
 *   D — Timeout stage (14d warning / 30d forced)
 */
export const auditPromotion = async (req: any, res: Response) => {
  try {
    const { needId } = req.params;

    // ── Load Need with full relations ─────────────────────────────────────
    const need = await (prisma as any).need.findUnique({
      where: { id: needId },
      include: {
        creator: { select: { username: true } },
        treeLinks: { include: { tree: { select: { id: true, name: true } } } },
        fundings: { select: { id: true, userId: true, points: true, treeId: true } },
        ideas: {
          orderBy: { likesCount: 'desc' },
          include: {
            creator: { select: { username: true } },
            branch: { select: { id: true } },
            likes: {
              include: { user: { select: { username: true } } },
            },
          },
        },
      },
    });

    if (!need) {
      return res.status(404).json({ error: 'Need not found' });
    }

    const treeIds: string[] = need.treeLinks.map((tl: any) => tl.treeId);

    // ── A: Skill Influence ────────────────────────────────────────────────
    // Gather all unique skill tags from all ideas
    const allSkillTags = new Set<string>();
    for (const idea of need.ideas) {
      try {
        const skills: string[] = JSON.parse(idea.requiredSkills || '[]');
        for (const s of skills) allSkillTags.add(s);
      } catch {}
    }

    // Fetch SkillInfluence for each tree × skill combination
    const skillInfluences: any[] = [];
    for (const treeId of treeIds) {
      for (const skillTag of allSkillTags) {
        const record = await (prisma as any).skillInfluence.findUnique({
          where: { treeId_skillTag: { treeId, skillTag } },
        });
        if (record) {
          skillInfluences.push({
            treeId,
            skillTag,
            greenInfluence: record.greenInfluence,
            goldenInfluence: record.goldenInfluence,
            finalInfluence: record.finalInfluence,
            greenAvgDifficulty: record.greenAvgDifficulty,
            goldenAvgDifficulty: record.goldenAvgDifficulty,
            greenMemberCount: record.greenMemberCount ?? null,
            goldenMemberCount: record.goldenMemberCount ?? null,
            calculatedAt: record.calculatedAt,
          });
        }
      }
    }
    // Also fetch all influences for trees, even skills not on ideas (for context)
    for (const treeId of treeIds) {
      const allTreeInfluences = await (prisma as any).skillInfluence.findMany({
        where: { treeId },
        orderBy: { finalInfluence: 'desc' },
      });
      // Merge without duplicating
      for (const inf of allTreeInfluences) {
        if (!skillInfluences.find(si => si.treeId === inf.treeId && si.skillTag === inf.skillTag)) {
          skillInfluences.push({
            treeId: inf.treeId,
            skillTag: inf.skillTag,
            greenInfluence: inf.greenInfluence,
            goldenInfluence: inf.goldenInfluence,
            finalInfluence: inf.finalInfluence,
            greenAvgDifficulty: inf.greenAvgDifficulty,
            goldenAvgDifficulty: inf.goldenAvgDifficulty,
            greenMemberCount: inf.greenMemberCount ?? null,
            goldenMemberCount: inf.goldenMemberCount ?? null,
            calculatedAt: inf.calculatedAt,
          });
        }
      }
    }

    // ── B: Thresholds ─────────────────────────────────────────────────────
    // Relevance
    const treeMembersForPoints = treeIds.length > 0
      ? await prisma.treeMember.findMany({
          where: { treeId: { in: treeIds }, status: 'VERIFIED' },
          select: { weeklyNeedPoints: true, treeId: true },
        })
      : [];
    const totalTreeWeeklyPoints = treeMembersForPoints.reduce((s, m) => s + m.weeklyNeedPoints, 0);
    const tenPercentOfTree = Math.ceil(totalTreeWeeklyPoints * 0.1);

    const relevance = {
      met: need.relevanceThresholdMet,
      metAt: need.relevanceMetAt,
      totalPeopleEquivalent: need.totalPeopleEquivalent,
      totalPointsAssigned: need.totalPointsAssigned,
      totalTreeWeeklyPoints,
      tenPercentOfTree,
      threshold_people: 200,
      threshold_points_percent: '10% of tree weekly points',
      concentrationMultiplier: '×2 when user puts >85% of weekly points in this need',
    };

    // Quorum
    const funderIds: string[] = need.fundings.map((f: any) => f.userId as string).filter((id: string, i: number, arr: string[]) => arr.indexOf(id) === i);
    const likerIds = new Set<string>();
    for (const idea of need.ideas) {
      for (const like of idea.likes) {
        likerIds.add(like.userId);
      }
    }
    const fundersWhoVoted = funderIds.filter(fid => likerIds.has(fid));
    const quorumRatio = funderIds.length > 0 ? fundersWhoVoted.length / funderIds.length : 0;

    const quorum = {
      met: need.quorumMet,
      fundersCount: funderIds.length,
      fundersWhoVoted: fundersWhoVoted.length,
      ratio: Math.round(quorumRatio * 10000) / 100,
      threshold: '60% of funders must have liked at least 1 idea',
      nonVoters: funderIds.filter(fid => !likerIds.has(fid)).length,
    };

    // ── C: Weighted Voting ────────────────────────────────────────────────
    const ideasDetail = await Promise.all(need.ideas.map(async (idea: any) => {
      // Reconstruct vote weights for each like
      const likesDetail = await Promise.all(idea.likes.map(async (like: any) => {
        const weight = like.weight || 1;

        // Determine which skill gave the influence
        let influenceSkill = '(none)';
        let influenceMultiplier = 0.2; // default

        try {
          const skills: string[] = JSON.parse(idea.requiredSkills || '[]');
          for (const treeId of treeIds) {
            for (const skill of skills) {
              const record = await (prisma as any).skillInfluence.findUnique({
                where: { treeId_skillTag: { treeId, skillTag: skill } },
                select: { finalInfluence: true },
              });
              if (record && record.finalInfluence > influenceMultiplier) {
                influenceMultiplier = record.finalInfluence / 100;
                influenceSkill = skill;
              }
            }
          }
        } catch {}

        // Concentration ratio for this user across all needs
        const userFundings = need.fundings.filter((f: any) => f.userId === like.userId);
        let concentrationRatio = 0;
        let isConcentrated = false;
        if (userFundings.length > 0) {
          // Compute concentration: points in THIS need / total points across ALL needs
          const allUserFundings = await prisma.needFunding.findMany({
            where: { userId: like.userId },
            select: { points: true, needId: true },
          });
          let totalUserPoints = 0;
          let pointsInThisNeed = 0;
          for (const f of allUserFundings) {
            totalUserPoints += f.points;
            if (f.needId === needId) pointsInThisNeed += f.points;
          }
          concentrationRatio = totalUserPoints > 0 ? pointsInThisNeed / totalUserPoints : 0;
          isConcentrated = concentrationRatio >= 0.85;
        }

        const concentrationMultiplier = isConcentrated ? 2 : 1;

        return {
          username: like.user?.username || '(anon)',
          weight,
          influenceSkill,
          influenceMultiplier: Math.round(influenceMultiplier * 100) / 100,
          concentrationRatio: Math.round(concentrationRatio * 10000) / 100,
          concentrationMultiplier,
          isConcentrated,
          weightFormula: `weight = ${influenceMultiplier.toFixed(2)} (influence) × ${concentrationMultiplier} (concentration) = ${weight}`,
        };
      }));

      return {
        id: idea.id,
        title: idea.title,
        creator: idea.creator?.username || '(anon)',
        likesCount: idea.likesCount,
        hasBranch: !!idea.branch,
        likes: likesDetail,
      };
    }));

    // Podium
    const top3 = need.ideas.slice(0, 3);
    const top3Total = top3.reduce((s: number, i: any) => s + i.likesCount, 0);
    const top1Ratio = top3Total > 0 && top3.length > 0
      ? top3[0].likesCount / top3Total
      : 0;
    const needsMoreLikes = top3.length > 1 && top1Ratio <= 0.5;

    let podiumResult = 'pending';
    if (need.status === 'IN_PROGRESS') {
      podiumResult = 'promoted';
    } else if (need.relevanceThresholdMet && need.quorumMet && top3.length > 0) {
      if (top3.length === 1 || top1Ratio > 0.5) {
        podiumResult = 'promoted (should have been)';
      } else if (needsMoreLikes) {
        podiumResult = 'stalled — top idea needs >50% of top 3';
      }
    } else if (!need.relevanceThresholdMet) {
      podiumResult = 'pending — relevance threshold not met';
    } else if (!need.quorumMet) {
      podiumResult = 'pending — quorum not met';
    }

    const podium = {
      top1: top3.length > 0 ? { title: top3[0].title, likesCount: top3[0].likesCount } : null,
      top2: top3.length > 1 ? { title: top3[1].title, likesCount: top3[1].likesCount } : null,
      top3: top3.length > 2 ? { title: top3[2].title, likesCount: top3[2].likesCount } : null,
      top3Total,
      top1Ratio: Math.round(top1Ratio * 10000) / 100,
      thresholdPodium: '>50% of top 3 total',
      result: podiumResult,
    };

    // ── D: Timeouts ──────────────────────────────────────────────────────
    let ageDays = 0;
    let stage: 'none' | '14d_warning' | '30d_forced' = 'none';
    if (need.relevanceMetAt) {
      const ageMs = Date.now() - new Date(need.relevanceMetAt).getTime();
      ageDays = Math.floor(ageMs / (1000 * 60 * 60 * 24));
      if (ageDays >= 30) stage = '30d_forced';
      else if (ageDays >= 14) stage = '14d_warning';
    }

    const timeouts = {
      ageDays,
      stage,
      relevanceMetAt: need.relevanceMetAt,
      policy_14d: 'Notify non-voters that quorum must be reached',
      policy_30d: 'Force quorumMet = true (auto-close)',
    };

    // ── Response ──────────────────────────────────────────────────────────
    res.json({
      need: {
        id: need.id,
        title: need.title,
        description: need.description,
        status: need.status,
        totalPointsAssigned: need.totalPointsAssigned,
        totalPeopleEquivalent: need.totalPeopleEquivalent,
        relevanceThresholdMet: need.relevanceThresholdMet,
        quorumMet: need.quorumMet,
        failedAttempts: need.failedAttempts,
        proposesHashtag: need.proposesHashtag,
        createdAt: need.createdAt,
      },
      trees: need.treeLinks.map((tl: any) => ({ id: tl.tree.id, name: tl.tree.name })),
      phaseA_skillInfluence: {
        description: 'Influence weights per skill tag. green(60%) + golden(40%). Range: 20%–80%. Calculated daily at 02:00 UTC.',
        formula: 'influence = 20 + (avgDifficulty - 3) / 7 × 60, final = 0.6 × greenInfluence + 0.4 × goldenInfluence',
        data: skillInfluences,
      },
      phaseB_thresholds: {
        description: 'Pipeline thresholds: relevance (10% tree points or 200 people) and quorum (60% funders voted).',
        relevance,
        quorum,
      },
      phaseC_weightedVoting: {
        description: 'Weighted voting: IdeaLike.weight = influence(skill) × concentration(>85%). Podium: top 3, #1 > 50% promotes.',
        formula: 'weight = influence(skill) × concentrationMultiplier, concentration = ×2 when >85% of user points in this need',
        ideas: ideasDetail,
        podium,
      },
      phaseD_timeouts: {
        description: 'Timeout policy: 14d → notify non-voters, 30d → force quorum. Daily check at 03:00 UTC.',
        ...timeouts,
      },
      meta: {
        generatedAt: new Date().toISOString(),
        summary: `Need "${need.title}" — status: ${need.status}, ` +
          `relevance: ${need.relevanceThresholdMet ? '✓' : '✗'}, ` +
          `quorum: ${need.quorumMet ? '✓' : '✗'}, ` +
          `ideas: ${need.ideas.length}, ` +
          `podium: ${podiumResult}`,
      },
    });
  } catch (error: any) {
    console.error('[AuditPromotion] Error:', error);
    res.status(500).json({ error: 'Failed to audit promotion', detail: error.message });
  }
};

/**
 * GET /api/audit/influence/:treeId
 * 
 * Quick snapshot of all influence weights for a tree.
 * Lists every skill with green/golden/final influence.
 */
export const auditInfluence = async (req: any, res: Response) => {
  try {
    const { treeId } = req.params;

    const records = await (prisma as any).skillInfluence.findMany({
      where: { treeId },
      orderBy: { finalInfluence: 'desc' },
    });

    const tree = await prisma.tree.findUnique({
      where: { id: treeId },
      select: { id: true, name: true },
    });

    if (!tree) return res.status(404).json({ error: 'Tree not found' });

    res.json({
      tree,
      formula: 'influence = 20 + (avgDifficulty - 3) / 7 × 60, final = 0.6 × green + 0.4 × golden',
      constants: {
        MIN_DIFF: 3,
        MAX_DIFF: 10,
        MIN_INFLUENCE: 20,
        MAX_INFLUENCE: 80,
        greenWeight: 0.6,
        goldenWeight: 0.4,
      },
      skills: records.map((r: any) => ({
        skillTag: r.skillTag,
        greenInfluence: r.greenInfluence,
        goldenInfluence: r.goldenInfluence,
        finalInfluence: r.finalInfluence,
        greenAvgDifficulty: r.greenAvgDifficulty,
        goldenAvgDifficulty: r.goldenAvgDifficulty,
        greenMemberCount: r.greenMemberCount ?? null,
        goldenMemberCount: r.goldenMemberCount ?? null,
        calculatedAt: r.calculatedAt,
      })),
      meta: {
        generatedAt: new Date().toISOString(),
      },
    });
  } catch (error: any) {
    console.error('[AuditInfluence] Error:', error);
    res.status(500).json({ error: 'Failed to audit influence', detail: error.message });
  }
};

/**
 * GET /api/audit/quorum/:needId
 * 
 * Detailed quorum breakdown for a Need.
 * Shows every funder's vote status and the threshold math.
 */
export const auditQuorum = async (req: any, res: Response) => {
  try {
    const { needId } = req.params;

    const need = await prisma.need.findUnique({
      where: { id: needId },
      select: {
        id: true,
        title: true,
        status: true,
        quorumMet: true,
        relevanceThresholdMet: true,
        relevanceMetAt: true,
        fundings: { select: { userId: true, points: true } },
        ideas: {
          select: {
            id: true,
            title: true,
            likes: { select: { userId: true, weight: true } },
          },
        },
      },
    });

    if (!need) return res.status(404).json({ error: 'Need not found' });

    const funderIds = [...new Set(need.fundings.map(f => f.userId))];
    const likerIds = new Set<string>();
    for (const idea of need.ideas) {
      for (const like of idea.likes) {
        likerIds.add(like.userId);
      }
    }

    const fundersWhoVoted = funderIds.filter(fid => likerIds.has(fid));
    const nonVoters = funderIds.filter(fid => !likerIds.has(fid));
    const ratio = funderIds.length > 0 ? fundersWhoVoted.length / funderIds.length : 0;

    let ageDays = 0;
    if (need.relevanceMetAt) {
      ageDays = Math.floor((Date.now() - new Date(need.relevanceMetAt).getTime()) / (1000 * 60 * 60 * 24));
    }

    res.json({
      need: { id: need.id, title: need.title, status: need.status },
      quorum: {
        met: need.quorumMet,
        threshold: '60% of unique funders must have liked at least 1 idea',
        fundersCount: funderIds.length,
        fundersWhoVoted: fundersWhoVoted.length,
        nonVoters: nonVoters.length,
        ratio: Math.round(ratio * 10000) / 100,
        remaining: Math.max(0, Math.ceil(funderIds.length * 0.6) - fundersWhoVoted.length),
      },
      timeouts: {
        relevanceMetAt: need.relevanceMetAt,
        ageDays,
        stage: ageDays >= 30 ? '30d — quorum forced' : ageDays >= 14 ? '14d — non-voters notified' : 'active',
      },
      funders: funderIds.map(fid => {
        const voted = likerIds.has(fid);
        const funding = need.fundings.find(f => f.userId === fid);
        // Find which idea they liked
        let likedIdeaId: string | null = null;
        let likedIdeaTitle: string | null = null;
        if (voted) {
          for (const idea of need.ideas) {
            const like = idea.likes.find(l => l.userId === fid);
            if (like) {
              likedIdeaId = idea.id;
              likedIdeaTitle = idea.title;
              break;
            }
          }
        }
        return {
          userId: fid,
          voted,
          pointsAssigned: funding?.points || 0,
          likedIdeaId,
          likedIdeaTitle,
        };
      }),
      meta: { generatedAt: new Date().toISOString() },
    });
  } catch (error: any) {
    console.error('[AuditQuorum] Error:', error);
    res.status(500).json({ error: 'Failed to audit quorum', detail: error.message });
  }
};

/**
 * GET /api/audit/concentration/:needId
 *
 * Shows concentration ratios for every funder — who qualifies for the ×2 multiplier.
 */
export const auditConcentration = async (req: any, res: Response) => {
  try {
    const { needId } = req.params;

    const need = await prisma.need.findUnique({
      where: { id: needId },
      select: { id: true, title: true, fundings: { select: { userId: true, points: true, treeId: true } } },
    });

    if (!need) return res.status(404).json({ error: 'Need not found' });

    const funderIds = [...new Set(need.fundings.map(f => f.userId))];

    const funderDetails = await Promise.all(funderIds.map(async (fid) => {
      const allFundings = await prisma.needFunding.findMany({
        where: { userId: fid },
        select: { points: true, needId: true },
      });

      const totalPoints = allFundings.reduce((s, f) => s + f.points, 0);
      const pointsInNeed = allFundings
        .filter(f => f.needId === needId)
        .reduce((s, f) => s + f.points, 0);
      const ratio = totalPoints > 0 ? pointsInNeed / totalPoints : 0;

      const user = await prisma.user.findUnique({
        where: { id: fid },
        select: { username: true },
      });

      return {
        userId: fid,
        username: user?.username || '(anon)',
        totalPointsAssigned: totalPoints,
        pointsInThisNeed: pointsInNeed,
        concentrationRatio: Math.round(ratio * 10000) / 100,
        isConcentrated: ratio >= 0.85,
        multiplier: ratio >= 0.85 ? 2 : 1,
      };
    }));

    res.json({
      need: { id: need.id, title: need.title },
      threshold: '≥85% concentration → ×2 multiplier on people equivalent and vote weight',
      funders: funderDetails,
      meta: { generatedAt: new Date().toISOString() },
    });
  } catch (error: any) {
    console.error('[AuditConcentration] Error:', error);
    res.status(500).json({ error: 'Failed to audit concentration', detail: error.message });
  }
};
