import { Request, Response } from "express";
import { prisma } from "../index";
import { inferenceQueue } from "../queues/inferenceQueue";

/**
 * POST /api/inference/run
 * Encola un job de inferencia.
 * Body: { modelId: string, input: string, priority?: number }
 */
export async function runInference(req: Request, res: Response) {
  try {
    const { modelId, input, priority } = req.body;
    const userId = (req as any).user?.id;

    if (!modelId || !input) {
      return res.status(400).json({ error: "modelId and input are required" });
    }

    // Verify model exists and is READY
    const model = await prisma.modelRegistry.findUnique({ where: { id: modelId } });
    if (!model) {
      return res.status(404).json({ error: "Model not found" });
    }
    if (model.status !== "READY") {
      return res.status(400).json({ 
        error: `Model is not ready (status: ${model.status})` 
      });
    }

    // Create InferenceJob record
    const job = await prisma.inferenceJob.create({
      data: {
        modelId,
        userId: userId || "anonymous",
        input,
        status: "PENDING",
        priority: priority || 0,
      },
    });

    // Enqueue in BullMQ
    const queueJob = await inferenceQueue.add(
      "run-inference",
      {
        jobId: job.id,
        modelId,
        input,
        modelPath: model.filename,
      },
      {
        priority: priority || 0,
        jobId: job.id, // Use DB job ID as BullMQ job ID for traceability
      }
    );

    res.status(201).json({
      message: "Inference job queued",
      job: {
        id: job.id,
        modelId: job.modelId,
        status: job.status,
        bullmqJobId: queueJob.id,
      },
    });
  } catch (err: any) {
    console.error("[InferenceController] runInference error:", err.message);
    res.status(500).json({ error: "Failed to queue inference job" });
  }
}

/**
 * GET /api/inference/jobs/:id
 * Devuelve el estado de un job de inferencia.
 */
export async function getJobStatus(req: Request, res: Response) {
  try {
    const id = req.params.id as string;

    const job = await prisma.inferenceJob.findUnique({ where: { id } });
    if (!job) {
      return res.status(404).json({ error: "Inference job not found" });
    }

    // Also query BullMQ for real-time status
    let bullmqStatus: string | null = null;
    try {
      const queueJob = await inferenceQueue.getJob(id);
      if (queueJob) {
        const state = await queueJob.getState();
        bullmqStatus = state;
      }
    } catch (e: any) {
      // BullMQ job might not exist yet
    }

    res.json({
      job: {
        id: job.id,
        modelId: job.modelId,
        userId: job.userId,
        input: job.input.slice(0, 200), // Truncate for display
        output: job.output?.slice(0, 500),
        status: job.status,
        priority: job.priority,
        bullmqStatus,
        createdAt: job.createdAt,
        updatedAt: job.updatedAt,
      },
    });
  } catch (err: any) {
    console.error("[InferenceController] getJobStatus error:", err.message);
    res.status(500).json({ error: "Failed to get job status" });
  }
}
