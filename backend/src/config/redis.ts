import Redis from "ioredis";

const REDIS_URL = process.env.REDIS_URL || "redis://localhost:6379";

// Shared Redis client for BullMQ
export const redisConnection = new Redis(REDIS_URL, {
  maxRetriesPerRequest: null, // Required by BullMQ
  enableReadyCheck: false,
  lazyConnect: true,
  retryStrategy(times) {
    // Don't flood — only retry every 30s after first failure
    if (times > 3) return null; // Give up after 3 attempts
    return Math.min(times * 10000, 30000);
  },
  reconnectOnError(err) {
    return false; // Don't auto-reconnect on errors
  },
});

redisConnection.on("error", (err) => {
  console.error("[Redis] Connection error:", err.message);
});

redisConnection.on("connect", () => {
  console.log("[Redis] Connected");
});

export default redisConnection;
