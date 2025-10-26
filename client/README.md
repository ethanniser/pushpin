# Serverless SSE/WebSockets Demo Client

A modern React-based client demonstrating stateless real-time messaging using Server-Sent Events (SSE) and WebSockets, designed for serverless deployment.

## Features

- 🏠 **Home Page** - Overview and navigation
- 📡 **Stream Page** - Server-Sent Events (SSE) demo with real-time message streaming
- 💬 **Chat Page** - WebSocket-based chat room with multi-user support
- 🎨 **Tailwind CSS** - Modern, responsive UI
- ⚡ **Bun** - Fast development server with hot module reloading

## Tech Stack

- **Bun** - JavaScript runtime and bundler
- **React 18** - UI framework with hooks
- **React Router 6** - Client-side routing
- **Tailwind CSS** - Utility-first styling
- **Pushpin** - Stateless real-time proxy (implementation detail)

## Quick Start

### Local Development

1. **Install Dependencies:**

   ```bash
   bun install
   ```

2. **Run Development Server:**
   ```bash
   bun run dev
   ```

The app will be available at [http://localhost:8080](http://localhost:8080)

### Docker

1. **Build the Docker image:**

   ```bash
   docker build -t sse-ws-demo-client .
   ```

2. **Run the container:**

   ```bash
   docker run -p 8080:8080 -e PUSHPIN_URL=http://localhost:7999 sse-ws-demo-client
   ```

3. **Or use Docker Compose (from project root):**
   ```bash
   docker-compose up client
   ```

### Production Build

For production, use the optimized Dockerfile:

```bash
docker build -f Dockerfile.production -t sse-ws-demo-client:prod .
docker run -p 8080:8080 sse-ws-demo-client:prod
```

Or build with Bun:

```bash
bun run build
```

## Pages

### Stream (SSE Demo)

Navigate to `/stream` to:

- Subscribe to a topic via Server-Sent Events
- Receive real-time streaming messages
- Send test messages that will be broadcast to all subscribers

**How it works:**

1. Enter a topic name (default: "demo-stream")
2. Click "Connect" to establish SSE connection
3. Messages published to that topic will appear in real-time
4. Use "Send Test Message" to publish a message

### Chat (WebSocket Demo)

Navigate to `/chat` to:

- Join a WebSocket-based chat room
- Send and receive messages in real-time
- See when other users join/leave

**How it works:**

1. Enter a username
2. Enter a room name (default: "general")
3. Click "Connect to Chat" to join
4. Send messages that are broadcast to all users in the room

## Project Structure

```
client/
├── public/
│   └── index.html          # HTML entry point
├── src/
│   ├── pages/
│   │   ├── Home.tsx        # Home page
│   │   ├── Stream.tsx      # SSE stream demo
│   │   └── Chat.tsx        # WebSocket chat demo
│   ├── App.tsx             # App component with router
│   ├── main.tsx            # React app entry point
│   ├── server.tsx          # Bun dev server
│   └── styles.css          # Tailwind CSS styles
├── bunfig.toml             # Bun configuration (Tailwind plugin)
├── package.json            # Dependencies
└── tsconfig.json           # TypeScript config
```

## How It Works

### Development Mode

The client uses Bun's fullstack dev server (`Bun.serve`) with:

- **Hot Module Reloading** - Automatic reload on code changes
- **Console Logging** - Browser console logs appear in terminal
- **Source Maps** - Debug with original source code
- **No Build Step** - Instant startup

### HTML Routes

The server imports HTML files and serves them as routes:

```typescript
import homepage from "../public/index.html";

Bun.serve({
  routes: {
    "/": homepage, // Serves index.html with bundled assets
  },
  development: {
    hmr: true, // Hot module reloading
    console: true, // Console log echoing
  },
});
```

### Tailwind CSS

Tailwind is configured via the `bun-plugin-tailwind` plugin in `bunfig.toml`:

```toml
[serve.static]
plugins = ["bun-plugin-tailwind"]
```

This automatically processes Tailwind classes without a build step.

## Production Build

To build for production:

```bash
bun run build
```

This outputs optimized bundles to `dist/`.

## Environment Variables

- `PUSHPIN_URL` - Pushpin server URL (default: `http://localhost:7999`)

## Architecture

The client demonstrates stateless real-time connections suitable for serverless deployment:

```
Client (Browser)
    ↓
    ↓ HTTP/WebSocket
    ↓
Stateless Proxy (Pushpin)
    ↓
    ↓ GRIP Protocol
    ↓
Serverless Origin API
```

### SSE Flow

1. Client connects to `/subscribe/:topic` via SSE
2. Stateless proxy holds the connection using GRIP
3. Origin API (stateless) subscribes to the topic
4. Messages published to the topic are streamed to clients
5. Origin can scale independently without managing connections

### WebSocket Flow

1. Client connects to `/socket` via WebSocket
2. Proxy uses WebSocket-over-HTTP protocol to origin
3. Origin API (stateless) manages chat rooms via pub/sub
4. Messages are published to room channels
5. Proxy broadcasts to all subscribers in the room
6. Origin instances can scale without connection state

## Development Tips

- **Browser DevTools** - Console logs appear both in browser and terminal
- **Hot Reload** - Save files to see changes instantly
- **React DevTools** - Install browser extension for component inspection
- **Network Tab** - Inspect SSE/WebSocket connections

## Troubleshooting

### Port Already in Use

If port 8080 is busy, modify `src/server.tsx`:

```typescript
const server = serve({
  port: 3000, // Change port
  // ...
});
```

### Proxy Not Running

Make sure the proxy server is running on port 7999:

```bash
docker-compose up pushpin
```

### Dependencies Not Installing

Try clearing the Bun cache:

```bash
rm -rf node_modules bun.lockb
bun install
```

## Learn More

- [Bun Documentation](https://bun.sh/docs)
- [GRIP Protocol](https://pushpin.org/docs/protocols/grip/) - Stateless real-time protocol
- [Pushpin Documentation](https://pushpin.org/docs/) - Implementation detail
- [React Documentation](https://react.dev)
- [Tailwind CSS](https://tailwindcss.com)
