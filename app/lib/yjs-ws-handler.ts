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

// Message types (from y-protocols)
const messageSync = 0;
const messageAwareness = 1;

// Sync message sub-types (from y-protocols/sync)
const messageYjsSyncStep1 = 0;
const messageYjsSyncStep2 = 1;
const messageYjsUpdate = 2;

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

export type YjsHandlerOptions = {
  /** GRIP publisher control URI */
  publishUrl?: string;

  /**
   * Optional persistence provider for loading/saving document state
   * If not provided, the handler is purely stateless (relay only)
   */
  persistence?: PersistenceProvider;
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
  } = options;

  const publisher = new Publisher({ control_uri: publishUrl });

  return async function handler(req: Request): Promise<Response> {
    if (!isWsOverHttp(req)) {
      return new Response("Not a WebSocket-over-HTTP request", { status: 400 });
    }

    const wsContext = await getWebSocketContextFromReq(req);
    const connectionId = req.headers.get("Connection-Id") || "unknown";
    const docName = getDocName(req);
    const channel = `yjs:${docName}`;

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
    }

    // Process incoming messages
    while (wsContext.canRecv()) {
      const rawMessage = wsContext.recvRaw();

      if (rawMessage === null) {
        console.log(`[Yjs] Connection closed: ${connectionId}`);
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
          // Awareness update - just broadcast, don't persist
          await publishToChannel(publisher, channel, message);
        }
      } catch (error) {
        console.error(`[Yjs] Error processing message:`, error);
      }
    }

    const events = wsContext.getOutgoingEvents();
    const responseBody = encodeWebSocketEvents(events);

    return new Response(responseBody as unknown as BodyInit, {
      status: 200,
      headers: wsContext.toHeaders(),
    });
  };
}
