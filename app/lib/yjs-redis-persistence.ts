// Redis-based persistence provider for Yjs
// Stores updates in a Redis list, merges on read using Yjs
//
// Storage format:
// - Key: `yjs:${docName}:updates` - List of raw update bytes (base64 encoded)
// - Key: `yjs:${docName}:snapshot` - Optional merged snapshot for optimization

import { Redis } from "ioredis";
import * as Y from "yjs";
import type { PersistenceProvider } from "./yjs-ws-handler";

export type RedisProviderOptions = {
  /** Redis connection URL or options */
  redis?: Redis | string;

  /** Key prefix for Yjs documents */
  keyPrefix?: string;

  /**
   * Number of updates before auto-compaction into snapshot
   * Set to 0 to disable auto-compaction
   */
  compactionThreshold?: number;
};

export function createRedisPersistence(
  options: RedisProviderOptions = {}
): PersistenceProvider {
  const {
    redis: redisOption,
    keyPrefix = "yjs",
    compactionThreshold = 100,
  } = options;

  // Create Redis client
  const redis =
    typeof redisOption === "string"
      ? new Redis(redisOption)
      : redisOption ?? new Redis(process.env.REDIS_URL || "redis://localhost:6379");

  const updatesKey = (docName: string) => `${keyPrefix}:${docName}:updates`;
  const snapshotKey = (docName: string) => `${keyPrefix}:${docName}:snapshot`;

  return {
    async getState(docName: string): Promise<Uint8Array | null> {
      const doc = new Y.Doc();

      try {
        // Load snapshot if exists
        const snapshot = await redis.getBuffer(snapshotKey(docName));
        if (snapshot) {
          Y.applyUpdate(doc, new Uint8Array(snapshot));
        }

        // Load pending updates
        const updates = await redis.lrangeBuffer(updatesKey(docName), 0, -1);
        for (const update of updates) {
          Y.applyUpdate(doc, new Uint8Array(update));
        }

        // Return merged state
        const state = Y.encodeStateAsUpdate(doc);

        // Return null if empty (no state)
        if (doc.store.clients.size === 0) {
          return null;
        }

        return state;
      } finally {
        doc.destroy();
      }
    },

    async storeUpdate(docName: string, update: Uint8Array): Promise<void> {
      // Append update to list
      await redis.rpush(updatesKey(docName), Buffer.from(update));

      // Check if we should compact
      if (compactionThreshold > 0) {
        const count = await redis.llen(updatesKey(docName));
        if (count >= compactionThreshold) {
          await compact(docName);
        }
      }
    },
  };

  // Compact updates into a snapshot
  async function compact(docName: string): Promise<void> {
    const doc = new Y.Doc();

    try {
      // Load existing snapshot
      const snapshot = await redis.getBuffer(snapshotKey(docName));
      if (snapshot) {
        Y.applyUpdate(doc, new Uint8Array(snapshot));
      }

      // Load all updates
      const updates = await redis.lrangeBuffer(updatesKey(docName), 0, -1);
      for (const update of updates) {
        Y.applyUpdate(doc, new Uint8Array(update));
      }

      // Save new snapshot and clear updates (atomic via pipeline)
      const newSnapshot = Y.encodeStateAsUpdate(doc);
      const pipeline = redis.pipeline();
      pipeline.set(snapshotKey(docName), Buffer.from(newSnapshot));
      pipeline.del(updatesKey(docName));
      await pipeline.exec();

      console.log(`[Redis] Compacted ${updates.length} updates for "${docName}"`);
    } finally {
      doc.destroy();
    }
  }
}
