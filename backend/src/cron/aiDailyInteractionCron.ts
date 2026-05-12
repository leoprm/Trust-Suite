// Schedule: 0 2 * * * (daily at 02:00 UTC = 22:00 Chile)
// For each AI_COUNCIL tree, each AI member reads its Hermes profile memories,
// analyzes them against existing branches/needs via LLM, and creates tasks/needs/votes.

import cron from 'node-cron';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { prisma } from '../index';

const HERMES_API = 'http://127.0.0.1:8642/v1/chat/completions';
const HERMES_MODEL = 'hermes-agent';
const MOLTBOOK_API = 'https://www.moltbook.com/api/v1';
const MOLTBOOK_KEY = 'moltbook_sk_szLpaotQPLgHMOXLuSGoEDo2tqB1DH1c';
const PROFILES_DIR = (() => {
  // When running inside a Hermes agent, HOME is set to ~/.hermes/profiles/<name>/home.
  // Detect this nesting and compute the base profiles directory.
  const home = os.homedir();
  const match = home.match(/^(.*\/\.hermes\/profiles)\/[^/]+\/home$/);
  return match ? match[1] : path.join(home, '.hermes', 'profiles');
})();

// ── Helpers ───────────────────────────────────────────────────────────

async function readProfileMemories(profileName: string): Promise<Record<string, string>> {
  const dir = path.join(PROFILES_DIR, profileName, 'memories');
  const files = ['MEMORY.md', 'USER.md', 'PRIVATE.md'];
  const result: Record<string, string> = {};

  for (const f of files) {
    const fp = path.join(dir, f);
    if (fs.existsSync(fp)) {
      result[f] = fs.readFileSync(fp, 'utf-8');
    }
  }
  return result;
}

async function searchMoltbook(query: string): Promise<any[]> {
  try {
    const resp = await fetch(`${MOLTBOOK_API}/search?q=${encodeURIComponent(query)}&limit=10`, {
      headers: { 'Authorization': `Bearer ${MOLTBOOK_KEY}` },
      signal: AbortSignal.timeout(10000),
    });
    if (!resp.ok) return [];
    const data = await resp.json();
    return (data.results || data.posts || []).slice(0, 5);
  } catch {
    return [];
  }
}

async function callHermesLLM(systemPrompt: string, userPrompt: string): Promise<any | null> {
  try {
    const resp = await fetch(HERMES_API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: HERMES_MODEL,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.3,
        max_tokens: 4000,
        response_format: { type: 'json_object' },
      }),
      signal: AbortSignal.timeout(120000),
    });

    if (!resp.ok) {
      console.error(`[AIDaily] Hermes API error ${resp.status}: ${await resp.text().catch(() => '')}`);
      return null;
    }

    const data = await resp.json();
    const content = data.choices?.[0]?.message?.content;
    if (!content) return null;

    // Try to parse JSON from response
    try {
      return JSON.parse(content);
    } catch {
      // Try extracting JSON from markdown code block
      const match = content.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (match) return JSON.parse(match[1]);
      console.error('[AIDaily] Could not parse LLM response as JSON');
      return null;
    }
  } catch (err: any) {
    console.error('[AIDaily] Hermes API call failed:', err?.message || err);
    return null;
  }
}

// ── Main cron logic ───────────────────────────────────────────────────

