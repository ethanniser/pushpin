// Yjs WebSocket-over-HTTP endpoint
// Room name comes from URL path: /api/yjs/:room

import { makeYjsHandler } from "@/app/lib/yjs-ws-handler";

const handler = makeYjsHandler();

export const POST = handler;
