import { Subscriber, Push } from "zeromq";
import { S2 } from "@s2-dev/streamstore";
import { EventStream } from "@s2-dev/streamstore/lib/event-streams.js";
import { ReadAcceptEnum } from "@s2-dev/streamstore/sdk/records.js";
import type { ReadEvent } from "@s2-dev/streamstore/models/components";

const PUSHPIN_STATS_URI =
  process.env.PUSHPIN_STATS_URI || "tcp://localhost:5560";
const PUSHPIN_PUBLISH_URI =
  process.env.PUSHPIN_PUBLISH_URI || "tcp://localhost:5563";

// Track active subscriptions: topic -> S2 stream subscription
const activeSubscriptions = new Map<string, AbortController>();

// Initialize S2 client
const s2 = new S2({
  accessToken: process.env.S2_AUTH_TOKEN!,
});
const basin = process.env.S2_BASIN!;

// ZMQ subscriber for Pushpin stats
const statsSocket = new Subscriber();
statsSocket.connect(PUSHPIN_STATS_URI);
statsSocket.subscribe(); // Subscribe to all messages

// ZMQ PUSH socket for sending messages to Pushpin's PULL socket
const publishSocket = new Push();
publishSocket.connect(PUSHPIN_PUBLISH_URI);

console.log(`📊 Connected to Pushpin stats at ${PUSHPIN_STATS_URI}`);
console.log(`📤 Connected to Pushpin publish at ${PUSHPIN_PUBLISH_URI}`);

// Subscribe to S2 stream and forward messages to Pushpin
async function subscribeToS2Stream(topic: string) {
  if (activeSubscriptions.has(topic)) {
    console.log(`[S2] Already subscribed to stream: ${topic}`);
    return;
  }

  console.log(`[S2] Subscribing to stream: ${topic}`);

  const abortController = new AbortController();
  activeSubscriptions.set(topic, abortController);

  try {
    try {
      const readResponse = await s2.records.read(
        {
          s2Basin: basin,
          stream: `v1/${topic}`,
        },
        {
          signal: abortController.signal,
          acceptHeaderOverride: ReadAcceptEnum.textEventStream,
        }
      );

      // Process the events
      for await (const event of readResponse as EventStream<ReadEvent>) {
        if (abortController.signal.aborted) {
          console.log(`[S2] Subscription aborted for: ${topic}`);
          return;
        }

        if (event.event === "batch") {
          // Forward each record to Pushpin with "J" prefix
          // Records contain JSON objects formatted for Pushpin by the publishers
          for (const record of event.data.records) {
            const message = record.body;

            if (message) {
              console.log(`[S2→Pushpin] Topic: ${topic}, Message: ${message}`);

              // Send to Pushpin via ZMQ PULL socket
              // Add "J" prefix to indicate JSON format
              const pushpinMessage = "J" + message;
              await publishSocket.send(pushpinMessage);
            }
          }
        }
      }

      // Short delay before polling again
      await new Promise((resolve) => setTimeout(resolve, 100));
    } catch (readError) {
      console.error(`[S2] Error reading stream ${topic}:`, readError);
      // Wait a bit longer on error before retrying
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  } catch (error) {
    console.error(`[S2] Error subscribing to stream ${topic}:`, error);
    activeSubscriptions.delete(topic);
  }
}

// Unsubscribe from S2 stream
function unsubscribeFromS2Stream(topic: string) {
  const controller = activeSubscriptions.get(topic);
  if (controller) {
    console.log(`[S2] Unsubscribing from stream: ${topic}`);
    controller.abort();
    activeSubscriptions.delete(topic);
  }
}

// Listen to Pushpin stats
async function listenToStats() {
  console.log("👂 Listening for Pushpin stats events...");

  for await (const frames of statsSocket) {
    try {
      if (frames.length === 1) {
        // Single frame format: "<type> J<json>"
        const data = frames[0]!.toString();
        const spaceIndex = data.indexOf(" ");

        if (spaceIndex > 0) {
          const messageType = data.substring(0, spaceIndex);
          // Skip the "J" marker and parse the JSON
          const jsonData = data.substring(spaceIndex + 2); // +2 to skip " J"
          const payload = JSON.parse(jsonData);

          // console.log(`[Stats] ${messageType}:`, payload);

          // Handle subscription events
          if (messageType === "sub") {
            const channel = payload.channel;
            console.log(`[Stats] ✅ New subscription: ${channel}`);
            subscribeToS2Stream(channel);
          } else if (messageType === "unsub") {
            const channel = payload.channel;
            console.log(`[Stats] ❌ Unsubscribe: ${channel}`);
            unsubscribeFromS2Stream(channel);
          }
        }
      }
    } catch (error) {
      console.error("[Stats] Error processing message:", error);
    }
  }
}

// Start the service
listenToStats();

console.log("🚀 Pubsub service started");
