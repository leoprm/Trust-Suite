import { Request, Response } from 'express';
import { createJob, getUserJobs, getJobById, startJob } from '../services/finetuneService';
import { prisma } from '../index';

/**
 * POST /api/finetune/create
 *
 * Creates a FineTuneJob. If datasetSource is TASKS_EXPORT and a taskFilter
 * is provided, exports matching tasks as .jsonl and kicks off the Unsloth
 * fine-tuning job immediately.
 *
 * Body: { name, baseModel, datasetSource?, taskFilter? }
 */
export async function createFineTuneJob(req: Request, res: Response) {
  try {
    const userId = req.user!.id;
    const { name, baseModel, datasetSource, taskFilter } = req.body;

    if (!name || !baseModel) {
      return res.status(400).json({ error: 'name and baseModel are required' });
    }

    const job = await createJob(userId, {
      name,
      baseModel,
      datasetSource,
      taskFilter,
    });

    // If TASKS_EXPORT: export tasks and start immediately
    if ((datasetSource || 'TASKS_EXPORT') === 'TASKS_EXPORT') {
      try {
        const datasetPath = await exportTasksAsJsonl(userId, taskFilter, job.id);
        startJob(job.id, datasetPath);
      } catch (exportErr: any) {
        console.error('[FinetuneController] Task export failed:', exportErr.message);
        // Don't fail the creation — job stays QUEUED, user can upload manually
      }
    }

    return res.status(201).json(job);
  } catch (err: any) {
    console.error('[FinetuneController] createFineTuneJob error:', err);
    return res.status(500).json({ error: 'Failed to create fine-tune job' });
  }
}

/**
 * GET /api/finetune/jobs
 *
 * Lists FineTuneJobs belonging to the authenticated user.
 */
export async function listFineTuneJobs(req: Request, res: Response) {
  try {
    const userId = req.user!.id;
    const jobs = await getUserJobs(userId);
    return res.json(jobs);
  } catch (err: any) {
    console.error('[FinetuneController] listFineTuneJobs error:', err);
    return res.status(500).json({ error: 'Failed to list fine-tune jobs' });
  }
}

/**
 * GET /api/finetune/jobs/:id
 *
 * Returns a single FineTuneJob with full detail.
 * Metrics are included if the job is COMPLETED or FAILED.
 */
export async function getFineTuneJob(req: Request, res: Response) {
  try {
    const job = await getJobById(req.params.id as string);
    if (!job) {
      return res.status(404).json({ error: 'Fine-tune job not found' });
    }
    return res.json(job);
  } catch (err: any) {
    console.error('[FinetuneController] getFineTuneJob error:', err);
    return res.status(500).json({ error: 'Failed to get fine-tune job' });
  }
}

/**
 * POST /api/finetune/jobs/:id/start
 *
 * Starts a QUEUED job with a user-supplied dataset file path.
 * Body: { datasetPath: string }
 */
export async function startFineTuneJob(req: Request, res: Response) {
  try {
    const job = await getJobById(req.params.id as string);
    if (!job) {
      return res.status(404).json({ error: 'Fine-tune job not found' });
    }
    if (job.status !== 'QUEUED') {
      return res.status(400).json({ error: `Job is ${job.status}, not QUEUED` });
    }

    const { datasetPath } = req.body;
    if (!datasetPath) {
      return res.status(400).json({ error: 'datasetPath is required' });
    }

    startJob(job.id, datasetPath);
    return res.json({ success: true, jobId: job.id, status: 'RUNNING' });
  } catch (err: any) {
    console.error('[FinetuneController] startFineTuneJob error:', err);
    return res.status(500).json({ error: 'Failed to start fine-tune job' });
  }
}

// ── Helper: Export tasks as JSONL for fine-tuning ──────────────────────────

async function exportTasksAsJsonl(
  userId: string,
  taskFilter: any,
  jobId: string,
): Promise<string> {
  const fs = await import('fs');
  const path = await import('path');

  const where: any = {
    status: 'COMPLETED',
  };

  if (taskFilter?.treeId) {
    // Verify user is member of that tree
    const membership = await prisma.treeMember.findUnique({
      where: { userId_treeId: { userId, treeId: taskFilter.treeId } },
    });
    if (!membership) {
      throw new Error('User is not a member of the specified tree');
    }
    where.branch = { treeId: taskFilter.treeId };
  }

  if (taskFilter?.branchId) {
    where.branchId = taskFilter.branchId;
  }

  if (taskFilter?.minDifficulty != null) {
    where.difficulty = { ...where.difficulty, gte: taskFilter.minDifficulty };
  }

  if (taskFilter?.maxDifficulty != null) {
    where.difficulty = { ...where.difficulty, lte: taskFilter.maxDifficulty };
  }

  const tasks = await prisma.task.findMany({
    where,
    include: {
      branch: { select: { name: true } },
      tags: { select: { skillName: true } },
    },
    take: 5000, // reasonable cap
    orderBy: { completedAt: 'desc' },
  });

  // Filter by skill tags if specified
  let filtered = tasks;
  if (taskFilter?.skillTags?.length) {
    const tagSet = new Set(taskFilter.skillTags.map((t: string) => t.toLowerCase()));
    filtered = tasks.filter((t) =>
      t.tags.some((tag) => tagSet.has(tag.skillName.toLowerCase())),
    );
  }

  // Convert to ShareGPT format
  const outputDir = path.resolve(__dirname, '../../../fine-tune-datasets');
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const outputPath = path.join(outputDir, `${jobId}.jsonl`);
  const stream = fs.createWriteStream(outputPath, { encoding: 'utf-8' });

  for (const task of filtered) {
    const record = {
      conversations: [
        {
          from: 'system',
          value: `You are an AI assistant completing tasks in Trust Maker. Branch: ${task.branch?.name || 'unknown'}. Skills: ${task.tags.map((t) => t.skillName).join(', ') || 'general'}.`,
        },
        {
          from: 'human',
          value: `Task: ${task.name}\nDescription: ${task.description || 'No description'}\nPhase: ${task.phase}\nDifficulty: ${task.difficulty}`,
        },
        {
          from: 'gpt',
          value: `[Completed task: ${task.name}]`,
        },
      ],
    };
    stream.write(JSON.stringify(record) + '\n');
  }

  stream.end();
  console.log(`[FinetuneController] Exported ${filtered.length} tasks → ${outputPath}`);

  return outputPath;
}
