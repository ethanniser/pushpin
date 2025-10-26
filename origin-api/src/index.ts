import * as socketHandler from "./handlers/socket";
import * as subscribeHandler from "./handlers/subscribe";
import * as publishHandler from "./handlers/publish";

const PORT = process.env.PORT || 3000;

// CORS preflight handler
const handleOptions = () => {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "*",
      "Access-Control-Max-Age": "86400",
    },
  });
};

const server = Bun.serve({
  port: PORT,
  routes: {
    // WebSocket-over-HTTP endpoint
    "/socket": socketHandler.GET,

    // Dynamic route for /subscribe/:topic
    "/subscribe/:topic": {
      GET: subscribeHandler.GET,
      OPTIONS: handleOptions,
    },

    // POST handler for /publish/:topic
    "/publish/:topic": {
      POST: publishHandler.POST,
      OPTIONS: handleOptions,
    },
  },

  // Fallback for unmatched routes
  fetch(req) {
    // Handle OPTIONS for any route
    if (req.method === "OPTIONS") {
      return handleOptions();
    }
    return new Response("Not Found", { status: 404 });
  },
});

console.log(`🚀 Origin API server running on port ${server.port}`);

