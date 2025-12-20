// WebSocket-over-HTTP handler factory for Yjs collaborative editing
// Stateless relay - Y.Doc-free serverless implementation
// Persistence is treated as "just another peer" - stores/retrieves raw updates

import {
  Publisher,
  WebSocketMessageFormat,
  isWsOverHttp,
  getWebSocketContextFromReq,
  encodeWebSocketEvents,
} from "@fanoutio/grip";
import * as encoding from "lib0/encoding";
import * as decoding from "lib0/decoding";

// Outer message types (transport layer) from y-websocket
import {
  messageSync,
  messageAwareness,
  messageAuth,
  messageQueryAwareness,
} from "y-websocket";

// Sync sub-message types from y-protocols
import {
  messageYjsSyncStep1,
  messageYjsSyncStep2,
  messageYjsUpdate,
} from "y-protocols/sync";

// Auth sub-message types from y-protocols
import { messagePermissionDenied } from "y-protocols/auth";

// Empty state vector - tells client "I have nothing, send me everything"
// This is Y.encodeStateVector(new Y.Doc()) which encodes an empty map as [0]
const emptyStateVector = new Uint8Array([0]);

/**
 * Persistence provider interface - treats persistence as "just another peer"
 *
 * Think of it like a peer that:
 * - Can receive updates (storeUpdate)
 * - Can provide its current state (getState)
 */
export interface PersistenceProvider {
  /**
   * Get the current document state as a Yjs update
   * Returns the full merged state, or null if no state exists
   * The provider handles merging internally (e.g., snapshot + pending updates)
   */
  getState(docName: string): Promise<Uint8Array | null>;

  /**
   * Store an update (like receiving an update from a peer)
   * The provider handles merging/compaction internally
   */
  storeUpdate(docName: string, update: Uint8Array): Promise<void>;
}

/**
 * Awareness store interface - stores ephemeral presence state
 *
 * Awareness is stored per-client with automatic expiry (TTL).
 * This enables new clients to see who's currently online.
 */
export interface AwarenessStore {
  /**
   * Get all awareness states for a document
   * Returns array of raw awareness update bytes (one per client)
   */
  getAll(docName: string): Promise<Uint8Array[]>;

  /**
   * Store awareness update for a client
   * Should auto-expire after ~30 seconds (awareness timeout)
   * @param clientId - The Yjs client ID
   * @param update - Raw awareness update bytes
   */
  set(docName: string, clientId: number, update: Uint8Array): Promise<void>;

  /**
   * Remove awareness for a client (on disconnect)
   */
  remove(docName: string, clientId: number): Promise<void>;
}

export type YjsHandlerOptions = {
  /** GRIP publisher control URI */
  publishUrl?: string;

  /**
   * Optional persistence provider for loading/saving document state
   * If not provided, the handler is purely stateless (relay only)
   */
  persistence?: PersistenceProvider;

  /**
   * Optional awareness store for presence state
   * If not provided, awareness only works via broadcast (no initialstate for new clients)
   */
  awareness?: AwarenessStore;
};

// Extract room from URL path after base route
// e.g., ws://host/api/yjs/my-room -> "my-room"
function getDocName(req: Request): string {
  const url = new URL(req.url);
  const segments = url.pathname.split("/").filter(Boolean);
  return segments[segments.length - 1] || "default";
}

// Publish a binary message to a GRIP channel
async function publishToChannel(
  publisher: Publisher,
  channel: string,
  message: Uint8Array
) {
  try {
    await publisher.publishFormats(
      channel,
      new WebSocketMessageFormat(message)
    );
  } catch (error) {
    console.error(`[Yjs] Error publishing to channel ${channel}:`, error);
  }
}

// Encode a SyncStep1 message (request state from peer)
function encodeSyncStep1(stateVector: Uint8Array): Uint8Array {
  const encoder = encoding.createEncoder();
  encoding.writeVarUint(encoder, messageSync);
  encoding.writeVarUint(encoder, messageYjsSyncStep1);
  encoding.writeVarUint8Array(encoder, stateVector);
  return encoding.toUint8Array(encoder);
}

// Encode a SyncStep2 message (send state to peer)
function encodeSyncStep2(update: Uint8Array): Uint8Array {
  const encoder = encoding.createEncoder();
  encoding.writeVarUint(encoder, messageSync);
  encoding.writeVarUint(encoder, messageYjsSyncStep2);
  encoding.writeVarUint8Array(encoder, update);
  return encoding.toUint8Array(encoder);
}

