"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import * as Y from "yjs";
import { WebsocketProvider } from "y-websocket";
import { generateUsername, getUserColor } from "@/app/utils/cursor-utils";

type AwarenessState = {
  user: {
    name: string;
    color: string;
  };
  cursor?: {
    index: number;
  };
};

export default function YjsEditor() {
  const [status, setStatus] = useState<"connecting" | "connected" | "disconnected">("disconnected");
  const [text, setText] = useState("");
  const [users, setUsers] = useState<Map<number, AwarenessState>>(new Map());
  const [myId] = useState(() => generateUsername());
  const [roomName, setRoomName] = useState("default");
  const [isJoined, setIsJoined] = useState(false);

  const docRef = useRef<Y.Doc | null>(null);
  const providerRef = useRef<WebsocketProvider | null>(null);
  const yTextRef = useRef<Y.Text | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const isLocalChange = useRef(false);

  const joinRoom = useCallback(() => {
    if (!roomName.trim()) return;

    // Clean up existing provider
    if (providerRef.current) {
      providerRef.current.destroy();
    }

    // Create new Y.Doc
    const doc = new Y.Doc();
    docRef.current = doc;

    // Get the shared text type
    const yText = doc.getText("content");
    yTextRef.current = yText;

    // Create provider using standard y-websocket
    // URL format: ws://host/api/yjs/{room}
    // y-websocket constructs: serverUrl + "/" + roomname
    const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL || "";
    const wsUrl = apiBase.replace(/^http/, "ws") + "/api/yjs";

    const provider = new WebsocketProvider(wsUrl, roomName, doc);
    providerRef.current = provider;

    // Set awareness state
    const myColor = getUserColor(myId);
    provider.awareness.setLocalState({
      user: {
        name: myId,
        color: myColor,
      },
    } as AwarenessState);

    // Listen to connection status
    provider.on("status", (event: { status: string }) => {
      setStatus(event.status as "connecting" | "connected" | "disconnected");
    });

    // Listen to awareness changes
    const updateUsers = () => {
      const states = new Map<number, AwarenessState>();
      provider.awareness.getStates().forEach((state, clientId) => {
        if (state && (state as AwarenessState).user) {
          states.set(clientId, state as AwarenessState);
        }
      });
      setUsers(states);
    };
    provider.awareness.on("change", updateUsers);
    updateUsers();

    // Listen to text changes
    const updateText = () => {
      if (!isLocalChange.current) {
        setText(yText.toString());
      }
    };
    yText.observe(updateText);
    updateText();

    setIsJoined(true);
  }, [roomName, myId]);

  // Handle local text input
  const handleTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    if (!yTextRef.current || !docRef.current) return;

    const newValue = e.target.value;
    const yText = yTextRef.current;

    // Mark as local change to prevent feedback loop
    isLocalChange.current = true;

    // Simple diff: delete all and insert new
    // In production, you'd want a proper diff algorithm
    docRef.current.transact(() => {
      yText.delete(0, yText.length);
      yText.insert(0, newValue);
    });

    setText(newValue);
    isLocalChange.current = false;

    // Update cursor position in awareness
    if (providerRef.current) {
      const selectionStart = e.target.selectionStart;
      providerRef.current.awareness.setLocalStateField("cursor", {
        index: selectionStart,
      });
    }
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (providerRef.current) {
        providerRef.current.destroy();
      }
    };
  }, []);

  // Filter out self from users list
  const otherUsers = Array.from(users.entries()).filter(
    ([clientId]) => clientId !== docRef.current?.clientID
  );

  if (!isJoined) {
    return (
      <div className="flex h-[calc(100vh-4rem)] w-screen flex-col items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100">
        <div className="rounded-2xl border border-slate-200 bg-white p-8 shadow-xl">
          <h1 className="mb-6 text-2xl font-bold text-slate-900">
            Join a Collaborative Document
          </h1>
          <div className="space-y-4">
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">
                Room Name
              </label>
              <input
                type="text"
                value={roomName}
                onChange={(e) => setRoomName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && joinRoom()}
                placeholder="Enter room name..."
                className="w-full rounded-lg border border-slate-300 px-4 py-2 text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
              />
            </div>
            <div className="text-sm text-slate-500">
              You&apos;ll join as:{" "}
              <span className="font-semibold text-slate-900">@{myId}</span>
            </div>
            <button
              onClick={joinRoom}
              className="w-full rounded-lg bg-blue-600 px-4 py-2 font-medium text-white transition hover:bg-blue-700"
            >
              Join Room
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-[calc(100vh-4rem)] w-screen flex-col bg-gradient-to-br from-slate-50 to-slate-100">
      {/* Header */}
      <div className="border-b border-slate-200 bg-white/80 p-4 backdrop-blur-sm">
        <div className="flex w-full items-center justify-between">
          <div className="flex items-center gap-4 px-6">
            <h1 className="text-xl font-bold text-slate-900">
              Collaborative Editor
            </h1>
            <div className="rounded-full bg-slate-100 px-3 py-1 text-sm text-slate-600">
              Room: <span className="font-semibold">{roomName}</span>
            </div>
            <div
              className={`flex items-center gap-2 rounded-full px-3 py-1 text-sm ${
                status === "connected"
                  ? "bg-green-100 text-green-700"
                  : status === "connecting"
                    ? "bg-yellow-100 text-yellow-700"
                    : "bg-red-100 text-red-700"
              }`}
            >
              <div
                className={`h-2 w-2 rounded-full ${
                  status === "connected"
                    ? "bg-green-500"
                    : status === "connecting"
                      ? "bg-yellow-500"
                      : "bg-red-500"
                }`}
              />
              {status === "connected"
                ? "Connected"
                : status === "connecting"
                  ? "Connecting..."
                  : "Disconnected"}
            </div>
          </div>
          <div className="flex items-center gap-4 px-6">
            {/* Online users */}
            <div className="flex items-center gap-2">
              <span className="text-sm text-slate-600">Online:</span>
              <div className="flex -space-x-2">
                {/* Current user */}
                <div
                  className="flex h-8 w-8 items-center justify-center rounded-full border-2 border-white text-xs font-bold text-white"
                  style={{ backgroundColor: getUserColor(myId) }}
                  title={`You (@${myId})`}
                >
                  {myId.slice(0, 2).toUpperCase()}
                </div>
                {/* Other users */}
                {otherUsers.map(([clientId, state]) => (
                  <div
                    key={clientId}
                    className="flex h-8 w-8 items-center justify-center rounded-full border-2 border-white text-xs font-bold text-white"
                    style={{ backgroundColor: state.user.color }}
                    title={state.user.name}
                  >
                    {state.user.name.slice(0, 2).toUpperCase()}
                  </div>
                ))}
              </div>
            </div>
            <button
              onClick={() => {
                if (providerRef.current) {
                  providerRef.current.destroy();
                }
                setIsJoined(false);
                setText("");
              }}
              className="rounded-lg border border-slate-300 px-3 py-1 text-sm text-slate-600 transition hover:bg-slate-100"
            >
              Leave Room
            </button>
          </div>
        </div>
      </div>

      {/* Editor */}
      <div className="flex-1 p-6">
        <div className="mx-auto h-full max-w-4xl">
          <textarea
            ref={textareaRef}
            value={text}
            onChange={handleTextChange}
            placeholder="Start typing... Changes sync in real-time with other users."
            className="h-full w-full resize-none rounded-xl border border-slate-200 bg-white p-6 text-lg text-slate-900 shadow-lg focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
            style={{ fontFamily: "ui-monospace, monospace" }}
          />
        </div>
      </div>

      {/* Footer */}
      <div className="border-t border-slate-200 bg-white/80 px-6 py-3 backdrop-blur-sm">
        <div className="flex items-center justify-between text-sm text-slate-500">
          <div>
            {text.length} characters • {text.split(/\s+/).filter(Boolean).length}{" "}
            words
          </div>
          <div>
            Powered by{" "}
            <a
              href="https://yjs.dev"
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-600 hover:underline"
            >
              Yjs
            </a>{" "}
            +{" "}
            <a
              href="https://pushpin.org"
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-600 hover:underline"
            >
              Pushpin
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
