export function Home() {
  return (
    <div className="max-w-4xl mx-auto">
      <div className="bg-white rounded-lg shadow-md p-8">
        <h1 className="text-4xl font-bold text-gray-800 mb-4">
          Serverless SSE/WebSockets Demo
        </h1>
        <p className="text-lg text-gray-600 mb-6">
          A demonstration of stateless real-time messaging using Server-Sent
          Events (SSE) and WebSockets, designed for serverless deployment.
        </p>

        <div className="grid md:grid-cols-2 gap-6 mt-8">
          <div className="border border-gray-200 rounded-lg p-6">
            <div className="text-3xl mb-3">📡</div>
            <h2 className="text-xl font-semibold text-gray-800 mb-2">
              Server-Sent Events
            </h2>
            <p className="text-gray-600 mb-4">
              Stream real-time data from the server using HTTP streaming.
              Perfect for one-way data flows like notifications and live
              updates.
            </p>
            <a
              href="/stream"
              className="inline-block bg-blue-500 hover:bg-blue-600 text-white font-medium py-2 px-4 rounded transition-colors"
            >
              Try Stream →
            </a>
          </div>

          <div className="border border-gray-200 rounded-lg p-6">
            <div className="text-3xl mb-3">💬</div>
            <h2 className="text-xl font-semibold text-gray-800 mb-2">
              WebSocket Chat
            </h2>
            <p className="text-gray-600 mb-4">
              Real-time bidirectional communication using WebSockets. Join a
              chat room and send messages to other connected users.
            </p>
            <a
              href="/chat"
              className="inline-block bg-green-500 hover:bg-green-600 text-white font-medium py-2 px-4 rounded transition-colors"
            >
              Try Chat →
            </a>
          </div>
        </div>

        <div className="mt-8 p-4 bg-blue-50 border border-blue-200 rounded-lg">
          <h3 className="font-semibold text-blue-900 mb-2">🔧 Tech Stack</h3>
          <ul className="text-sm text-blue-800 space-y-1">
            <li>
              • <strong>Bun</strong> - Fast all-in-one JavaScript runtime
            </li>
            <li>
              • <strong>React</strong> - UI framework with hooks
            </li>
            <li>
              • <strong>React Router</strong> - Client-side routing
            </li>
            <li>
              • <strong>Tailwind CSS</strong> - Utility-first styling
            </li>
            <li>
              • <strong>Pushpin</strong> - Stateless real-time proxy
              (implementation detail)
            </li>
          </ul>
        </div>
      </div>
    </div>
  );
}
