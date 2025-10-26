# Pushpin Demo Application

A full-stack real-time messaging application demonstrating Pushpin's capabilities with Server-Sent Events (SSE) and WebSockets.

## Architecture

```
┌─────────────────┐
│  Client (Bun)   │  React app with SSE & WebSocket support
│  Port: 8080     │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Pushpin Proxy  │  Real-time reverse proxy with GRIP support
│  Port: 7999     │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Origin API     │  Handles subscriptions and WebSocket-over-HTTP
│  Port: 3000     │
└─────────────────┘
         │
         ▼
┌─────────────────┐
│ Pubsub Service  │  Bridges S2 streams to Pushpin channels
└─────────────────┘
```

## Quick Start

### Using Docker Compose (Recommended)

1. **Create a `.env` file:**

   ```bash
   S2_AUTH_TOKEN=your-token-here
   S2_BASIN=your-basin-name
   ```

2. **Start all services:**

   ```bash
   docker-compose up --build
   ```

3. **Access the application:**

   - Client UI: http://localhost:8080
   - Pushpin Proxy: http://localhost:7999
   - Origin API: http://localhost:3000

4. **Try the demos:**
   - Navigate to http://localhost:8080/stream for SSE streaming
   - Navigate to http://localhost:8080/chat for WebSocket chat

### Local Development

Each service can be run independently:

**Client:**

```bash
cd client
bun install
bun run dev
```

**Origin API:**

```bash
cd origin-api
bun install
bun run src/index.ts
```

**Pushpin:**

```bash
docker-compose up pushpin
```

## Services

### 1. Client (Port 8080)

- React-based UI with Tailwind CSS
- SSE streaming demo page
- WebSocket chat room demo
- Built with Bun's fullstack dev server

**Tech:** Bun, React, React Router, Tailwind CSS

### 2. Pushpin (Port 7999)

- Reverse proxy with real-time capabilities
- GRIP protocol support
- WebSocket-over-HTTP protocol
- Message routing and pub/sub

**Tech:** C++, ZeroMQ

### 3. Origin API (Port 3000)

- Handles subscription requests
- WebSocket-over-HTTP endpoint
- Chat room management
- Message publishing

**Tech:** Bun, TypeScript

### 4. Pubsub Service

- Listens to Pushpin stats
- Subscribes to S2 streams
- Forwards messages to Pushpin channels

**Tech:** Bun, TypeScript, ZeroMQ

## Features

### Server-Sent Events (SSE)

- Subscribe to topics via HTTP streaming
- Real-time message delivery
- Automatic reconnection
- Keep-alive support

### WebSocket Chat

- Multi-user chat rooms
- Real-time message broadcasting
- Join/leave notifications
- WebSocket-over-HTTP protocol

## Docker Commands

**Build and start:**

```bash
docker-compose up --build
```

**Start in detached mode:**

```bash
docker-compose up -d
```

**View logs:**

```bash
docker-compose logs -f
docker-compose logs -f client
```

**Stop services:**

```bash
docker-compose down
```

**Rebuild a specific service:**

```bash
docker-compose build client
docker-compose up client
```

**Start only specific services:**

```bash
# Start just client and its dependencies
docker-compose up client

# Start without pubsub service
docker-compose up pushpin origin-api client
```

## Project Structure

```
pushpin/
├── client/              # React frontend
│   ├── src/
│   │   ├── pages/       # Route pages (Home, Stream, Chat)
│   │   ├── App.tsx      # Main app with router
│   │   ├── main.tsx     # React entry point
│   │   ├── server.tsx   # Bun dev server
│   │   └── styles.css   # Tailwind styles
│   ├── public/
│   │   └── index.html   # HTML entry point
│   ├── Dockerfile
│   └── Dockerfile.production
├── origin-api/          # Backend API
│   ├── src/
│   │   ├── handlers/    # Route handlers
│   │   │   ├── socket.ts      # WebSocket-over-HTTP handler
│   │   │   ├── subscribe.ts   # SSE subscription handler
│   │   │   └── publish.ts     # Message publishing
│   │   └── index.ts     # Server entry point
│   └── Dockerfile
├── pushpin/             # Pushpin config
│   ├── pushpin.conf
│   ├── routes
│   └── Dockerfile
├── pubsub-service/      # S2 bridge
│   ├── index.ts
│   └── Dockerfile
└── docker-compose.yml
```