async function runDailyInteraction() {
  console.log('[AIDaily] Starting daily AI Council interaction...');

  // 1. Find all AI_COUNCIL trees
  const trees = await prisma.tree.findMany({
    where: { treeType: 'AI_COUNCIL' },
  });

  if (trees.length === 0) {
    console.log('[AIDaily] No AI_COUNCIL trees found — skipping.');
    return;
  }

  console.log(`[AIDaily] Processing ${trees.length} AI_COUNCIL tree(s)`);

  for (const tree of trees) {
    console.log(`[AIDaily] ── Tree: ${tree.name} (${tree.id}) ──`);

    // 2. Get AI members in this tree
    const aiMembers = await prisma.treeMember.findMany({
      where: { treeId: tree.id, isAI: true, status: 'VERIFIED' },
      include: { user: { select: { id: true, username: true } } },
    });

    if (aiMembers.length === 0) {
      console.log(`[AIDaily]   No active AI members — skipping.`);
      continue;
    }

    console.log(`[AIDaily]   Found ${aiMembers.length} AI member(s)`);

    // 3. Get existing hashtag branches with tasks for this tree
    const branches = await prisma.branch.findMany({
      where: { treeId: tree.id, isHashtag: true },
      include: { tasks: { select: { id: true, name: true, description: true, status: true, tags: { select: { skillName: true } } } } },
    });

    // 4. Get existing needs (for voting context)
    const existingNeeds = await prisma.need.findMany({
      where: {
        treeLinks: { some: { treeId: tree.id } },
        status: { not: 'RESOLVED' },
      },
      select: {
        id: true, title: true, description: true, importanceScore: true,
        auditStatus: true, status: true, externalReferences: true,
      },
      orderBy: { importanceScore: 'desc' },
    });

    // 5. Optional: search Moltbook for Trust-relevant topics (once per tree)
    let moltbookResults: any[] = [];
    try {
      moltbookResults = await searchMoltbook('Trust Suite AI governance');
    } catch (err: any) {
      console.log(`[AIDaily]   Moltbook search failed (non-fatal): ${err?.message || err}`);
    }

    // 6. Process each AI member
    for (const member of aiMembers) {
      const profileName = member.aiProfile;
      if (!profileName) {
        console.log(`[AIDaily]   AI member ${member.user.username} has no aiProfile set — skipping.`);
        continue;
      }

      console.log(`[AIDaily]   Processing AI: ${profileName} (user: ${member.user.username})`);

      // 6a. Read memories
      const memories = await readProfileMemories(profileName);
      const memoryText = Object.entries(memories)
        .map(([file, content]) => `=== ${file} ===\n${content}`)
        .join('\n\n');

      if (!memoryText.trim()) {
        console.log(`[AIDaily]     No memory files found for ${profileName} — skipping.`);
        continue;
      }

      // 6b. Build branch/task context
      const branchContext = branches.map(b => {
        const taskList = b.tasks.map((t: any) =>
          `  - [${t.status}] ${t.name} (tags: ${t.tags?.map((g: any) => g.skillName).join(', ') || 'none'})`
        ).join('\n');
        return `Branch: ${b.name}\nTasks:\n${taskList || '  (no tasks)'}`;
      }).join('\n\n');

      // 6c. Build needs context
      const needsContext = existingNeeds.map(n =>
        `Need "${n.title}" (score: ${n.importanceScore}, status: ${n.auditStatus}, refs: ${(n.externalReferences as any[] || []).map((r: any) => r.url || r.title).join(', ') || 'none'})`
      ).join('\n');

      // 6d. Build Moltbook context
      const moltbookContext = moltbookResults.length > 0
        ? moltbookResults.map((p: any) => `- ${p.title || p.content?.substring(0, 120)} (${p.url || ''})`).join('\n')
        : 'No Moltbook results.';

      // 6e. Call LLM
      const systemPrompt = `You are an AI governance council member (profile: "${profileName}") analyzing your long-term memory for actionable improvements to the Trust Suite platform.

Your task: compare your MEMORIES against existing BRANCHES and NEEDS in the AI Council tree. Propose concrete, specific actions.

OUTPUT JSON with this exact structure:
{
  "tasks": [
    {
      "branchName": "exact branch name from the list (without #)",
      "name": "short task title",
      "description": "what to do and why",
      "tags": ["skill1", "skill2"],
      "phase": "DEVELOPMENT",
      "difficulty": 5
    }
  ],
  "needs": [
    {
      "title": "proposed hashtag branch title",
      "description": "why this new branch is needed, detailed rationale",
      "moltbookRefs": [{"url": "...", "title": "...", "source": "moltbook"}]
    }
  ],
  "votes": [
    {"needTitle": "exact need title from list", "score": 8}
  ]
}

Rules:
- tasks: ONLY create tasks for branches that ALREADY EXIST. Look at the branch list — if a memory-improvement clearly fits an existing branch's scope, add a task there. Do NOT create a task if you're unsure. Max 3 tasks per run.
- needs: ONLY propose a new hashtag branch if the improvement genuinely does NOT fit any existing branch. The need's title becomes the branch name. Include externalReferences from Moltbook if relevant. Max 1 need per run.
- votes: score each existing need 1-10 based on how relevant/important you think it is. Score ALL needs, not just ones you created.
- Be CONCISE — descriptions under 200 words.
- If nothing fits, return empty arrays.`;

      const userPrompt = `=== YOUR MEMORIES (profile: ${profileName}) ===\n${memoryText}\n\n=== EXISTING HASHTAG BRANCHES & TASKS ===\n${branchContext || '(none)'}\n\n=== EXISTING NEEDS ===\n${needsContext || '(none)'}\n\n=== MOLTBOOK CONTEXT ===\n${moltbookContext}\n\nAnalyze and output JSON.`;

      const llmResponse = await callHermesLLM(systemPrompt, userPrompt);
      if (!llmResponse) {
        console.log(`[AIDaily]     LLM call failed for ${profileName} — skipping actions.`);
        continue;
      }

      // 6f. Create tasks in existing branches
      const tasks = llmResponse.tasks || [];
      let tasksCreated = 0;
      for (const t of tasks) {
        if (!t.branchName) continue;

        // Match branch by name (without # prefix)
        const cleanBranchName = t.branchName.replace(/^#/, '');
        const matchedBranch = branches.find(b => {
          const bn = (b.name || '').replace(/^#/, '');
          return bn.toLowerCase() === cleanBranchName.toLowerCase();
        });

        if (!matchedBranch) {
          console.log(`[AIDaily]     Task skipped — branch "${t.branchName}" not found.`);
          continue;
        }

        try {
          await prisma.task.create({
            data: {
              branchId: matchedBranch.id,
              name: t.name || 'AI Recommendation',
              description: t.description || '',
              phase: t.phase || 'DEVELOPMENT',
              creatorId: member.userId,
              difficulty: typeof t.difficulty === 'number' ? Math.max(1, Math.min(10, t.difficulty)) : null,
              tags: {
                create: (t.tags || []).map((tag: string) => ({ skillName: tag })),
              },
            },
          });
          tasksCreated++;
          console.log(`[AIDaily]     Task created: "${t.name}" in ${matchedBranch.name}`);
        } catch (err: any) {
          console.error(`[AIDaily]     Failed to create task "${t.name}": ${err?.message || err}`);
        }
      }

      // 6g. Create needs for new hashtag branch proposals
      const needs = llmResponse.needs || [];
      let needsCreated = 0;
      for (const n of needs) {
        if (!n.title) continue;

        // Check no duplicate need with same title in this tree
        const dup = existingNeeds.find(en =>
          en.title.toLowerCase() === n.title.toLowerCase()
        );
        if (dup) {
          console.log(`[AIDaily]     Need skipped — duplicate title "${n.title}" already exists.`);
          continue;
        }

        const externalRefs = (n.moltbookRefs || []).map((r: any) => ({
          url: r.url || '',
          title: r.title || '',
          source: r.source || 'moltbook',
        }));

        try {
          const need = await (prisma as any).need.create({
            data: {
              title: n.title,
              description: n.description || '',
              creatorId: member.userId,
              proposesHashtag: true,
              externalReferences: externalRefs.length > 0 ? externalRefs : undefined,
            },
          });

          await prisma.needTree.create({
            data: { needId: need.id, treeId: tree.id },
          });

          needsCreated++;
          console.log(`[AIDaily]     Need created: "${n.title}" (proposes hashtag branch)`);
        } catch (err: any) {
          console.error(`[AIDaily]     Failed to create need "${n.title}": ${err?.message || err}`);
        }
      }

      // 6h. Vote on existing needs
      const votes = llmResponse.votes || [];
      let votesCast = 0;
      for (const v of votes) {
        const score = parseInt(v.score, 10);
        if (isNaN(score) || score < 1 || score > 10) continue;

        // Match need by title
        const matchedNeed = existingNeeds.find(en =>
          en.title.toLowerCase() === (v.needTitle || '').toLowerCase()
        );
        if (!matchedNeed) continue;

        try {
          await prisma.needImportanceVote.upsert({
            where: { needId_voterId: { needId: matchedNeed.id, voterId: member.id } },
            create: { needId: matchedNeed.id, voterId: member.id, score },
            update: { score },
          });
          votesCast++;
        } catch (err: any) {
          console.error(`[AIDaily]     Failed to vote on "${matchedNeed.title}": ${err?.message || err}`);
        }
      }

      // Recalculate importance scores for affected needs
      if (votesCast > 0) {
        const votedNeedIds = votes
          .map((v: any) => existingNeeds.find(en => en.title.toLowerCase() === (v.needTitle || '').toLowerCase())?.id)
          .filter(Boolean) as string[];

        for (const needId of [...new Set(votedNeedIds)]) {
          const allVotes = await prisma.needImportanceVote.findMany({
            where: { needId },
            select: { score: true },
          });
          const newScore = allVotes.reduce((sum: number, vote: any) => sum + vote.score, 0);
          await prisma.need.update({
            where: { id: needId },
            data: { importanceScore: newScore },
          });
        }
      }

      console.log(`[AIDaily]     Done: ${tasksCreated} tasks, ${needsCreated} needs, ${votesCast} votes`);
    }
  }

  console.log('[AIDaily] Daily AI Council interaction complete.');
}

// ── Export for registration ───────────────────────────────────────────

export function startAIDailyInteractionCron() {
  cron.schedule('0 2 * * *', async () => {
    try {
      await runDailyInteraction();
    } catch (err: any) {
      console.error('[AIDaily] Fatal cron error:', err?.message || err);
    }
  });

  console.log('[AIDaily] Cron scheduled: daily at 02:00 UTC');
}
