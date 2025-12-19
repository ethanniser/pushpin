// WebSocket-over-HTTP handler for Yjs collaborative editing
// Uses @fanoutio/grip for GRIP/Pushpin integration
// Implements y-websocket protocol over WebSocket-over-HTTP

import {
  Publisher,
  WebSocketMessageFormat,
  isWsOverHttp,
  getWebSocketContextFromReq,
  encodeWebSocketEvents,
} from "@fanoutio/grip";
import * as Y from "yjs";
import {
  loadDoc,
  processMessage,
  encodeSyncStep1,
  encodeSyncStep2,
  registerConnection,
  unregisterConnection,
  encodeAwarenessUserDisconnected,
} from "@/app/lib/yjs-redis";

// Initialize GRIP publisher
const publisher = new Publisher({
  control_uri: process.env.PUBLISH_URL || "http://pushpin:5561/",
});

// GRIP channel name for a room
const yjsChannel = (room: string) => `yjs:${room}`;

// Publish a binary message to all subscribers via GRIP
async function publishToRoom(room: string, message: Uint8Array) {
  try {
    // WebSocketMessageFormat can handle binary data
    await publisher.publishFormats(
      yjsChannel(room),
      // Send as binary WebSocket message
      new WebSocketMessageFormat(message)
    );
  } catch (error) {
    console.error(`[Yjs] Error publishing to room ${room}:`, error);
  }
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ room: string }> }
): Promise<Response> {
  const { room } = await params;

  // Verify this is a WebSocket-over-HTTP request
  if (!isWsOverHttp(req)) {
    return new Response("Not a WebSocket-over-HTTP request", { status: 400 });
  }

  // Get the WebSocket context from the request
  const wsContext = await getWebSocketContextFromReq(req);
  const connectionId = req.headers.get("Connection-Id") || "unknown";

  console.log(
    `\n[Yjs] Request for room "${room}" from connection: ${connectionId}`
  );

  // Track awareness client ID for this connection
  let awarenessClientId: number | undefined;

  // Handle connection opening
  if (wsContext.isOpening()) {
    console.log(`[Yjs] Connection opened for room "${room}": ${connectionId}`);
    wsContext.accept();
    wsContext.subscribe(yjsChannel(room));

    // Load the document and send initial sync
    const doc = await loadDoc(room);

    // Send SyncStep1 (our state vector) - client will respond with what they have
    const syncStep1 = encodeSyncStep1(doc);
    wsContext.sendBinary(Buffer.from(syncStep1));

    // Also send SyncStep2 (full state) so client gets current state immediately
    const syncStep2 = encodeSyncStep2(doc);
    wsContext.sendBinary(Buffer.from(syncStep2));

    console.log(`[Yjs] Sent initial sync to ${connectionId}`);

    // Register connection (without awareness ID yet)
    await registerConnection(room, connectionId);
  }

  // Process incoming messages
  while (wsContext.canRecv()) {
    const rawMessage = wsContext.recvRaw();

    // null means CLOSE
    if (rawMessage === null) {
      console.log(
        `[Yjs] Connection closed for room "${room}": ${connectionId}`
      );

      // Get the awareness client ID for this connection
      const connData = await unregisterConnection(room, connectionId);

      // If we had an awareness ID, broadcast that this user disconnected
      if (connData.awarenessClientId) {
        const disconnectMsg = encodeAwarenessUserDisconnected(
          connData.awarenessClientId,
          0 // clock - we use 0 since we don't track it
        );
        await publishToRoom(room, disconnectMsg);
        console.log(
          `[Yjs] Broadcast awareness disconnect for client ${connData.awarenessClientId}`
        );
      }

      wsContext.unsubscribe(yjsChannel(room));
      wsContext.close();
      break;
    }

    // Handle binary messages (Yjs protocol is binary)
    let messageBytes: Uint8Array;
    if (typeof rawMessage === "string") {
      // Shouldn't happen with Yjs, but handle it
      messageBytes = new TextEncoder().encode(rawMessage);
    } else {
      messageBytes = rawMessage;
    }

    try {
      // Load current doc state
      const doc = await loadDoc(room);

      // Process the message
      const result = await processMessage(room, messageBytes, doc);

      // Send response back to this client if needed
      if (result.response) {
        wsContext.sendBinary(Buffer.from(result.response));
      }

      // Broadcast to other clients if needed
      if (result.broadcast) {
        await publishToRoom(room, result.broadcast);
      }

      // Track awareness client ID for cleanup on disconnect
      if (result.awarenessClientId !== undefined) {
        awarenessClientId = result.awarenessClientId;
        await registerConnection(room, connectionId, awarenessClientId);
      }
    } catch (error) {
      console.error(`[Yjs] Error processing message:`, error);
    }
  }

  // Build and return the response
  const events = wsContext.getOutgoingEvents();
  const responseBody = encodeWebSocketEvents(events);

  return new Response(responseBody as unknown as BodyInit, {
    status: 200,
    headers: wsContext.toHeaders(),
  });
}
