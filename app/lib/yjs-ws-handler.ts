// WebSocket-over-HTTP handler factory for Yjs collaborative editing
// Stateless relay - similar to y-websocket-server but serverless
// Just relays messages between clients via GRIP pub/sub

import {
  Publisher,
  WebSocketMessageFormat,
  isWsOverHttp,
  getWebSocketContextFromReq,
  encodeWebSocketEvents,
} from "@fanoutio/grip";
import * as Y from "yjs";
import * as syncProtocol from "y-protocols/sync";
import * as encoding from "lib0/encoding";
import * as decoding from "lib0/decoding";

// Message types
const messageSync = 0;
const messageAwareness = 1;

/**
 * Persistence provider interface (similar to y-websocket-server)
 *
 * In serverless context:
 * - bindState is called on connection OPEN to load existing doc state
 * - writeState is called on each update to persist changes
 */
export interface PersistenceProvider {
  /**
   * Called when a client connects to load existing document state
   * Should apply any persisted state to the provided Y.Doc
   */
  bindState(docName: string, doc: Y.Doc): Promise<void>;

  /**
   * Called when an update is received to persist it
   * @param docName - The document name/room
   * @param doc - The Y.Doc (may be empty in stateless mode - update is more useful)
   * @param update - The raw Yjs update bytes
   */
  writeState(docName: string, doc: Y.Doc, update: Uint8Array): Promise<void>;
}

export type YjsHandlerOptions = {
  /** GRIP publisher control URI */
  publishUrl?: string;

  /**
   * Function to extract room/doc name from request URL (like y-websocket-server)
   * Default: takes last path segment, e.g., /api/yjs/my-room -> "my-room"
   */
  getDocName?: (req: Request) => string;

  /**
   * Optional persistence provider for loading/saving document state
   * If not provided, the handler is purely stateless (relay only)
   */
  persistence?: PersistenceProvider;
};

// Default: extract room from URL path after base route
// e.g., ws://host/api/yjs/my-room -> "my-room"
// e.g., ws://host/api/yjs/my-room?token=abc -> "my-room"
function defaultGetDocName(req: Request): string {
  const url = new URL(req.url);
  // Get the last segment of the path
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
    await publisher.publishFormats(channel, new WebSocketMessageFormat(message));
  } catch (error) {
    console.error(`[Yjs] Error publishing to channel ${channel}:`, error);
  }
}

/**
 * Creates a WebSocket-over-HTTP request handler for Yjs
 * Similar to y-websocket-server's setupWSConnection but for serverless
 */
export function makeYjsHandler(options: YjsHandlerOptions = {}) {
  const {
    publishUrl = process.env.PUBLISH_URL || "http://pushpin:5561/",
    getDocName = defaultGetDocName,
    persistence,
  } = options;

  const publisher = new Publisher({ control_uri: publishUrl });

  return async function handler(req: Request): Promise<Response> {
    // Verify this is a WebSocket-over-HTTP request
    if (!isWsOverHttp(req)) {
      return new Response("Not a WebSocket-over-HTTP request", { status: 400 });
    }

    const wsContext = await getWebSocketContextFromReq(req);
    const connectionId = req.headers.get("Connection-Id") || "unknown";
    const docName = getDocName(req);
    const channel = `yjs:${docName}`;

    console.log(`[Yjs] Request for doc "${docName}" from: ${connectionId}`);

    // Handle connection opening
    if (wsContext.isOpening()) {
      console.log(`[Yjs] Connection opened: ${connectionId}`);
      wsContext.accept();
      wsContext.subscribe(channel);

      // Create doc and optionally load persisted state
      const doc = new Y.Doc();

      if (persistence) {
        try {
          await persistence.bindState(docName, doc);
          console.log(`[Yjs] Loaded persisted state for "${docName}"`);
        } catch (error) {
          console.error(`[Yjs] Error loading persisted state:`, error);
        }
      }

      // Send sync step 1 (our state vector)
      const encoder = encoding.createEncoder();
      encoding.writeVarUint(encoder, messageSync);
      syncProtocol.writeSyncStep1(encoder, doc);
      wsContext.sendBinary(Buffer.from(encoding.toUint8Array(encoder)));

      // If we have persisted state, also send sync step 2 with full state
      if (persistence && doc.store.clients.size > 0) {
        const encoder2 = encoding.createEncoder();
        encoding.writeVarUint(encoder2, messageSync);
        encoding.writeVarUint(encoder2, syncProtocol.messageYjsSyncStep2);
        encoding.writeVarUint8Array(encoder2, Y.encodeStateAsUpdate(doc));
        wsContext.sendBinary(Buffer.from(encoding.toUint8Array(encoder2)));
      }
    }

    // Process incoming messages
    while (wsContext.canRecv()) {
      const rawMessage = wsContext.recvRaw();

      if (rawMessage === null) {
        // CLOSE message
        console.log(`[Yjs] Connection closed: ${connectionId}`);
        wsContext.close();
        break;
      }

      // Get message bytes
      const message =
        typeof rawMessage === "string"
          ? new TextEncoder().encode(rawMessage)
          : rawMessage;

      try {
        const decoder = decoding.createDecoder(message);
        const messageType = decoding.readVarUint(decoder);

        if (messageType === messageSync) {
          const syncType = decoding.readVarUint(decoder);

          if (syncType === syncProtocol.messageYjsSyncStep1) {
            // Client is asking for our state
            const clientStateVector = decoding.readVarUint8Array(decoder);

            // Create doc and load persisted state if available
            const doc = new Y.Doc();
            if (persistence) {
              try {
                await persistence.bindState(docName, doc);
              } catch (error) {
                console.error(`[Yjs] Error loading state for sync:`, error);
              }
            }

            // Send sync step 2 with what they're missing
            const encoder = encoding.createEncoder();
            encoding.writeVarUint(encoder, messageSync);
            syncProtocol.writeSyncStep2(encoder, doc, clientStateVector);
            const response = encoding.toUint8Array(encoder);
            if (response.length > 1) {
              wsContext.sendBinary(Buffer.from(response));
            }
          } else if (
            syncType === syncProtocol.messageYjsSyncStep2 ||
            syncType === syncProtocol.messageYjsUpdate
          ) {
            // Client sending state or update
            const update = decoding.readVarUint8Array(decoder);

            // Persist the update if persistence is configured
            if (persistence) {
              try {
                const doc = new Y.Doc();
                Y.applyUpdate(doc, update);
                await persistence.writeState(docName, doc, update);
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
