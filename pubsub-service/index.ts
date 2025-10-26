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
// Track subscriber counts: topic -> number of active subscribers
const subscriberCounts = new Map<string, number>();

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
  // Increment subscriber count
  const currentCount = subscriberCounts.get(topic) || 0;
  subscriberCounts.set(topic, currentCount + 1);
  
  if (activeSubscriptions.has(topic)) {
    console.log(`[S2] Already subscribed to stream: ${topic} (subscribers: ${currentCount + 1})`);
    return;
  }

  console.log(`[S2] Subscribing to stream: ${topic} (subscribers: 1)`);

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
      // AbortError is expected when we intentionally unsubscribe
      if (readError instanceof Error && readError.name === 'AbortError') {
        console.log(`[S2] Stream subscription gracefully closed: ${topic}`);
        return;
      }
      console.error(`[S2] Error reading stream ${topic}:`, readError);
      // Wait a bit longer on error before retrying
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  } catch (error) {
    console.error(`[S2] Error subscribing to stream ${topic}:`, error);
    activeSubscriptions.delete(topic);
    // Decrement subscriber count on error
    const currentCount = subscriberCounts.get(topic) || 0;
    if (currentCount > 0) {
      subscriberCounts.set(topic, currentCount - 1);
      if (currentCount - 1 === 0) {
        subscriberCounts.delete(topic);
      }
    }
  }
}

// Unsubscribe from S2 stream
function unsubscribeFromS2Stream(topic: string) {
  // Decrement subscriber count
  const currentCount = subscriberCounts.get(topic) || 0;
  if (currentCount <= 0) {
    console.log(`[S2] Warning: Unsubscribe called but no subscribers for: ${topic}`);
    return;
  }
  
  const newCount = currentCount - 1;
  subscriberCounts.set(topic, newCount);
  
  console.log(`[S2] Unsubscribe from ${topic} (remaining subscribers: ${newCount})`);
  
  // Only unsubscribe from S2 when no subscribers remain
  if (newCount === 0) {
    const controller = activeSubscriptions.get(topic);
    if (controller) {
      console.log(`[S2] No more subscribers, unsubscribing from S2 stream: ${topic}`);
      controller.abort();
      activeSubscriptions.delete(topic);
      subscriberCounts.delete(topic);
    }
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
            
            // Check if this is an unsubscribe (unavailable: true)
            if (payload.unavailable === true) {
              console.log(`[Stats] ❌ Unsubscribe: ${channel}`);
              unsubscribeFromS2Stream(channel);
            } else {
              console.log(`[Stats] ✅ New subscription: ${channel}`);
              subscribeToS2Stream(channel);
            }
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