// Encode a disconnect awareness update for a client
function encodeDisconnectAwareness(
  clientId: number,
  clock: number
): Uint8Array {
  // First encode the awareness update itself (y-protocols format)
  const awarenessEncoder = encoding.createEncoder();
  encoding.writeVarUint(awarenessEncoder, 1); // 1 client
  encoding.writeVarUint(awarenessEncoder, clientId);
  encoding.writeVarUint(awarenessEncoder, clock + 1); // increment clock so it's accepted
  encoding.writeVarString(awarenessEncoder, "null"); // null state = disconnected
  const awarenessUpdate = encoding.toUint8Array(awarenessEncoder);

  // Then wrap it in the message format (y-websocket expects VarUint8Array)
  const encoder = encoding.createEncoder();
  encoding.writeVarUint(encoder, messageAwareness);
  encoding.writeVarUint8Array(encoder, awarenessUpdate);
  return encoding.toUint8Array(encoder);
}

// Encode a PermissionDenied message (for auth errors)
// Exported for use in custom auth implementations
export function encodePermissionDenied(reason: string): Uint8Array {
  const encoder = encoding.createEncoder();
  encoding.writeVarUint(encoder, messageAuth);
  encoding.writeVarUint(encoder, messagePermissionDenied);
  encoding.writeVarString(encoder, reason);
  return encoding.toUint8Array(encoder);
}

// Encode an awareness message wrapper
function encodeAwarenessMessage(awarenessUpdate: Uint8Array): Uint8Array {
  const encoder = encoding.createEncoder();
  encoding.writeVarUint(encoder, messageAwareness);
  encoding.writeVarUint8Array(encoder, awarenessUpdate);
  return encoding.toUint8Array(encoder);
}

// Parse awareness update to extract client IDs, clocks, and check for null states
function parseAwarenessUpdate(
  update: Uint8Array
): { clientId: number; clock: number; isNull: boolean }[] {
  const decoder = decoding.createDecoder(update);
  const len = decoding.readVarUint(decoder);
  const clients: { clientId: number; clock: number; isNull: boolean }[] = [];

  for (let i = 0; i < len; i++) {
    const clientId = decoding.readVarUint(decoder);
    const clock = decoding.readVarUint(decoder);
    const state = decoding.readVarString(decoder);
    clients.push({ clientId, clock, isNull: state === "null" });
  }

  return clients;
}

/**
 * Creates a WebSocket-over-HTTP request handler for Yjs
 *
 * This is a Y.Doc-free implementation - the server never creates a Y.Doc.
 * Instead, it treats persistence as another peer and just relays raw updates.
 *
 * Protocol flow:
 * 1. Client connects, sends SyncStep1 (its state vector)
 * 2. Server responds with SyncStep2 (full state from persistence)
 * 3. Server sends SyncStep1 with empty state vector (requests client's full state)
 * 4. Client responds with SyncStep2 (its full state)
 * 5. Server persists client's state
 * 6. Ongoing: Updates are persisted and broadcast
 */
