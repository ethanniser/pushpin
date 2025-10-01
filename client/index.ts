const PUSHPIN_URL = process.env.PUSHPIN_URL || "http://localhost:7999";
// Get topic from command line args, env var, or default
const TOPIC = process.argv[2] || process.env.TOPIC || "test-topic";

async function subscribe(topic: string) {
  console.log(`\n📡 Subscribing to topic: ${topic}`);

  const response = await fetch(`${PUSHPIN_URL}/subscribe/${topic}`);

  if (!response.ok) {
    console.error(`❌ Subscribe failed: ${response.statusText}`);
    return;
  }

  // Read the streaming response
  const reader = response.body?.getReader();
  if (!reader) {
    console.error("❌ No response body");
    return;
  }

  console.log("✅ Connected! Waiting for messages...\n");

  const decoder = new TextDecoder();
  try {
    while (true) {
      const { done, value } = await reader.read();

      if (done) {
        console.log("🔌 Connection closed");
        break;
      }

      const chunk = decoder.decode(value, { stream: true });
      if (chunk.trim()) {
        console.log(`📨 Received: ${chunk.trim()}`);
      }
    }
  } catch (error) {
    console.error("❌ Error reading stream:", error);
  } finally {
    reader.releaseLock();
  }
}

async function publish(topic: string, message: string) {
  console.log(`📤 Publishing to topic: ${topic}, message: ${message}`);

  const response = await fetch(`${PUSHPIN_URL}/publish/${topic}`, {
    method: "POST",
    headers: {
      "Content-Type": "text/plain",
    },
    body: message,
  });

  const result = await response.json();
  console.log(`✅ Published:`, result);
}

// Main demo
async function main() {
  console.log("🚀 Pushpin + S2 Client Demo");
  console.log(`Using Pushpin at: ${PUSHPIN_URL}`);
  console.log(`Topic: ${TOPIC}`);
  console.log(`Usage: bun run index.ts [topic-name]\n`);

  // Start subscription in background
  const subscriptionPromise = subscribe(TOPIC);

  // Wait a bit for subscription to establish
  await new Promise((resolve) => setTimeout(resolve, 2000));

  // Publish a few messages
  console.log("\n--- Publishing Messages ---");

  for (let i = 1; i <= 5; i++) {
    await publish(TOPIC, `Message ${i} at ${new Date().toISOString()}`);
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }

  console.log("\n--- Waiting for messages (10 seconds) ---");

  // Wait a bit more to receive messages
  await new Promise((resolve) => setTimeout(resolve, 10000));

  console.log("\n✅ Demo complete!");
  process.exit(0);
}

main().catch(console.error);
