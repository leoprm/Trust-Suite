import { Request, Response } from 'express';
import { prisma } from '../index';
import { logEvent } from '../services/eventLogService';

/**
 * POST /api/ai/webhook/delivery
 *
 * Hermes Agent webhook — called when a kanban task completes.
 * Body: { taskId: string (kanban task ID) | trustTaskId: string, deliverables: string[], summary: string }
 *
 * Finds the AiExecution by kanbanTaskId or trustTaskId,
 * creates PhaseDeliverable, updates task status, notifies the Tree.
 */
export async function webhookDelivery(req: Request, res: Response) {
  try {
    const { taskId: kanbanTaskId, trustTaskId, deliverables, summary } = req.body;

    if (!summary && !deliverables?.length) {
      return res.status(400).json({ error: 'summary or deliverables required' });
    }

    // Build output from deliverables + summary
    const outputParts: string[] = [];
    if (summary) outputParts.push(`Summary: ${summary}`);
    if (deliverables?.length) {
      outputParts.push('Deliverables:');
      deliverables.forEach((d: string, i: number) => outputParts.push(`  ${i + 1}. ${d}`));
    }
    const output = outputParts.join('\n');

    // Find the AiExecution
    let execution: any = null;

    if (kanbanTaskId) {
      execution = await prisma.aiExecution.findFirst({
        where: { kanbanTaskId, status: { in: ['PENDING', 'RUNNING'] } },
        orderBy: { createdAt: 'desc' },
      });
    }

    if (!execution && trustTaskId) {
      execution = await prisma.aiExecution.findFirst({
        where: { taskId: trustTaskId, status: { in: ['PENDING', 'RUNNING'] } },
        orderBy: { createdAt: 'desc' },
      });
    }

    if (!execution) {
      return res.status(404).json({ error: 'No pending execution found for this task' });
    }

    // Get the task
    const task = await prisma.task.findUnique({
      where: { id: execution.taskId },
      include: { branch: { select: { treeId: true } }, tags: { select: { skillName: true } } },
    });

    if (!task) {
      return res.status(404).json({ error: 'Task not found' });
    }

    // Create PhaseDeliverable
    const deliverable = await prisma.phaseDeliverable.create({
      data: {
        branchId: task.branchId,
        phase: task.phase,
        deliverableUrl: output.slice(0, 4000),
        status: 'PENDING_REVIEW',
      },
    });

    // Update AiExecution
    await prisma.aiExecution.update({
      where: { id: execution.id },
      data: {
        status: 'COMPLETED',
        output: output.slice(0, 4000),
        completedAt: new Date(),
      },
    });

    // Mark task COMPLETED and update AI status
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

      const remainingTasks = await tx.task.count({
        where: { claimedByAI: execution.aiMemberId, status: { not: 'COMPLETED' } },
      });
      if (remainingTasks === 0) {
        await tx.treeMember.update({
          where: { id: execution.aiMemberId },
          data: { aiStatus: 'IDLE' },
        });
      }
    });

    // Reset quota on success
    await prisma.aIMemberConfig.update({
      where: { treeMemberId: execution.aiMemberId },
      data: { quotaUsed: 0 },
    }).catch(() => {}); // Config might not exist

    // Log
    void logEvent({
      treeId: task.branch?.treeId,
      actorId: null,
      action: 'TASK_COMPLETED_BY_AI',
      entityType: 'Task',
      entityId: task.id,
      metadataJson: {
        aiMemberId: execution.aiMemberId,
        deliverableId: deliverable.id,
        executionId: execution.id,
        branchId: task.branchId,
        phase: task.phase,
        source: 'webhook',
      },
      severity: 'INFO',
      source: 'AUTOMATION',
    });

    // Notify
    try {
      const member = await prisma.treeMember.findUnique({
        where: { id: execution.aiMemberId },
        select: { aiProfile: true, user: { select: { id: true } } },
      });

      await prisma.notification.create({
        data: {
          userId: member?.user.id || task.creatorId || '',
          type: 'TASK_COMPLETED',
          category: 'FLUJO',
          title: `AI @${member?.aiProfile || 'AI'} completó Task #${task.name}`,
          body: `La tarea "${task.name}" (fase ${task.phase}) fue completada.\nResumen: ${(summary || 'Entregado vía webhook').slice(0, 300)}`,
          entityType: 'tarea',
          entityAction: 'hacer',
          entityId: task.id,
        },
      });
    } catch (notifErr: any) {
      console.warn('[AIExecutor Webhook] Notification failed:', notifErr.message);
    }

    return res.json({
      success: true,
      message: `Deliverable created for task ${task.id}`,
      deliverableId: deliverable.id,
    });
  } catch (err: any) {
    console.error('[AIExecutor Webhook] Error:', err);
    return res.status(500).json({ error: 'Failed to process delivery webhook' });
  }
}