export function makeYjsHandler(options: YjsHandlerOptions = {}) {
  const {
    publishUrl = process.env.PUBLISH_URL || "http://pushpin:5561/",
    persistence,
    awareness: awarenessStore,
  } = options;

  const publisher = new Publisher({ control_uri: publishUrl });

  return async function handler(req: Request): Promise<Response> {
    if (!isWsOverHttp(req)) {
      return new Response("Not a WebSocket-over-HTTP request", { status: 400 });
    }

    const wsContext = await getWebSocketContextFromReq(req);
    const connectionId = wsContext.id;
    const docName = getDocName(req);
    const channel = `yjs:${docName}`;

    // Client metadata is stored in wsContext.meta (persisted by Pushpin across requests)
    // - origMeta: read-only, what Pushpin sent us
    // - meta: mutable, changes are sent back as Set-Meta-* headers

    // Handle connection opening
    if (wsContext.isOpening()) {
      console.log(`[Yjs] Connection opened: ${connectionId}`);
      wsContext.accept();
      wsContext.subscribe(channel);

      // Send SyncStep1 with empty state vector
      // This tells the client "I have nothing, send me everything"
      // Client will respond with SyncStep2 containing its full state
      wsContext.sendBinary(Buffer.from(encodeSyncStep1(emptyStateVector)));

      // If we have persisted state, send it as SyncStep2
      if (persistence) {
        try {
          const state = await persistence.getState(docName);
          if (state && state.length > 0) {
            console.log(
              `[Yjs] Sending persisted state for "${docName}" (${state.length} bytes)`
            );
            wsContext.sendBinary(Buffer.from(encodeSyncStep2(state)));
          }
        } catch (error) {
          console.error(`[Yjs] Error loading persisted state:`, error);
        }
      }

      // Send stored awareness states to the new client
      if (awarenessStore) {
        try {
          const awarenessStates = await awarenessStore.getAll(docName);
          console.log(
            `[Yjs] Loading ${awarenessStates.length} awareness states for new client`
          );
          for (const state of awarenessStates) {
            console.log(
              `[Yjs] Sending stored awareness (${state.length} bytes):`,
              parseAwarenessUpdate(state)
            );
            wsContext.sendBinary(Buffer.from(encodeAwarenessMessage(state)));
          }
        } catch (error) {
          console.error(`[Yjs] Error loading awareness:`, error);
        }
      }
    }

    // Process incoming messages
    while (wsContext.canRecv()) {
      const rawMessage = wsContext.recvRaw();

      if (rawMessage === null) {
        // Connection closed - clean up awareness using stored metadata
        console.log(`[Yjs] Connection closed: ${connectionId}`);
        console.log(`[Yjs] meta:`, wsContext.meta);

        // Use metadata from Pushpin to identify which client disconnected
        const storedClientId = wsContext.meta["client-id"];
        const storedClock = wsContext.meta["client-clock"];

        if (storedClientId && storedClock) {
          const clientId = parseInt(storedClientId, 10);
          const clock = parseInt(storedClock, 10);

          if (!isNaN(clientId) && !isNaN(clock)) {
            console.log(
              `[Yjs] Client ${clientId} disconnected, broadcasting to ${channel}`
            );

            // Remove from store (TTL is backup if this doesn't run)
            if (awarenessStore) {
              try {
                await awarenessStore.remove(docName, clientId);
              } catch (error) {
                console.error(`[Yjs] Error removing awareness:`, error);
              }
            }

            // Broadcast disconnect to other clients
            const disconnectMsg = encodeDisconnectAwareness(clientId, clock);
            console.log(
              `[Yjs] Broadcasting disconnect message (${disconnectMsg.length} bytes)`
            );
            await publishToChannel(publisher, channel, disconnectMsg);
          }
        } else {
          console.log(
            `[Yjs] No client metadata found, skipping disconnect broadcast`
          );
        }

        wsContext.close();
        break;
      }

      const message =
        typeof rawMessage === "string"
          ? new TextEncoder().encode(rawMessage)
          : rawMessage;

      try {
        const decoder = decoding.createDecoder(message);
        const messageType = decoding.readVarUint(decoder);

        if (messageType === messageSync) {
          const syncType = decoding.readVarUint(decoder);

          if (syncType === messageYjsSyncStep1) {
            // Client is asking for our state
            // We ignore their state vector and just send full state
            // (CRDTs handle deduplication gracefully)
            decoding.readVarUint8Array(decoder); // consume but ignore state vector

            if (persistence) {
              try {
                const state = await persistence.getState(docName);
                if (state && state.length > 0) {
                  wsContext.sendBinary(Buffer.from(encodeSyncStep2(state)));
                }
              } catch (error) {
                console.error(`[Yjs] Error loading state for sync:`, error);
              }
            }
          } else if (
            syncType === messageYjsSyncStep2 ||
            syncType === messageYjsUpdate
          ) {
            // Client sending state or update - persist and broadcast
            const update = decoding.readVarUint8Array(decoder);

            if (persistence && update.length > 0) {
              try {
                await persistence.storeUpdate(docName, update);
              } catch (error) {
                console.error(`[Yjs] Error persisting update:`, error);
              }
            }

            // Broadcast to all subscribers
            await publishToChannel(publisher, channel, message);
          }
        } else if (messageType === messageAwareness) {
          // Awareness update - store and broadcast
          const awarenessUpdate = decoding.readVarUint8Array(decoder);

          // Store awareness if we have a store
          if (awarenessStore) {
            try {
              const clients = parseAwarenessUpdate(awarenessUpdate);
              console.log(`[Yjs] Received awareness update:`, clients);
              for (const { clientId, clock, isNull } of clients) {
                if (isNull) {
                  console.log(
                    `[Yjs] Removing awareness for client ${clientId} (null state)`
                  );
                  await awarenessStore.remove(docName, clientId);
                } else {
                  console.log(
                    `[Yjs] Storing awareness for client ${clientId} clock=${clock} (${awarenessUpdate.length} bytes)`
                  );
                  await awarenessStore.set(docName, clientId, awarenessUpdate);

                  // Bind client ID to connection for disconnect cleanup
                  // Only set once - check meta (not origMeta) to prevent overwrites within same request
                  if (!wsContext.meta["client-id"]) {
                    wsContext.meta["client-id"] = String(clientId);
                  }
                  // Always update clock for THIS client's awareness (needed for disconnect)
                  if (wsContext.meta["client-id"] === String(clientId)) {
                    wsContext.meta["client-clock"] = String(clock);
                  }
                }
              }
            } catch (error) {
              console.error(`[Yjs] Error storing awareness:`, error);
            }
          }

          // Broadcast to all subscribers
          await publishToChannel(publisher, channel, message);
        } else if (messageType === messageQueryAwareness) {
          // Query awareness - broadcast so other clients respond with their state
          await publishToChannel(publisher, channel, message);
        }
      } catch (error) {
        console.error(`[Yjs] Error processing message:`, error);
      }
    }

    const events = wsContext.getOutgoingEvents();
    const responseBody = encodeWebSocketEvents(events);

    // toHeaders() automatically converts wsContext.meta changes to Set-Meta-* headers
    return new Response(responseBody as unknown as BodyInit, {
      status: 200,
      headers: wsContext.toHeaders(),
    });
  };
}
