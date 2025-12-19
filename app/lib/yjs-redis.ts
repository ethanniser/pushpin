// Yjs Redis persistence and sync helpers
// Handles document state, updates, and awareness via Redis

import * as Y from "yjs";
import * as syncProtocol from "y-protocols/sync";
import * as awarenessProtocol from "y-protocols/awareness";
import * as encoding from "lib0/encoding";
import * as decoding from "lib0/decoding";
import Redis from "ioredis";

// Message types (from y-protocols)
export const messageSync = 0;
export const messageAwareness = 1;

// Sync sub-types
export const messageSyncStep1 = 0;
export const messageSyncStep2 = 1;
export const messageSyncUpdate = 2;

// Redis client singleton
let redis: Redis | null = null;

export function getRedis(): Redis {
  if (!redis) {
    const redisUrl = process.env.REDIS_URL || "redis://localhost:6379";
    redis = new Redis(redisUrl);
  }
  return redis;
}

// Key helpers
const docKey = (room: string) => `yjs:doc:${room}`;
const updatesKey = (room: string) => `yjs:updates:${room}`;
const awarenessKey = (room: string) => `yjs:awareness:${room}`;
const connectionsKey = (room: string) => `yjs:connections:${room}`;

// Store a connection's awareness ID for cleanup
export async function registerConnection(
  room: string,
  connectionId: string,
  awarenessClientId?: number
): Promise<void> {
  const r = getRedis();
  const data = JSON.stringify({ awarenessClientId, timestamp: Date.now() });
  await r.hset(connectionsKey(room), connectionId, data);
}

export async function unregisterConnection(
  room: string,
  connectionId: string
): Promise<{ awarenessClientId?: number }> {
  const r = getRedis();
  const data = await r.hget(connectionsKey(room), connectionId);
  await r.hdel(connectionsKey(room), connectionId);
  if (data) {
    try {
      return JSON.parse(data);
    } catch {
      return {};
    }
  }
  return {};
}

// Load or create a Y.Doc from Redis
export async function loadDoc(room: string): Promise<Y.Doc> {
  const r = getRedis();
  const doc = new Y.Doc();

  // Load base document state if exists
  const docState = await r.getBuffer(docKey(room));
  if (docState) {
    Y.applyUpdate(doc, docState);
  }

  // Apply any pending updates from the stream
  const updates = await r.lrangeBuffer(updatesKey(room), 0, -1);
  for (const update of updates) {
    try {
      Y.applyUpdate(doc, update);
    } catch (e) {
      console.error("[YjsRedis] Error applying update:", e);
    }
  }

  return doc;
}

// Save an update to Redis
export async function saveUpdate(room: string, update: Uint8Array): Promise<void> {
  const r = getRedis();
  await r.rpush(updatesKey(room), Buffer.from(update));

  // Compact if we have too many updates (simple compaction strategy)
  const len = await r.llen(updatesKey(room));
  if (len > 100) {
    await compactDoc(room);
  }
}

// Compact updates into a single document state
export async function compactDoc(room: string): Promise<void> {
  const r = getRedis();
  const doc = await loadDoc(room);
  const state = Y.encodeStateAsUpdate(doc);

  // Use a transaction to atomically replace updates with compacted state
  const multi = r.multi();
  multi.set(docKey(room), Buffer.from(state));
  multi.del(updatesKey(room));
  await multi.exec();

  console.log(`[YjsRedis] Compacted doc for room: ${room}`);
}

// Create SyncStep1 message (state vector)
export function encodeSyncStep1(doc: Y.Doc): Uint8Array {
  const encoder = encoding.createEncoder();
  encoding.writeVarUint(encoder, messageSync);
  syncProtocol.writeSyncStep1(encoder, doc);
  return encoding.toUint8Array(encoder);
}

// Create SyncStep2 message (full state as update)
export function encodeSyncStep2(doc: Y.Doc, stateVector?: Uint8Array): Uint8Array {
  const encoder = encoding.createEncoder();
  encoding.writeVarUint(encoder, messageSync);
  if (stateVector) {
    syncProtocol.writeSyncStep2(encoder, doc, stateVector);
  } else {
    // Send full state
    encoding.writeVarUint(encoder, messageSyncStep2);
    encoding.writeVarUint8Array(encoder, Y.encodeStateAsUpdate(doc));
  }
  return encoding.toUint8Array(encoder);
}

