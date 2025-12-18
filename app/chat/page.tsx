"use client";

import { useState, useEffect, useRef } from "react";

interface ChatMessage {
  id: string;
  username: string;
  message: string;
  timestamp: string;
  isOwn: boolean;
}

export default function Chat() {
  const [username, setUsername] = useState("");
  const [room, setRoom] = useState("general");
  const [message, setMessage] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const connect = () => {
    if (!username.trim()) {
      setError("Please enter a username");
      return;
    }

    setError(null);

    try {
      const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL || "";
      const ws = new WebSocket(`${apiBase}/api/socket`);
      wsRef.current = ws;

      ws.onopen = () => {
        console.log("WebSocket connected");
        setIsConnected(true);

        // Send join message
        ws.send(
          JSON.stringify({
            type: "join",
            room,
            username: username.trim(),
          })
        );
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);

          if (data.type === "message") {
            const chatMessage: ChatMessage = {
              id: Date.now().toString() + Math.random(),
              username: data.username,
              message: data.message,
              timestamp: new Date().toLocaleTimeString(),
              isOwn: data.username === username.trim(),
            };
            setMessages((prev) => [...prev, chatMessage]);
          } else if (data.type === "system") {
            const systemMessage: ChatMessage = {
              id: Date.now().toString() + Math.random(),
              username: "System",
              message: data.message,
              timestamp: new Date().toLocaleTimeString(),
              isOwn: false,
            };
            setMessages((prev) => [...prev, systemMessage]);
          }
        } catch (err) {
          console.error("Failed to parse message:", err);
        }
      };

      ws.onerror = (event) => {
        console.error("WebSocket error:", event);
        setError("Connection error");
      };

      ws.onclose = (event) => {
        console.log("WebSocket closed", event.code, event.reason);
        setIsConnected(false);
        wsRef.current = null;
      };
    } catch (err) {
      console.error("Connection failed:", err);
      setError(err instanceof Error ? err.message : "Connection failed");
    }
  };

  const disconnect = () => {
    if (wsRef.current) {
      wsRef.current.close(1000, "User disconnected");
      wsRef.current = null;
    }
    setIsConnected(false);
  };

  const sendMessage = (e: React.FormEvent) => {
    e.preventDefault();

    if (!wsRef.current || !message.trim()) {
      return;
    }

    try {
      wsRef.current.send(
        JSON.stringify({
          type: "message",
          room,
          username: username.trim(),
          message: message.trim(),
        })
      );
      setMessage("");
    } catch (err) {
      console.error("Failed to send message:", err);
      setError("Failed to send message");
    }
  };

  useEffect(() => {
    return () => {
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, []);

  return (
    <div className="max-w-4xl mx-auto">
      <div className="bg-white rounded-lg shadow-md overflow-hidden">
        <div className="bg-gradient-to-r from-green-500 to-green-600 p-6">
          <h1 className="text-3xl font-bold text-white mb-2">
            💬 WebSocket Chat Room
          </h1>
          <p className="text-green-100">
            Real-time bidirectional chat using stateless WebSocket connections
          </p>
        </div>

        <div className="p-6">
          {/* Connection Form */}
          {!isConnected ? (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Username
                </label>
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-green-500 focus:border-transparent"
                  placeholder="Enter your username"
                  onKeyPress={(e) => e.key === "Enter" && connect()}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Room
                </label>
                <input
                  type="text"
                  value={room}
                  onChange={(e) => setRoom(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-green-500 focus:border-transparent"
                  placeholder="Enter room name"
                  onKeyPress={(e) => e.key === "Enter" && connect()}
                />
              </div>

              <button
                onClick={connect}
                className="w-full bg-green-500 hover:bg-green-600 text-white font-medium py-3 px-6 rounded-md transition-colors"
              >
                Connect to Chat
              </button>

              {error && (
                <div className="p-3 bg-red-50 border border-red-200 rounded text-red-600">
                  ❌ {error}
                </div>
              )}
            </div>
          ) : (
            <>
              {/* Chat Status */}
              <div className="mb-4 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 bg-green-600 rounded-full animate-pulse"></span>
                  <span className="text-green-600 font-medium">
                    Connected as {username} in #{room}
                  </span>
                </div>
                <button
                  onClick={disconnect}
                  className="text-red-500 hover:text-red-600 font-medium text-sm"
                >
                  Disconnect
                </button>
              </div>

              {/* Messages */}
              <div className="border border-gray-200 rounded-lg mb-4">
                <div className="h-96 overflow-y-auto p-4 space-y-3 bg-gray-50">
                  {messages.length === 0 ? (
                    <div className="text-center text-gray-500 py-8">
                      No messages yet. Start chatting!
                    </div>
                  ) : (
                    messages.map((msg) => (
                      <div
                        key={msg.id}
                        className={`flex ${
                          msg.isOwn ? "justify-end" : "justify-start"
                        }`}
                      >
                        <div
                          className={`max-w-sm rounded-lg px-4 py-2 ${
                            msg.username === "System"
                              ? "bg-gray-200 text-gray-600 text-center w-full"
                              : msg.isOwn
                              ? "bg-green-500 text-white"
                              : "bg-white border border-gray-300 text-gray-800"
                          }`}
                        >
                          <div className="text-xs font-semibold mb-1 opacity-75">
                            {msg.username} • {msg.timestamp}
                          </div>
                          <div>{msg.message}</div>
                        </div>
                      </div>
                    ))
                  )}
                  <div ref={messagesEndRef} />
                </div>
              </div>

              {/* Message Input */}
              <form onSubmit={sendMessage} className="flex gap-2">
                <input
                  type="text"
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  className="flex-1 px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-green-500 focus:border-transparent"
                  placeholder="Type a message..."
                />
                <button
                  type="submit"
                  className="bg-green-500 hover:bg-green-600 text-white font-medium px-6 py-2 rounded-md transition-colors"
                >
                  Send
                </button>
              </form>

              {error && (
                <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded text-red-600">
                  ❌ {error}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
