import { prisma } from '../index';
import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';
import { logEvent } from './eventLogService';

const PYTHON = process.env.FINETUNE_PYTHON || 'python3';
const SCRIPT_PATH = path.resolve(__dirname, '../../../scripts/finetune.py');
const OUTPUT_BASE = process.env.FINETUNE_OUTPUT_DIR || path.resolve(__dirname, '../../../fine-tuned-models');

/**
 * FineTuneService
 * ───────────────
 * Manages FineTuneJob lifecycle: creates DB records, spawns the Unsloth QLoRA
 * Python script as a child process, updates status and metrics on completion.
 *
 * The actual GPU training runs in a separate process. This service only
 * handles orchestration — the Python script does the heavy lifting.
 */

export interface CreateJobInput {
  name: string;
  baseModel: string;
  datasetSource?: 'TASKS_EXPORT' | 'MANUAL_UPLOAD';
  taskFilter?: {
    treeId?: string;
    branchId?: string;
    skillTags?: string[];
    minDifficulty?: number;
    maxDifficulty?: number;
  };
}

export async function createJob(userId: string, input: CreateJobInput) {
  return prisma.fineTuneJob.create({
    data: {
      name: input.name,
      baseModel: input.baseModel,
      datasetSource: input.datasetSource || 'TASKS_EXPORT',
      taskFilter: input.taskFilter || undefined,
      createdById: userId,
    },
  });
}

export async function getUserJobs(userId: string) {
  return prisma.fineTuneJob.findMany({
    where: { createdById: userId },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      name: true,
      baseModel: true,
      status: true,
      datasetSource: true,
      outputModelPath: true,
      metricsJson: true,
      startedAt: true,
      completedAt: true,
      createdAt: true,
    },
  });
}

export async function getJobById(jobId: string) {
  return prisma.fineTuneJob.findUnique({
    where: { id: jobId },
    select: {
      id: true,
      name: true,
      baseModel: true,
      status: true,
      datasetSource: true,
      taskFilter: true,
      outputModelPath: true,
      metricsJson: true,
      startedAt: true,
      completedAt: true,
      createdById: true,
      createdAt: true,
    },
  });
}

/**
 * Spawns the Unsloth fine-tuning script as a child process.
 * Updates the job status to RUNNING → COMPLETED (or FAILED).
 *
 * datasetPath — absolute path to the .jsonl training data.
 * The caller (controller) is responsible for generating/uploading this file.
 */
export function startJob(jobId: string, datasetPath: string): void {
  const outputDir = path.join(OUTPUT_BASE, jobId);

  // Ensure script exists
  if (!fs.existsSync(SCRIPT_PATH)) {
    prisma.fineTuneJob
      .update({
        where: { id: jobId },
        data: {
          status: 'FAILED',
          completedAt: new Date(),
          metricsJson: { error: `Script not found: ${SCRIPT_PATH}` },
        },
      })
      .catch((err) => console.error('[FinetuneService] Failed to update FAILED status:', err));
    return;
  }

  const args = [
    SCRIPT_PATH,
    '--job-id', jobId,
    '--dataset', datasetPath,
    '--output', OUTPUT_BASE,
  ];

  console.log(`[FinetuneService] Spawning: ${PYTHON} ${args.join(' ')}`);

  const child = spawn(PYTHON, args, {
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env },
  });

  let stdout = '';
  let stderr = '';

  child.stdout.on('data', (data: Buffer) => {
    stdout += data.toString();
  });

  child.stderr.on('data', (data: Buffer) => {
    stderr += data.toString();
  });

  // Mark as RUNNING after spawn succeeds
  prisma.fineTuneJob
    .update({
      where: { id: jobId },
      data: { status: 'RUNNING', startedAt: new Date() },
    })
    .catch((err) => console.error('[FinetuneService] Failed to set RUNNING:', err));

  // Log the start
  void logEvent({
    actorId: null,
    action: 'FINETUNE_STARTED',
    entityType: 'FineTuneJob',
    entityId: jobId,
    metadataJson: { datasetPath, outputDir },
    severity: 'INFO',
    source: 'AUTOMATION',
  });

  child.on('close', async (code) => {
    const now = new Date();

    if (code !== 0) {
      console.error(`[FinetuneService] Job ${jobId} FAILED (exit ${code})`);
      console.error(`[FinetuneService] stderr:`, stderr.slice(-2000));

      await prisma.fineTuneJob
        .update({
          where: { id: jobId },
          data: {
            status: 'FAILED',
            completedAt: now,
            metricsJson: {
              exitCode: code,
              error: stderr.slice(-1000) || 'Unknown error',
              stdoutTail: stdout.slice(-500),
            },
          },
        })
        .catch((err) => console.error('[FinetuneService] Failed to update FAILED:', err));

      void logEvent({
        actorId: null,
        action: 'FINETUNE_FAILED',
        entityType: 'FineTuneJob',
        entityId: jobId,
        metadataJson: { exitCode: code },
        severity: 'CRITICAL',
        source: 'AUTOMATION',
      });
      return;
    }

    // Parse metrics from the last line of stdout
    let metrics: Record<string, unknown> = {};
    const metricsLine = stdout
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l.startsWith('METRICS:'))
      .pop();

    if (metricsLine) {
      try {
        metrics = JSON.parse(metricsLine.slice('METRICS:'.length).trim());
      } catch {
        metrics = { rawOutput: stdout.slice(-2000) };
      }
    } else {
      metrics = { rawOutput: stdout.slice(-2000) };
    }

    const outputModelPath = path.join(outputDir, 'adapter_model.safetensors');

    await prisma.fineTuneJob
      .update({
        where: { id: jobId },
        data: {
          status: 'COMPLETED',
          completedAt: now,
          outputModelPath: fs.existsSync(outputModelPath) ? outputDir : null,
          metricsJson: metrics as any,
        },
      })
      .catch((err) => console.error('[FinetuneService] Failed to update COMPLETED:', err));

    console.log(`[FinetuneService] Job ${jobId} COMPLETED`);

    void logEvent({
      actorId: null,
      action: 'FINETUNE_COMPLETED',
      entityType: 'FineTuneJob',
      entityId: jobId,
      metadataJson: metrics,
      severity: 'INFO',
      source: 'AUTOMATION',
    });
  });

  child.on('error', async (err) => {
    console.error(`[FinetuneService] Spawn error for job ${jobId}:`, err.message);

    await prisma.fineTuneJob
      .update({
        where: { id: jobId },
        data: {
          status: 'FAILED',
          completedAt: new Date(),
          metricsJson: { error: err.message },
        },
      })
      .catch((e) => console.error('[FinetuneService] Failed to update spawn error:', e));
  });
}
