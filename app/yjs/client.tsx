"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import * as Y from "yjs";
import { WebsocketProvider } from "y-websocket";
import { generateUsername, getUserColor } from "@/app/utils/cursor-utils";
import Quill from "quill";
import { QuillBinding } from "y-quill";

type AwarenessState = {
  user: {
    name: string;
    color: string;
  };
  cursor?: {
    anchor: unknown;
    head: unknown;
  };
};

export default function YjsEditor() {
  const [status, setStatus] = useState<
    "connecting" | "connected" | "disconnected"
  >("disconnected");
  const [users, setUsers] = useState<Map<number, AwarenessState>>(new Map());
  const [myId] = useState(() => generateUsername());
  const [roomName, setRoomName] = useState("default");
  const [isJoined, setIsJoined] = useState(false);
  const [quillLoaded, setQuillLoaded] = useState(false);

  const docRef = useRef<Y.Doc | null>(null);
  const providerRef = useRef<WebsocketProvider | null>(null);
  const quillRef = useRef<Quill | null>(null);
  const bindingRef = useRef<QuillBinding | null>(null);
  const editorContainerRef = useRef<HTMLDivElement>(null);

  // Load Quill client-side only
  useEffect(() => {
    const loadQuill = async () => {
      // Dynamically import Quill and its dependencies
      const QuillModule = (await import("quill")).default;
      const QuillCursors = (await import("quill-cursors")).default;

      // Register cursors module
      QuillModule.register("modules/cursors", QuillCursors);

      setQuillLoaded(true);
    };

    loadQuill();
  }, []);

  const joinRoom = useCallback(() => {
    if (!roomName.trim() || !quillLoaded) return;
    setIsJoined(true);
  }, [roomName, quillLoaded]);

  // Initialize Quill after joining (when the container is mounted)
  useEffect(() => {
    if (!isJoined || !quillLoaded || !editorContainerRef.current) return;

    let cancelled = false;

    const initEditor = async () => {
      // Clean up existing provider and binding
      if (bindingRef.current) {
        bindingRef.current.destroy();
        bindingRef.current = null;
      }
      if (providerRef.current) {
        providerRef.current.destroy();
        providerRef.current = null;
      }
      if (quillRef.current) {
        quillRef.current = null;
      }

      if (cancelled || !editorContainerRef.current) return;

      // Clear the editor container
      editorContainerRef.current.innerHTML = "";

      if (cancelled || !editorContainerRef.current) return;

      // Create new Y.Doc
      const doc = new Y.Doc();
      docRef.current = doc;

      // Get the shared text type
      const yText = doc.getText("quill");

      // Create Quill editor
      const editor = new Quill(editorContainerRef.current, {
        modules: {
          cursors: true,
          toolbar: [
            [{ header: [1, 2, 3, false] }],
            ["bold", "italic", "underline", "strike"],
            [{ list: "ordered" }, { list: "bullet" }],
            ["blockquote", "code-block"],
            ["link"],
            ["clean"],
          ],
          history: {
            userOnly: true,
          },
        },
        placeholder: "Start collaborating...",
        theme: "snow",
      });
      quillRef.current = editor;

      // Create provider using standard y-websocket
      const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL || "";
      const wsUrl = apiBase.replace(/^http/, "ws") + "/api/yjs";

      const provider = new WebsocketProvider(wsUrl, roomName, doc);
      providerRef.current = provider;

      // Set awareness state with user info
      const myColor = getUserColor(myId);
      provider.awareness.setLocalStateField("user", {
        name: myId,
        color: myColor,
      });

      // Create binding between Y.Text and Quill
      const binding = new QuillBinding(yText, editor, provider.awareness);
      bindingRef.current = binding;

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
    };

    initEditor();

    return () => {
      cancelled = true;
    };
  }, [isJoined, quillLoaded, roomName, myId]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (bindingRef.current) {
        bindingRef.current.destroy();
      }
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
      <div className="flex h-[calc(100vh-4rem)] w-screen flex-col items-center justify-center bg-linear-to-br from-slate-50 to-slate-100">
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
              disabled={!quillLoaded}
              className="w-full rounded-lg bg-blue-600 px-4 py-2 font-medium text-white transition hover:bg-blue-700 disabled:bg-gray-400"
            >
              {quillLoaded ? "Join Room" : "Loading editor..."}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-[calc(100vh-4rem)] w-screen flex-col bg-linear-to-br from-slate-50 to-slate-100">
      {/* Quill CSS */}
      <link
        rel="stylesheet"
        href="https://cdn.jsdelivr.net/npm/quill@1.3.7/dist/quill.snow.css"
      />
      <style>{`
        .ql-container {
          font-size: 16px;
          font-family: ui-sans-serif, system-ui, sans-serif;
        }
        .ql-editor {
          min-height: 300px;
        }
        /* Remote cursor styles */
        .ql-cursor-caret-container {
          position: absolute;
          height: 100%;
        }
        .ql-cursor-caret {
          position: absolute;
          height: 100%;
          width: 2px;
        }
        .ql-cursor-flag {
          position: absolute;
          top: -1.5em;
          left: 0;
          padding: 2px 6px;
          border-radius: 3px;
          font-size: 12px;
          white-space: nowrap;
          color: white;
        }
        .ql-cursor-selection {
          position: absolute;
          opacity: 0.3;
        }
      `}</style>

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
                if (bindingRef.current) {
                  bindingRef.current.destroy();
                  bindingRef.current = null;
                }
                if (providerRef.current) {
                  providerRef.current.destroy();
                  providerRef.current = null;
                }
                setIsJoined(false);
              }}
              className="rounded-lg border border-slate-300 px-3 py-1 text-sm text-slate-600 transition hover:bg-slate-100"
            >
              Leave Room
            </button>
          </div>
        </div>
      </div>

      {/* Editor */}
      <div className="flex-1 overflow-auto p-6">
        <div className="mx-auto h-full max-w-4xl">
          <div className="rounded-xl border border-slate-200 bg-white shadow-lg overflow-hidden">
            <div ref={editorContainerRef} />
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="border-t border-slate-200 bg-white/80 px-6 py-3 backdrop-blur-sm">
        <div className="flex items-center justify-between text-sm text-slate-500">
          <div>Rich text collaborative editing with real-time cursors</div>
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
              href="https://quilljs.com"
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-600 hover:underline"
            >
              Quill
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