// Encode awareness update
export function encodeAwarenessUpdate(
  awareness: awarenessProtocol.Awareness,
  clients: number[]
): Uint8Array {
  const encoder = encoding.createEncoder();
  encoding.writeVarUint(encoder, messageAwareness);
  encoding.writeVarUint8Array(
    encoder,
    awarenessProtocol.encodeAwarenessUpdate(awareness, clients)
  );
  return encoding.toUint8Array(encoder);
}

// Encode awareness "user disconnected" message
export function encodeAwarenessUserDisconnected(
  clientId: number,
  lastClock: number
): Uint8Array {
  const encoder = encoding.createEncoder();
  encoding.writeVarUint(encoder, messageAwareness);
  // Manually encode awareness update with null state
  const innerEncoder = encoding.createEncoder();
  encoding.writeVarUint(innerEncoder, 1); // one change
  encoding.writeVarUint(innerEncoder, clientId);
  encoding.writeVarUint(innerEncoder, lastClock + 1);
  encoding.writeVarString(innerEncoder, JSON.stringify(null));
  encoding.writeVarUint8Array(encoder, encoding.toUint8Array(innerEncoder));
  return encoding.toUint8Array(encoder);
}

// Process an incoming Yjs message
// Returns: { response?: Uint8Array, broadcast?: Uint8Array, awarenessClientId?: number }
export async function processMessage(
  room: string,
  message: Uint8Array,
  doc: Y.Doc
): Promise<{
  response?: Uint8Array;
  broadcast?: Uint8Array;
  awarenessClientId?: number;
}> {
  const decoder = decoding.createDecoder(message);
  const messageType = decoding.readVarUint(decoder);

  switch (messageType) {
    case messageSync: {
      const syncMessageType = decoding.readVarUint(decoder);

      switch (syncMessageType) {
        case messageSyncStep1: {
          // Client sends state vector, we respond with missing updates
          const stateVector = decoding.readVarUint8Array(decoder);
          const response = encodeSyncStep2(doc, stateVector);
          return { response };
        }

        case messageSyncStep2:
        case messageSyncUpdate: {
          // Client sends update, apply and broadcast
          const update = decoding.readVarUint8Array(decoder);
          Y.applyUpdate(doc, update);
          await saveUpdate(room, update);
          // Broadcast the original message to others
          return { broadcast: message };
        }

        default:
          console.warn(`[YjsRedis] Unknown sync message type: ${syncMessageType}`);
          return {};
      }
    }

    case messageAwareness: {
      // Awareness updates are just broadcast, not persisted
      // But we extract the client ID for cleanup purposes
      const awarenessUpdate = decoding.readVarUint8Array(decoder);
      const awarenessDecoder = decoding.createDecoder(awarenessUpdate);
      const len = decoding.readVarUint(awarenessDecoder);
      let awarenessClientId: number | undefined;
      if (len === 1) {
        awarenessClientId = decoding.readVarUint(awarenessDecoder);
      }
      return { broadcast: message, awarenessClientId };
    }

    default:
      console.warn(`[YjsRedis] Unknown message type: ${messageType}`);
      return {};
  }
}

// Get current awareness states from Redis (for new connections)
export async function getAwarenessStates(
  room: string
): Promise<Map<number, Record<string, unknown>>> {
  const r = getRedis();
  const states = new Map<number, Record<string, unknown>>();

  const data = await r.hgetall(awarenessKey(room));
  for (const [clientId, stateJson] of Object.entries(data)) {
    try {
      const state = JSON.parse(stateJson);
      if (state !== null) {
        states.set(parseInt(clientId, 10), state);
      }
    } catch {
      // ignore invalid entries
    }
  }

  return states;
}

// Store awareness state in Redis with TTL
export async function storeAwarenessState(
  room: string,
  clientId: number,
  state: Record<string, unknown> | null
): Promise<void> {
  const r = getRedis();
  if (state === null) {
    await r.hdel(awarenessKey(room), clientId.toString());
  } else {
    await r.hset(awarenessKey(room), clientId.toString(), JSON.stringify(state));
    // Set expiry on the hash (entire awareness for room expires after 1 hour of inactivity)
    await r.expire(awarenessKey(room), 3600);
  }
}
