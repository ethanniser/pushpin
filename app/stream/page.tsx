"use client";

import { useState, useEffect, useRef } from "react";

interface Message {
  id: string;
  content: string;
  timestamp: string;
  direction: "incoming" | "outgoing";
}

export default function Stream() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [topic, setTopic] = useState("demo-stream");
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);

  const connect = () => {
    // Close existing connection if any
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }

    setMessages([]);
    setError(null);

    try {
      const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL || "";
      console.log(`Subscribing to topic: ${topic}`);
      const eventSource = new EventSource(`${apiBase}/api/subscribe/${topic}`);
      eventSourceRef.current = eventSource;

      eventSource.onopen = () => {
        console.log("EventSource connection opened");
        setIsConnected(true);
        setError(null);
      };

      eventSource.onmessage = (event) => {
        console.log("Received message:", event.data);
        if (event.data.trim()) {
          const message: Message = {
            id: Date.now().toString() + Math.random(),
            content: event.data.trim(),
            timestamp: new Date().toLocaleTimeString(),
            direction: "incoming",
          };
          setMessages((prev) => [...prev, message]);
        }
      };

      eventSource.onerror = (err) => {
        console.error("EventSource error:", err);
        setError("Connection failed or closed");
        setIsConnected(false);
        eventSource.close();
      };
    } catch (err) {
      console.error("EventSource error:", err);
      setError(err instanceof Error ? err.message : "Connection failed");
      setIsConnected(false);
    }
  };

  const disconnect = () => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
    setIsConnected(false);
  };

  const requestMessage = async () => {
    try {
      const content = `Request message at ${new Date().toLocaleTimeString()}`;

      // Add outgoing message to UI
      const outgoingMessage: Message = {
        id: Date.now().toString() + Math.random(),
        content,
        timestamp: new Date().toLocaleTimeString(),
        direction: "outgoing",
      };
      setMessages((prev) => [...prev, outgoingMessage]);

      // Publish to the topic
      const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL || "";
      await fetch(`${apiBase}/api/publish/${topic}`, {
        method: "POST",
        headers: { "Content-Type": "text/plain" },
        body: content,
      });
    } catch (err) {
      console.error("Publish error:", err);
      setError("Failed to send message");
    }
  };

  useEffect(() => {
    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }
    };
  }, []);

  return (
    <div className="max-w-4xl mx-auto">
      <div className="bg-white rounded-lg shadow-md p-6">
        <h1 className="text-3xl font-bold text-gray-800 mb-2">
          📡 Server-Sent Events Stream
        </h1>
        <p className="text-gray-600 mb-6">
          Subscribe to a topic and receive real-time messages via HTTP
          streaming.
        </p>

        {/* Controls */}
        <div className="space-y-4 mb-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Topic Name
            </label>
            <input
              type="text"
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              disabled={isConnected}
              className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-100"
              placeholder="Enter topic name"
            />
          </div>

          <div className="flex gap-3">
            {!isConnected ? (
              <button
                onClick={connect}
                className="flex-1 bg-blue-500 hover:bg-blue-600 text-white font-medium py-2 px-6 rounded-md transition-colors"
              >
                Connect
              </button>
            ) : (
              <>
                <button
                  onClick={disconnect}
                  className="bg-red-500 hover:bg-red-600 text-white font-medium py-2 px-6 rounded-md transition-colors"
                >
                  Disconnect
                </button>
                <button
                  onClick={requestMessage}
                  className="flex-1 bg-green-500 hover:bg-green-600 text-white font-medium py-2 px-6 rounded-md transition-colors"
                >
                  Request Message
                </button>
              </>
            )}
          </div>
        </div>

        {/* Status */}
        <div className="mb-4">
          {isConnected && (
            <div className="flex items-center gap-2 text-green-600 font-medium">
              <span className="w-2 h-2 bg-green-600 rounded-full animate-pulse"></span>
              Connected to {topic}
            </div>
          )}
          {error && <div className="text-red-600 font-medium">❌ {error}</div>}
        </div>

        {/* Messages */}
        <div className="border border-gray-200 rounded-lg">
          <div className="bg-gray-50 px-4 py-2 border-b border-gray-200">
            <h2 className="font-semibold text-gray-700">
              Messages ({messages.length})
            </h2>
          </div>
          <div className="h-96 overflow-y-auto p-4 space-y-2">
            {messages.length === 0 ? (
              <div className="text-center text-gray-500 py-8">
                No messages yet. Connect to start receiving messages.
              </div>
            ) : (
              messages.map((msg) => (
                <div
                  key={msg.id}
                  className={`flex items-start gap-3 p-3 rounded ${
                    msg.direction === "outgoing"
                      ? "bg-green-50 border border-green-200"
                      : "bg-blue-50 border border-blue-200"
                  }`}
                >
                  <div
                    className={`flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                      msg.direction === "outgoing"
                        ? "bg-green-500 text-white"
                        : "bg-blue-500 text-white"
                    }`}
                  >
                    {msg.direction === "outgoing" ? "↑" : "↓"}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span
                        className={`text-xs font-semibold ${
                          msg.direction === "outgoing"
                            ? "text-green-700"
                            : "text-blue-700"
                        }`}
                      >
                        {msg.direction === "outgoing" ? "SENT" : "RECEIVED"}
                      </span>
                      <span
                        className={`text-xs ${
                          msg.direction === "outgoing"
                            ? "text-green-600"
                            : "text-blue-600"
                        }`}
                      >
                        {msg.timestamp}
                      </span>
                    </div>
                    <div className="text-gray-800 break-words font-mono text-sm">
                      {msg.content}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
