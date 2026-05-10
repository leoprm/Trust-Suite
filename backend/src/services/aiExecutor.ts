import { prisma } from '../index';
import { execSync } from 'child_process';
import { logEvent } from './eventLogService';
import {
  awardAiTaskXp,
  updateAiSkillXp,
  getSatisfactionPct,
  redirectAiPaymentsToOwner,
} from './aiReputation';

// ── Constants ────────────────────────────────────────────────────────────────

const EXECUTION_TIMEOUT_MS = 24 * 60 * 60 * 1000; // 24h timeout for WORKING tasks
const MAX_FAIL_COUNT = 3;
const RATE_LIMIT_DURATION_MS = 60 * 60 * 1000; // 1 hour
const SUSPEND_SCORE_THRESHOLD = 20; // <20% evaluation → SUSPENDED

// ── Helpers ──────────────────────────────────────────────────────────────────

function parseJsonSafe(raw: unknown): any {
  if (typeof raw === 'object' && raw !== null) return raw;
  if (typeof raw === 'string') {
    try { return JSON.parse(raw); } catch { return null; }
  }
  return null;
}

// ── Prompt Builder ────────────────────────────────────────────────────────────

/**
 * Builds the execution prompt for Hermes Agent based on Task details.
 */
function buildPrompt(task: {
  name: string;
  description: string;
  phase: string;
  difficulty?: number | null;
  tags?: { skillName: string }[];
}, branchName: string, aiProfile: string): string {
  const skills = (task.tags ?? []).map((t) => t.skillName).join(', ') || 'ninguno';
  return [
    `Completar la siguiente tarea de Trust Suite:`,
    `Tarea: ${task.name}`,
    `Descripción: ${task.description}`,
    `Skills requeridos: ${skills}`,
    `Dificultad: ${task.difficulty ?? 'no especificada'}`,
    `Fase: ${task.phase}`,
    `Rama: ${branchName}`,
    ``,
    `Entregar el resultado como archivo(s) en el directorio de trabajo.`,
    `Al finalizar, generar un resumen de lo hecho.`,
    ``,
    `Perfil asignado: ${aiProfile}`,
  ].join('\n');
}

// ── Hermes Kanban Dispatch ───────────────────────────────────────────────────

/**
 * Dispatches a task to Hermes Agent via `hermes kanban create`.
 * Returns the kanban task ID on success, null on failure.
 */
