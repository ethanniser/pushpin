import Redis from "ioredis";

// Create a singleton Redis client
let redisClient: Redis | null = null;

export function getRedis(): Redis {
  if (!redisClient) {
    const redisUrl = process.env.REDIS_URL || "redis://localhost:6379";
    redisClient = new Redis(redisUrl, {
      maxRetriesPerRequest: 3,
      retryStrategy(times) {
        const delay = Math.min(times * 50, 2000);
        return delay;
      },
      lazyConnect: false,
    });

    redisClient.on("error", (err) => {
      console.error("[Redis] Connection error:", err);
    });

    redisClient.on("connect", () => {
      console.log("[Redis] Connected successfully");
    });
  }

  return redisClient;
}

// Helper functions for connection state management
export async function setConnectionState(
  connectionId: string,
  username: string,
  room: string,
  ttlSeconds: number = 3600 // 1 hour default TTL
): Promise<void> {
  const redis = getRedis();
  const key = `conn:${connectionId}`;
  const value = JSON.stringify({ username, room });
  await redis.setex(key, ttlSeconds, value);
}

export async function getConnectionState(
  connectionId: string
): Promise<{ username: string; room: string } | null> {
  const redis = getRedis();
  const key = `conn:${connectionId}`;
  const value = await redis.get(key);
  
  if (!value) {
    return null;
  }
  
  return JSON.parse(value);
}

export async function deleteConnectionState(
  connectionId: string
): Promise<void> {
  const redis = getRedis();
  const key = `conn:${connectionId}`;
  await redis.del(key);
}

