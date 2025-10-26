// WebSocket-over-HTTP handler for chat rooms
// This handles the WebSocket connection via Pushpin's WebSocket-over-HTTP protocol

const PUSHPIN_PUBLISH_URL =
  process.env.PUSHPIN_PUBLISH_URL || "http://localhost:5561";

// Parse WebSocket-over-HTTP events from request body
function parseWebSocketEvents(body: string): Array<{ type: string; content?: string }> {
  const events: Array<{ type: string; content?: string }> = [];
  let offset = 0;

  while (offset < body.length) {
    // Find the event type (up to space or \r\n)
    let eventTypeEnd = body.indexOf(" ", offset);
    let lineEnd = body.indexOf("\r\n", offset);

    if (eventTypeEnd === -1 || (lineEnd !== -1 && lineEnd < eventTypeEnd)) {
      // Event without content
      const eventType = body.substring(offset, lineEnd).trim();
      if (eventType) {
        events.push({ type: eventType });
      }
      offset = lineEnd + 2;
      continue;
    }

    const eventType = body.substring(offset, eventTypeEnd);
    offset = eventTypeEnd + 1;

    // Get content length (hex)
    const contentLengthEnd = body.indexOf("\r\n", offset);
    const contentLengthHex = body.substring(offset, contentLengthEnd);
    const contentLength = parseInt(contentLengthHex, 16);
    offset = contentLengthEnd + 2;

    // Get content
    const content = body.substring(offset, offset + contentLength);
    events.push({ type: eventType, content });
    offset = offset + contentLength + 2; // +2 for \r\n
  }

  return events;
}

// Encode WebSocket-over-HTTP events to response body
function encodeWebSocketEvent(type: string, content?: string): string {
  if (!content) {
    return `${type}\r\n`;
  }
  const hexLen = content.length.toString(16).toUpperCase();
  return `TEXT ${hexLen}\r\n${content}\r\n`;
}

// Publish a message to a Pushpin channel
async function publishToChannel(channel: string, message: string) {
  try {
    await fetch(`${PUSHPIN_PUBLISH_URL}/publish/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        items: [
          {
            channel,
            formats: {
              "ws-message": {
                content: message,
              },
            },
          },
        ],
      }),
    });
  } catch (error) {
    console.error(`[Socket] Error publishing to channel ${channel}:`, error);
  }
}

export const GET = async (req: Request): Promise<Response> => {
  const connectionId = req.headers.get("Connection-Id") || "unknown";
  
  console.log(`\n[SOCKET] WebSocket-over-HTTP request`);
  console.log(`  Connection-Id: ${connectionId}`);

  const body = await req.text();
  const events = body ? parseWebSocketEvents(body) : [{ type: "OPEN" }];

  console.log(`  Events:`, events.map(e => e.type).join(", "));

  let responseEvents = "";

  for (const event of events) {
    if (event.type === "OPEN") {
      // Accept the connection and enable GRIP
      console.log(`[Socket] OPEN - accepting connection ${connectionId}`);
      responseEvents += "OPEN\r\n";
      
    } else if (event.type === "TEXT" && event.content) {
      // Parse the message
      console.log(`[Socket] TEXT from ${connectionId}:`, event.content);

      try {
        const data = JSON.parse(event.content);

        if (data.type === "join") {
          // Subscribe to room channel
          const room = data.room || "general";
          const username = data.username || "Anonymous";
          
          console.log(`[Socket] ${username} joining room: ${room}`);
          
          // Send subscription control message
          const subscribeMsg = JSON.stringify({
            type: "subscribe",
            channel: `room:${room}`,
          });
          responseEvents += encodeWebSocketEvent("TEXT", `c:${subscribeMsg}`);

          // Broadcast join message to room
          const joinMessage = JSON.stringify({
            type: "system",
            message: `${username} joined the room`,
          });
          await publishToChannel(`room:${room}`, joinMessage);

          // Send welcome message to user
          const welcomeMsg = JSON.stringify({
            type: "system",
            message: `Welcome to #${room}!`,
          });
          responseEvents += encodeWebSocketEvent("TEXT", welcomeMsg);

        } else if (data.type === "message") {
          // Broadcast message to room
          const room = data.room || "general";
          const username = data.username || "Anonymous";
          const message = data.message;

          console.log(`[Socket] ${username} in ${room}: ${message}`);

          const chatMessage = JSON.stringify({
            type: "message",
            username,
            message,
          });

          await publishToChannel(`room:${room}`, chatMessage);

        } else {
          console.log(`[Socket] Unknown message type:`, data.type);
        }
      } catch (error) {
        console.error(`[Socket] Error parsing message:`, error);
      }

    } else if (event.type === "CLOSE") {
      console.log(`[Socket] CLOSE from ${connectionId}`);
      // Acknowledge the close
      const statusCode = Buffer.from([0x03, 0xE8]); // 1000 = normal closure
      responseEvents += `CLOSE 2\r\n${statusCode.toString()}\r\n`;

    } else if (event.type === "PING") {
      console.log(`[Socket] PING from ${connectionId}`);
      responseEvents += "PONG\r\n";
    }
  }

  return new Response(responseEvents, {
    status: 200,
    headers: {
      "Content-Type": "application/websocket-events",
      "Sec-WebSocket-Extensions": "grip",
    },
  });
};
