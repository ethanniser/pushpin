import { useState, useEffect, useRef } from "react";

const PUSHPIN_URL = "http://localhost:7999";

interface Message {
  id: string;
  content: string;
  timestamp: string;
}

export function Stream() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [topic, setTopic] = useState("demo-stream");
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const readerRef = useRef<ReadableStreamDefaultReader<Uint8Array> | null>(
    null
  );

  const connect = async () => {
    // Close existing connection if any
    if (readerRef.current) {
      readerRef.current.cancel();
      readerRef.current = null;
    }

    setMessages([]);
    setError(null);
    setIsConnected(true);

    try {
      console.log(`Subscribing to topic: ${topic}`);
      const response = await fetch(`${PUSHPIN_URL}/subscribe/${topic}`);

      if (!response.ok) {
        throw new Error(`Subscribe failed: ${response.statusText}`);
      }

      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error("No response body");
      }

      readerRef.current = reader;
      const decoder = new TextDecoder();

      // Read stream
      while (true) {
        const { done, value } = await reader.read();

        if (done) {
          console.log("Stream closed");
          setIsConnected(false);
          break;
        }

        const chunk = decoder.decode(value, { stream: true });
        if (chunk.trim()) {
          const message: Message = {
            id: Date.now().toString(),
            content: chunk.trim(),
            timestamp: new Date().toLocaleTimeString(),
          };
          setMessages((prev) => [...prev, message]);
        }
      }
    } catch (err) {
      console.error("Stream error:", err);
      setError(err instanceof Error ? err.message : "Connection failed");
      setIsConnected(false);
    }
  };

  const disconnect = () => {
    if (readerRef.current) {
      readerRef.current.cancel();
      readerRef.current = null;
    }
    setIsConnected(false);
  };

  const sendTestMessage = async () => {
    try {
      const message = `Test message at ${new Date().toLocaleTimeString()}`;
      await fetch(`${PUSHPIN_URL}/publish/${topic}`, {
        method: "POST",
        headers: { "Content-Type": "text/plain" },
        body: message,
      });
    } catch (err) {
      console.error("Publish error:", err);
    }
  };

  useEffect(() => {
    return () => {
      if (readerRef.current) {
        readerRef.current.cancel();
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
                  className="flex-1 bg-red-500 hover:bg-red-600 text-white font-medium py-2 px-6 rounded-md transition-colors"
                >
                  Disconnect
                </button>
                <button
                  onClick={sendTestMessage}
                  className="flex-1 bg-green-500 hover:bg-green-600 text-white font-medium py-2 px-6 rounded-md transition-colors"
                >
                  Send Test Message
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
                  className="bg-blue-50 border border-blue-200 rounded p-3"
                >
                  <div className="text-xs text-blue-600 font-medium mb-1">
                    {msg.timestamp}
                  </div>
                  <div className="text-gray-800">{msg.content}</div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
