import { Worker, Job } from "bullmq";
import redisConnection from "../config/redis";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

/**
 * Inference Worker — processes jobs from the "inference" queue.
 * 
 * PLACEHOLDER: Currently simulates inference.
 * Real llama.cpp integration will replace the simulation.
 */
const worker = new Worker(
  "inference",
  async (job: Job) => {
    const { jobId, input, modelPath } = job.data;
    console.log(`[InferenceWorker] Processing job ${jobId} on model ${modelPath}`);

    // Update DB status to RUNNING
    await prisma.inferenceJob.update({
      where: { id: jobId },
      data: { status: "RUNNING" },
    });

    // ── PLACEHOLDER: Simulated inference ──
    // TODO: Replace with actual llama.cpp invocation:
    //   const result = await execAsync(`llama-cli -m /models/${modelPath} -p "${input}"`);
    
    await new Promise((resolve) => setTimeout(resolve, 1000)); // Simulate processing
    
    const simulatedOutput = `[PLACEHOLDER] Inference on "${input.slice(0, 50)}..." completed. Model: ${modelPath}`;
    // ── End placeholder ──

    // Update DB with result
    await prisma.inferenceJob.update({
      where: { id: jobId },
      data: {
        status: "COMPLETED",
        output: simulatedOutput,
      },
    });

    console.log(`[InferenceWorker] Job ${jobId} completed`);
    return { output: simulatedOutput };
  },
  {
    connection: redisConnection,
    concurrency: 2,
    limiter: {
      max: 10,
      duration: 60000, // 10 jobs per minute max
    },
  }
);

worker.on("completed", (job) => {
  console.log(`[InferenceWorker] Job ${job.id} completed`);
});

worker.on("failed", async (job, err) => {
  console.error(`[InferenceWorker] Job ${job?.id} failed:`, err.message);
  
  if (job?.data?.jobId) {
    await prisma.inferenceJob.update({
      where: { id: job.data.jobId },
      data: { status: "FAILED", output: err.message },
    }).catch(() => {});
  }
});

console.log("[InferenceWorker] Worker started (placeholder mode)");

export default worker;
