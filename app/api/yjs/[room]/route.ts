// Yjs WebSocket-over-HTTP endpoint
// Room name comes from URL path: /api/yjs/:room

import { makeYjsHandler } from "@/app/lib/yjs-ws-handler";
import { createRedisPersistence } from "@/app/lib/yjs-redis-persistence";

const persistence = createRedisPersistence();

const handler = makeYjsHandler({ persistence });

export const POST = handler;
