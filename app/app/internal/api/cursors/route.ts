// WebSocket-over-HTTP handler for live cursors (v2)
// Uses @fanoutio/grip's WebSocketContext abstraction

import {
  Publisher,
  WebSocketMessageFormat,
  isWsOverHttp,
  getWebSocketContextFromReq,
  encodeWebSocketEvents,
} from "@fanoutio/grip";

// Initialize GRIP publisher
const publisher = new Publisher({
  control_uri: process.env.GRIP_URL || "http://pushpin:5561/",
});

const CURSOR_CHANNEL = "cursors:global";

// Publish a message to the cursor channel via GRIP
async function publishToCursors(message: string) {
  try {
    await publisher.publishFormats(
      CURSOR_CHANNEL,
      new WebSocketMessageFormat(message),
    );
  } catch (error) {
    console.error(`[Cursors-v2] Error publishing to channel:`, error);
  }
}

export async function GET(req: Request): Promise<Response> {
  // Verify this is a WebSocket-over-HTTP request
  if (!isWsOverHttp(req)) {
    return new Response("Not a WebSocket-over-HTTP request", { status: 400 });
  }

  // Get the WebSocket context from the request
  const wsContext = await getWebSocketContextFromReq(req);
  const connectionId = req.headers.get("Connection-Id") || "unknown";

  console.log(`\n[Cursors-v2] Request from connection: ${connectionId}`);

  // Handle connection opening
  if (wsContext.isOpening()) {
    console.log(`[Cursors-v2] Connection opened: ${connectionId}`);
    wsContext.accept();
    wsContext.subscribe(CURSOR_CHANNEL);
  }

  // Process incoming messages
  while (wsContext.canRecv()) {
    const message = wsContext.recv();

    // null means CLOSE
    if (message === null) {
      console.log(`[Cursors-v2] Connection closed: ${connectionId}`);
      wsContext.unsubscribe(CURSOR_CHANNEL);
      wsContext.close();
      break;
    }

    // Handle text messages
    try {
      const data = JSON.parse(message);

      if (data.type === "cursor-update") {
        console.log(
          `[Cursors-v2] Update from ${data.id}: ${data.positions.length} positions`,
        );
        await publishToCursors(message);
      } else if (data.type === "cursor-join") {
        console.log(`[Cursors-v2] ${data.id} joined`);
        await publishToCursors(message);
      } else {
        console.log(`[Cursors-v2] Unknown message type:`, data.type);
      }
    } catch (error) {
      console.error(`[Cursors-v2] Error parsing message:`, error);
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