function dispatchToHermes(
  prompt: string,
  aiProfile: string,
  taskName: string,
): string | null {
  try {
    // Escape for shell
    const safeTitle = taskName.replace(/"/g, '\\"').slice(0, 120);
    const safePrompt = prompt.replace(/"/g, '\\"').replace(/\n/g, '\\n').slice(0, 2000);
    const safeBody = `AI Execution for Trust Suite task: ${safeTitle}\n\n${safePrompt}`;

    const cmd = `hermes kanban create "${safeTitle}" --assignee ${aiProfile} --body "${safeBody}" --json`;

    const stdout = execSync(cmd, {
      encoding: 'utf-8',
      timeout: 15_000,
      env: { ...process.env, PATH: process.env.PATH },
    });

    const result = JSON.parse(stdout);
    return result?.task_id || result?.id || null;
  } catch (err: any) {
    console.error(`[AIExecutor] hermes kanban create failed:`, err.message);
    return null;
  }
}

/**
 * Polls a kanban task to check its status.
 * Returns { completed: boolean, output: string | null, summary: string | null }
 */
function pollKanbanTask(kanbanTaskId: string): {
  completed: boolean;
  status: string;
  output: string | null;
  summary: string | null;
} {
  try {
    const stdout = execSync(`hermes kanban show ${kanbanTaskId} --json`, {
      encoding: 'utf-8',
      timeout: 10_000,
      env: { ...process.env, PATH: process.env.PATH },
    });

    const data = JSON.parse(stdout);
    const status = data?.status || data?.task?.status || 'unknown';
    const completed = status === 'done' || status === 'archived' || status === 'completed';
    const summary = data?.result || data?.task?.result || data?.summary || null;

    // Extract output from the task body/results
    let output = summary;
    if (data?.task?.body) {
      output = data.task.body;
    }

    return { completed, status, output, summary };
  } catch (err: any) {
    console.error(`[AIExecutor] pollKanbanTask failed for ${kanbanTaskId}:`, err.message);
    return { completed: false, status: 'error', output: null, summary: null };
  }
}

// ── Error Handling ───────────────────────────────────────────────────────────

async function handleAIFailure(aiMemberId: string): Promise<void> {
  const config = await prisma.aIMemberConfig.findUnique({
    where: { treeMemberId: aiMemberId },
    select: { aiFailCount: true },
  });

  const failCount = (config?.aiFailCount ?? 0) + 1;

  if (failCount >= MAX_FAIL_COUNT) {
    // Rate-limit for 1 hour
    return;
  }

  try {
    await prisma.$transaction(async (tx) => {
      await tx.aIMemberConfig.update({
        where: { treeMemberId: aiMemberId },
        data: {
          aiFailCount: failCount,
          aiLastFailedAt: new Date(),
          ...(failCount >= MAX_FAIL_COUNT
            ? { aiRateLimitedUntil: new Date(Date.now() + RATE_LIMIT_DURATION_MS) }
            : {}),
        },
      });

      if (failCount >= MAX_FAIL_COUNT) {
        await tx.treeMember.update({
          where: { id: aiMemberId },
          data: { aiStatus: 'RATE_LIMITED' },
        });
      }
    });

    if (failCount >= MAX_FAIL_COUNT) {
      console.log(`[AIExecutor] AI ${aiMemberId} rate-limited after ${failCount} failures`);
      void logEvent({
        actorId: null,
        action: 'AI_RATE_LIMITED',
        entityType: 'TreeMember',
        entityId: aiMemberId,
        metadataJson: { failCount, reason: '3 consecutive failures', until: new Date(Date.now() + RATE_LIMIT_DURATION_MS).toISOString() },
        severity: 'WARNING',
        source: 'AUTOMATION',
      });
    }
  } catch (err: any) {
    console.error(`[AIExecutor] handleAIFailure error:`, err.message);
  }
}

async function resetAIFailCount(aiMemberId: string): Promise<void> {
  try {
    await prisma.aIMemberConfig.update({
      where: { treeMemberId: aiMemberId },
      data: { aiFailCount: 0, aiLastFailedAt: null, aiRateLimitedUntil: null },
    });
  } catch (err: any) {
    // Config might not exist — ignore
  }
}

// ── Delivery Handler ─────────────────────────────────────────────────────────

async function handleDelivery(
  task: any,
  aiMemberId: string,
  output: string,
  summary: string,
  executionId: string,
): Promise<{ success: boolean; deliverableId?: string }> {
  try {
    // 1. Create PhaseDeliverable
    const deliverable = await prisma.phaseDeliverable.create({
      data: {
        branchId: task.branchId,
        phase: task.phase,
        deliverableUrl: output.slice(0, 4000), // Truncate very large outputs
        status: 'PENDING_REVIEW',
      },
    });

    // 2. Update AiExecution
    await prisma.aiExecution.update({
      where: { id: executionId },
      data: {
        status: 'COMPLETED',
        output: output.slice(0, 4000),
        completedAt: new Date(),
      },
    });

    // 3. Mark task as COMPLETED
    await prisma.$transaction(async (tx) => {
      await tx.task.update({
        where: { id: task.id },
        data: {
          status: 'COMPLETED',
          completedAt: new Date(),
          claimedByAI: null,
          aiClaimedAt: null,
        },
      });

      // Update AI status: WORKING → IDLE
      const remainingTasks = await tx.task.count({
        where: { claimedByAI: aiMemberId, status: { not: 'COMPLETED' } },
      });
      if (remainingTasks === 0) {
        await tx.treeMember.update({
          where: { id: aiMemberId },
          data: { aiStatus: 'IDLE' },
        });
      }
    });

    // Reset fail count on success
    await resetAIFailCount(aiMemberId);

    // ── AI Reputation: award XP + update skill XP ─────────────────────
    try {
      const satisfactionPct = await getSatisfactionPct(deliverable.id);
      await awardAiTaskXp(aiMemberId, task.id, satisfactionPct);
      await updateAiSkillXp(aiMemberId, task.id);

      // Redirect escrow payments to AI owner
      await redirectAiPaymentsToOwner(aiMemberId, task.id);
    } catch (repErr: any) {
      console.warn(`[AIExecutor] Reputation update failed:`, repErr.message);
    }

    // 4. Log
    void logEvent({
      treeId: task.branch?.treeId,
      actorId: null,
      action: 'TASK_COMPLETED_BY_AI',
      entityType: 'Task',
      entityId: task.id,
      metadataJson: {
        aiMemberId,
        deliverableId: deliverable.id,
        executionId,
        branchId: task.branchId,
        phase: task.phase,
      },
      severity: 'INFO',
      source: 'AUTOMATION',
    });

    // 5. Notify Tree owner / task creator
    try {
      const member = await prisma.treeMember.findUnique({
        where: { id: aiMemberId },
        select: { aiProfile: true, user: { select: { id: true } } },
      });

      const taskCreator = task.creatorId;
      const aiProfile = member?.aiProfile || 'unknown';

      // Create notification for the AI member's user
      await prisma.notification.create({
        data: {
          userId: member?.user.id || task.creatorId,
          type: 'TASK_COMPLETED',
          category: 'FLUJO',
          title: `AI @${aiProfile} completó Task #${task.name}`,
          body: `La tarea "${task.name}" (fase ${task.phase}) fue completada por ${aiProfile}.\nResumen: ${summary.slice(0, 300)}`,
          entityType: 'tarea',
          entityAction: 'hacer',
          entityId: task.id,
        },
      });
    } catch (notifErr: any) {
      console.warn(`[AIExecutor] Notification creation failed:`, notifErr.message);
    }

    return { success: true, deliverableId: deliverable.id };
  } catch (err: any) {
    console.error(`[AIExecutor] handleDelivery error:`, err.message);
    await handleAIFailure(aiMemberId);
    return { success: false };
  }
}

// ── Timeout Handler ──────────────────────────────────────────────────────────

async function handleTaskTimeout(taskId: string, aiMemberId: string): Promise<void> {
  console.log(`[AIExecutor] Task ${taskId} timed out (>24h WORKING). Releasing.`);

  try {
    await prisma.$transaction(async (tx) => {
      await tx.task.update({
        where: { id: taskId },
        data: { claimedByAI: null, aiClaimedAt: null },
      });

      const remaining = await tx.task.count({
        where: { claimedByAI: aiMemberId, status: { not: 'COMPLETED' } },
      });
      if (remaining === 0) {
        await tx.treeMember.update({
          where: { id: aiMemberId },
          data: { aiStatus: 'IDLE' },
        });
      }
    });

    await prisma.aiExecution.updateMany({
      where: { taskId, status: 'RUNNING' },
      data: { status: 'TIMED_OUT', completedAt: new Date() },
    });

    await handleAIFailure(aiMemberId);

    void logEvent({
      actorId: null,
      action: 'AI_TASK_TIMED_OUT',
      entityType: 'Task',
      entityId: taskId,
      metadataJson: { aiMemberId, reason: '>24h in WORKING' },
      severity: 'WARNING',
      source: 'AUTOMATION',
    });
  } catch (err: any) {
    console.error(`[AIExecutor] handleTaskTimeout error:`, err.message);
  }
}

// ── Core Execution ───────────────────────────────────────────────────────────

/**
 * Main orchestrator: processes a single AI member's claimed task.
 * Handles both initial dispatch and polling of in-progress executions.
 */
export async function executeAITask(
  aiMemberId: string,
  task: any,
): Promise<{ action: string; detail: string }> {
  const now = Date.now();
  const claimedAt = task.aiClaimedAt ? new Date(task.aiClaimedAt).getTime() : null;

  // 1. Timeout check: >24h in WORKING
  if (claimedAt && now - claimedAt > EXECUTION_TIMEOUT_MS) {
    await handleTaskTimeout(task.id, aiMemberId);
    return { action: 'timed_out', detail: `Task ${task.id} timed out after 24h` };
  }

  // 2. Check existing execution
  const existingExecution = await prisma.aiExecution.findFirst({
    where: { taskId: task.id, aiMemberId, status: { in: ['PENDING', 'RUNNING'] } },
    orderBy: { createdAt: 'desc' },
  });

  if (existingExecution) {
    if (!existingExecution.kanbanTaskId) {
      // Execution created but never dispatched — mark failed and retry
      await prisma.aiExecution.update({
        where: { id: existingExecution.id },
        data: { status: 'FAILED' },
      });
      await handleAIFailure(aiMemberId);
      return { action: 'stale_execution', detail: `Execution ${existingExecution.id} had no kanbanTaskId` };
    }

    // Poll kanban task for completion
    const poll = pollKanbanTask(existingExecution.kanbanTaskId);

    if (poll.completed && poll.output) {
      // Deliverable received!
      const result = await handleDelivery(
        task,
        aiMemberId,
        poll.output,
        poll.summary || 'Task completed by AI',
        existingExecution.id,
      );
      return {
        action: 'delivered',
        detail: result.success
          ? `Deliverable created for task ${task.id}`
          : 'Delivery failed',
      };
    }

    if (poll.status === 'error') {
      // Kanban task check failed — could be transient
      return { action: 'poll_error', detail: `Failed to poll kanban task ${existingExecution.kanbanTaskId}` };
    }

    // Still running — nothing to do
    return { action: 'polling', detail: `Kanban task ${existingExecution.kanbanTaskId} still in progress (${poll.status})` };
  }

  // 3. No existing execution → dispatch new one
  const member = await prisma.treeMember.findUnique({
    where: { id: aiMemberId },
    select: { aiProfile: true, aiProvider: true, tree: { select: { name: true } } },
  });

  if (!member?.aiProfile) {
    return { action: 'error', detail: `AI member ${aiMemberId} missing aiProfile` };
  }

  // Get branch name
  const branch = await prisma.branch.findUnique({
    where: { id: task.branchId },
    select: { name: true },
  });
  const branchName = branch?.name || 'Unknown branch';

  // Build prompt
  const prompt = buildPrompt(task, branchName, member.aiProfile);

  // Dispatch to Hermes
  const kanbanTaskId = dispatchToHermes(prompt, member.aiProfile, task.name);

  // Create AiExecution record
  const attemptNumber = (task.executions?.length ?? 0) + 1;
  await prisma.aiExecution.create({
    data: {
      taskId: task.id,
      aiMemberId,
      kanbanTaskId,
      status: kanbanTaskId ? 'RUNNING' : 'FAILED',
      promptText: prompt,
      attemptNumber,
    },
  });

  if (!kanbanTaskId) {
    await handleAIFailure(aiMemberId);
    return { action: 'dispatch_failed', detail: 'hermes kanban create failed' };
  }

  console.log(
    `[AIExecutor] Dispatched task "${task.name}" → kanban ${kanbanTaskId} [${member.aiProfile}]`,
  );

  void logEvent({
    treeId: task.branch?.treeId,
    actorId: null,
    action: 'AI_EXECUTION_DISPATCHED',
    entityType: 'Task',
    entityId: task.id,
    metadataJson: {
      aiMemberId,
      kanbanTaskId,
      aiProfile: member.aiProfile,
      attemptNumber,
    },
    severity: 'INFO',
    source: 'AUTOMATION',
  });

  return { action: 'dispatched', detail: kanbanTaskId };
}
