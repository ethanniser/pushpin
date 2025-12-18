"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Cursor } from "@/app/components/Cursor";
import { CurrentCursor } from "@/app/components/CurrentCursor";
import { generateUsername, type CursorMessage } from "@/app/utils/cursor-utils";

type CursorData = {
  id: string;
  x: number;
  y: number;
  lastSeen: number;
};

const BATCHING_TIME = 500; // Batch cursor updates every 500ms

export default function Cursors() {
  const [otherCursors, setOtherCursors] = useState<Record<string, CursorData>>(
    {}
  );
  const [isConnected, setIsConnected] = useState(false);
  const [myId] = useState(() => generateUsername());

  const wsRef = useRef<WebSocket | null>(null);
  const pendingPositions = useRef<{ x: number; y: number; t: number }[]>([]);
  const batchStartTime = useRef<number>(0);
  const hasJoined = useRef(false);

  // Connect to WebSocket
  useEffect(() => {
    const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL || "";
    const ws = new WebSocket(`${apiBase}/api/cursors`);
    wsRef.current = ws;

    ws.onopen = () => {
      console.log("[Cursors] Connected to WebSocket");
      setIsConnected(true);

      // Send join message
      if (!hasJoined.current) {
        ws.send(
          JSON.stringify({
            type: "cursor-join",
            id: myId,
          })
        );
        hasJoined.current = true;
      }
    };

    ws.onmessage = (event) => {
      try {
        const data: CursorMessage = JSON.parse(event.data);

        if (data.type === "cursor-update") {
          // Ignore our own updates
          if (data.id === myId || data.positions.length === 0) return;

          // Replay the cursor movement with animation
          const startTime = performance.now();
          const totalDuration = data.positions[data.positions.length - 1].t;

          const animate = (currentTime: number) => {
            const elapsed = currentTime - startTime;

            // Find the position we should be at
            let targetIndex = 0;
            for (let i = 0; i < data.positions.length; i++) {
              if (data.positions[i].t <= elapsed) {
                targetIndex = i;
              } else {
                break;
              }
            }

            const pos = data.positions[targetIndex];
            setOtherCursors((prev) => ({
              ...prev,
              [data.id]: {
                id: data.id,
                x: pos.x,
                y: pos.y,
                lastSeen: Date.now(),
              },
            }));

            // Continue animating if we haven't reached the end
            if (elapsed < totalDuration) {
              requestAnimationFrame(animate);
            }
          };

          requestAnimationFrame(animate);
        } else if (data.type === "cursor-join") {
          console.log(`[Cursors] ${data.id} joined`);
        } else if (data.type === "cursor-leave") {
          console.log(`[Cursors] ${data.id} left`);
          setOtherCursors((prev) => {
            const updated = { ...prev };
            delete updated[data.id];
            return updated;
          });
        }
      } catch (error) {
        console.error("[Cursors] Error parsing message:", error);
      }
    };

    ws.onerror = (error) => {
      console.error("[Cursors] WebSocket error:", error);
    };

    ws.onclose = () => {
      console.log("[Cursors] Disconnected from WebSocket");
      setIsConnected(false);
    };

    return () => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(
          JSON.stringify({
            type: "cursor-leave",
            id: myId,
          })
        );
      }
      ws.close();
    };
  }, [myId]);

  // Batch and send cursor updates
  useEffect(() => {
    const interval = setInterval(() => {
      if (
        pendingPositions.current.length === 0 ||
        !wsRef.current ||
        wsRef.current.readyState !== WebSocket.OPEN
      ) {
        return;
      }

      wsRef.current.send(
        JSON.stringify({
          type: "cursor-update",
          id: myId,
          positions: pendingPositions.current,
        })
      );

      pendingPositions.current = [];
      batchStartTime.current = 0;
    }, BATCHING_TIME);

    return () => clearInterval(interval);
  }, [myId]);

  // Clean up stale cursors every 5 seconds
  useEffect(() => {
    const cleanup = setInterval(() => {
      const now = Date.now();
      setOtherCursors((prev) => {
        const updated = { ...prev };
        for (const id in updated) {
          // Remove cursors that haven't been seen in 10 seconds
          if (now - updated[id].lastSeen > 10000) {
            delete updated[id];
          }
        }
        return updated;
      });
    }, 5000);

    return () => clearInterval(cleanup);
  }, []);

  const handleMouseMove = (e: React.MouseEvent) => {
    const now = Date.now();

    if (batchStartTime.current === 0) {
      batchStartTime.current = now;
    }

    const offset = now - batchStartTime.current;
    pendingPositions.current.push({ x: e.clientX, y: e.clientY, t: offset });
  };

  return (
    <div
      className="relative h-screen w-screen cursor-none overflow-hidden bg-gradient-to-br from-slate-50 to-slate-100"
      onMouseMove={handleMouseMove}
    >
      {/* Header */}
      <div className="absolute left-0 right-0 top-0 z-10 border-b border-slate-200 bg-white/80 p-4 backdrop-blur-sm">
        <div className="mx-auto flex max-w-7xl items-center justify-between">
          <div className="flex items-center gap-4">
            <Link
              href="/"
              className="cursor-pointer rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
            >
              ← Back
            </Link>
            <h1 className="text-xl font-bold text-slate-900">Live Cursors</h1>
            <div
              className={`flex items-center gap-2 rounded-full px-3 py-1 text-sm ${
                isConnected
                  ? "bg-green-100 text-green-700"
                  : "bg-red-100 text-red-700"
              }`}
            >
              <div
                className={`h-2 w-2 rounded-full ${
                  isConnected ? "bg-green-500" : "bg-red-500"
                }`}
              />
              {isConnected ? "Connected" : "Disconnected"}
            </div>
          </div>
          <div className="text-sm text-slate-600">
            You are:{" "}
            <span className="font-semibold text-slate-900">@{myId}</span>
          </div>
        </div>
      </div>

      {/* Instructions */}
      <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 cursor-default text-center">
        <div className="rounded-2xl border border-slate-200 bg-white/90 p-8 shadow-xl backdrop-blur-sm">
          <h2 className="mb-2 text-2xl font-bold text-slate-900">
            Move your mouse around!
          </h2>
          <p className="text-slate-600">
            Open this page in another tab or browser to see live cursors in
            action.
          </p>
          <div className="mt-4 text-sm text-slate-500">
            {Object.keys(otherCursors).length > 0 ? (
              <>
                👥 {Object.keys(otherCursors).length} other{" "}
                {Object.keys(otherCursors).length === 1 ? "person" : "people"}{" "}
                online
              </>
            ) : (
              "No other users online yet"
            )}
          </div>
        </div>
      </div>

      {/* Render other cursors */}
      {Object.values(otherCursors).map((cursor) => (
        <Cursor key={cursor.id} id={cursor.id} x={cursor.x} y={cursor.y} />
      ))}

      {/* Render current user's cursor */}
      <CurrentCursor id={myId} />
    </div>
  );
}