## API Endpoints

### Client (8080)

- `GET /` - Home page
- `GET /stream` - SSE demo page
- `GET /chat` - WebSocket chat page

### Pushpin (7999)

- `GET /subscribe/:topic` - Subscribe to SSE stream
- `WS /socket` - WebSocket connection
- `POST /publish/:topic` - Publish message to topic

### Origin API (3000)

- `GET /subscribe/:topic` - Handle subscription (GRIP)
- `GET /socket` - WebSocket-over-HTTP handler
- `POST /publish/:topic` - Publish to S2 stream

## How It Works

### SSE Flow

1. Client connects to `/subscribe/:topic` on Pushpin
2. Pushpin forwards to Origin API with GRIP headers
3. Origin API responds with `Grip-Hold: stream` header
4. Pushpin holds connection and subscribes to channel
5. Messages published to channel are streamed to client

### WebSocket Flow

1. Client connects to `/socket` WebSocket on Pushpin
2. Pushpin uses WebSocket-over-HTTP to Origin API
3. Origin API manages chat rooms and subscriptions
4. Messages are published to room channels via Pushpin API
5. Pushpin broadcasts to all subscribers in the room

## Development

### Hot Reloading

The client supports hot module reloading in development:

```bash
cd client
bun run dev
```

Changes to React components will automatically reload in the browser.

### Testing SSE

```bash
# Subscribe to a topic
curl http://localhost:7999/subscribe/test-topic

# Publish a message (in another terminal)
curl -X POST http://localhost:7999/publish/test-topic \
  -H "Content-Type: text/plain" \
  -d "Hello from SSE!"
```

### Testing WebSocket

Open multiple browser windows at http://localhost:8080/chat and chat between them!

### Docker Development

To rebuild and test a specific service:

```bash
# Rebuild client
docker-compose build client

# View client logs
docker-compose logs -f client

# Restart client only
docker-compose restart client
```

## Production

### Production Docker Build

For production, use the optimized multi-stage Dockerfile:

```bash
cd client
docker build -f Dockerfile.production -t pushpin-client:prod .
docker run -p 8080:8080 -e PUSHPIN_URL=http://pushpin:7999 pushpin-client:prod
```

### Environment Variables

Create a `.env` file:

```bash
# Required: S2 StreamStore credentials
S2_AUTH_TOKEN=your-token-here
S2_BASIN=your-basin-name

# Optional: Service URLs
PUSHPIN_URL=http://localhost:7999
PORT=3000

# Optional: Pushpin ZMQ endpoints
PUSHPIN_STATS_URI=tcp://localhost:5564
PUSHPIN_PUBLISH_URI=tcp://localhost:5560
```

## Ports

| Service         | Port | Description          |
| --------------- | ---- | -------------------- |
| Client          | 8080 | React UI dev server  |
| Pushpin         | 7999 | HTTP/WebSocket proxy |
| Origin API      | 3000 | Backend API          |
| Pushpin Publish | 5560 | ZMQ PULL socket      |
| Pushpin Command | 5563 | ZMQ REP socket       |
| Pushpin Stats   | 5564 | ZMQ PUB socket       |

## Troubleshooting

### Port Already in Use

If a port is already in use, modify the port mapping in `docker-compose.yml`:

```yaml
services:
  client:
    ports:
      - "3001:8080" # Map host port 3001 to container port 8080
```

### Dependencies Not Installing

Clear caches and reinstall:

```bash
# Bun projects
rm -rf node_modules bun.lockb
bun install

# Docker
docker-compose down -v
docker-compose build --no-cache
```

### Client Can't Connect to Pushpin

Make sure Pushpin is running and accessible. If running locally:

```bash
export PUSHPIN_URL=http://localhost:7999
```

If running in Docker, the client needs to use the Docker network:

```bash
export PUSHPIN_URL=http://pushpin:7999
```

## Learn More

- [Pushpin Documentation](https://pushpin.org/docs/)
- [GRIP Protocol](https://pushpin.org/docs/protocols/grip/)
- [WebSocket-over-HTTP Protocol](https://pushpin.org/docs/protocols/websocket-over-http/)
- [Bun Documentation](https://bun.sh/docs)
- [React Router](https://reactrouter.com/)
- [Tailwind CSS](https://tailwindcss.com)

## License

MIT
