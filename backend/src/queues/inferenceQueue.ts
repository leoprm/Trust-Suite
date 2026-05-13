import { Queue } from "bullmq";
import redisConnection from "../config/redis";

export const inferenceQueue = new Queue("inference", {
  connection: redisConnection,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: "exponential", delay: 5000 },
    removeOnComplete: { count: 100 },
    removeOnFail: { count: 50 },
  },
});

inferenceQueue.on("error", (err) => {
  console.error("[InferenceQueue] Error:", err.message);
});

export default inferenceQueue;
