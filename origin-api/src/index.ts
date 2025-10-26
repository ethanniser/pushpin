import * as socketHandler from "./handlers/socket";
import * as subscribeHandler from "./handlers/subscribe";
import * as publishHandler from "./handlers/publish";

const PORT = process.env.PORT || 3000;

const server = Bun.serve({
  port: PORT,
  routes: {
    // WebSocket-over-HTTP endpoint
    "/socket": socketHandler.GET,

    // Dynamic route for /subscribe/:topic
    "/subscribe/:topic": subscribeHandler.GET,

    // POST handler for /publish/:topic
    "/publish/:topic": {
      POST: publishHandler.POST,
    },
  },

  // Fallback for unmatched routes
  fetch(req) {
    return new Response("Not Found", { status: 404 });
  },
});

console.log(`🚀 Origin API server running on port ${server.port}`);

