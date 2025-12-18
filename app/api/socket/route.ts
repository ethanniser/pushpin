// WebSocket-over-HTTP handler for chat rooms (v2)
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
  control_uri: process.env.PUBLISH_URL || "http://pushpin:5561/",
});

// Publish a message to a Pushpin channel via GRIP
async function publishToChannel(channel: string, message: string) {
  try {
    await publisher.publishFormats(
      channel,
      new WebSocketMessageFormat(message)
    );
  } catch (error) {
    console.error(`[Socket-v2] Error publishing to channel ${channel}:`, error);
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

  console.log(`\n[Socket-v2] Request from connection: ${connectionId}`);

  // Handle connection opening
  if (wsContext.isOpening()) {
    console.log(`[Socket-v2] Connection opened: ${connectionId}`);
    wsContext.accept();
  }

  // Process incoming messages
  while (wsContext.canRecv()) {
    const message = wsContext.recv();

    // null means CLOSE
    if (message === null) {
      const username = wsContext.meta?.["User"];
      const room = wsContext.meta?.["Room"];

      if (username && room) {
        console.log(`[Socket-v2] ${username} leaving room: ${room}`);
        wsContext.unsubscribe(`room:${room}`);

        await publishToChannel(
          `room:${room}`,
          JSON.stringify({
            type: "system",
            message: `${username} has left the room`,
          })
        );
      }

      wsContext.close();
      break;
    }

    // Handle text messages
    try {
      const data = JSON.parse(message);

      if (data.type === "join") {
        const room = data.room || "general";
        const username = data.username || "Anonymous";

        console.log(`[Socket-v2] ${username} joining room: ${room}`);

        // Set meta for connection state
        wsContext.meta = wsContext.meta || {};
        wsContext.meta["User"] = username;
        wsContext.meta["Room"] = room;

        // Subscribe to room channel
        wsContext.subscribe(`room:${room}`);

        // Broadcast join message to room
        await publishToChannel(
          `room:${room}`,
          JSON.stringify({
            type: "system",
            message: `${username} joined the room`,
          })
        );

        // Send welcome message to user
        wsContext.send(
          JSON.stringify({
            type: "system",
            message: `Welcome to #${room}!`,
          })
        );
      } else if (data.type === "message") {
        const room = wsContext.meta?.["Room"] || data.room || "general";
        const username =
          wsContext.meta?.["User"] || data.username || "Anonymous";
        const messageText = data.message;

        console.log(`[Socket-v2] ${username} in ${room}: ${messageText}`);

        await publishToChannel(
          `room:${room}`,
          JSON.stringify({
            type: "message",
            username,
            message: messageText,
          })
        );
      } else {
        console.log(`[Socket-v2] Unknown message type:`, data.type);
      }
    } catch (error) {
      console.error(`[Socket-v2] Error parsing message:`, error);
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
