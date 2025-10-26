import { serve } from "bun";
import homepage from "../public/index.html";

const PUSHPIN_URL = process.env.PUSHPIN_URL || "http://localhost:7999";

const server = serve({
  port: 8080,
  routes: {
    // Frontend route
    "/": homepage,
  },

  // Enable development mode for hot reloading
  development: {
    hmr: true,
    console: true,
  },

  // Fallback for unmatched routes
  fetch(req) {
    return new Response("Not Found", { status: 404 });
  },
});

console.log(`🚀 Client dev server running on ${server.url}`);
console.log(`📡 Using Pushpin at ${PUSHPIN_URL}`);
