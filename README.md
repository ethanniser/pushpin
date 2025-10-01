# Pushpin + S2 Streaming Demo

This project demonstrates a realtime messaging architecture using Pushpin as a reverse proxy with GRIP protocol support and S2 for durable stream storage.

## Architecture

```
Client → Pushpin (port 7999) → Origin API (port 3000)
                ↓                        ↓
         Stats Socket (5560)      S2 Streams (cloud)
                ↓                        ↑
         Pubsub Service ←────────────────┘
                ↓
         ZMQ Publish (5563)
                ↓
            Pushpin
```

## Components

### 1. Origin API (`origin-api/`)

- **Stack**: Bun + TypeScript
- **Endpoints**:
  - `GET /subscribe/:topic` - Returns GRIP hold-stream response to keep connection open
  - `POST /publish/:topic` - Appends message to S2 stream

### 2. Pushpin Proxy (`pushpin/`)

- Official Pushpin reverse proxy
- Routes all traffic to origin API
- Publishes connection stats on ZMQ SUB socket (port 5560)
- Receives publish messages on ZMQ PULL socket (port 5563)

### 3. Pubsub Service (`pubsub-service/`)

- **Stack**: Node.js + TypeScript (tsx) + ZeroMQ
- Listens to Pushpin stats for subscribe/unsubscribe events
- Subscribes to corresponding S2 streams when clients connect
- Forwards S2 messages back to Pushpin via ZMQ publish
- Note: Uses Node.js instead of Bun due to zeromq native module compatibility

### 4. Example Client (`client/`)

- **Stack**: Bun + TypeScript
- Demonstrates subscribing to a topic and publishing messages
- Usage: `bun run index.ts [topic-name]` (defaults to "test-topic")

## Setup

### Prerequisites

- Docker & Docker Compose
- Bun (for origin-api and client)
- Node.js 20+ (for pubsub-service)
- S2 access token and basin

### Configuration

1. Create a `.env` file in the project root:

```bash
S2_AUTH_TOKEN=your_s2_auth_token
S2_BASIN=your_basin_name
```

### Running with Docker Compose

```bash
# Start all services
docker-compose up --build

# In another terminal, run the client
cd client
bun install
bun run index.ts [topic-name]
```

### Running Seperately

```bash
# Terminal 1: Origin API
cd origin-api
bun install
bun run index.ts

# Terminal 2: Pubsub Service
cd pubsub-service
bun install
npx tsx index.ts

# Terminal 3: Pushpin (via Docker)
docker run -p 7999:7999 -p 5560:5560 -p 5563:5563 \
  -v $(pwd)/pushpin/routes:/etc/pushpin/routes \
  fanout/pushpin

# Terminal 4: Client
cd client
bun install
bun run index.ts
```

## How It Works

1. **Client subscribes** to `/subscribe/test-topic` via Pushpin
2. **Origin API** returns GRIP headers telling Pushpin to hold the connection
3. **Pushpin** publishes a "subscribe" event to its stats socket
4. **Pubsub service** receives the stats event and subscribes to S2 stream `test-topic`
5. **Client publishes** messages to `/publish/test-topic`
6. **Origin API** writes the message to S2 stream `test-topic`
7. **Pubsub service** receives the message from S2 and publishes to Pushpin via ZMQ
8. **Pushpin** delivers the message to the subscribed client

## GRIP Protocol

The origin API manually sets GRIP headers without using libraries:

```typescript
{
  "Grip-Hold": "stream",           // Hold connection as stream
  "Grip-Channel": topic,            // Channel name
  "Grip-Keep-Alive": "\\n; format=cstring; timeout=20"  // Keep-alive settings
}
```

## Development

### Install dependencies

```bash
# Origin API and Client (Bun)
cd origin-api && bun install
cd client && bun install

# Pubsub Service (Node.js)
cd pubsub-service && bun install
```

### Testing

The client example demonstrates the full flow - it subscribes to a topic, then publishes 5 messages with 1-second intervals.

Run with a custom topic:

```bash
cd client
bun run index.ts my-custom-topic
```

Or use the default topic:

```bash
cd client
bun run index.ts
```

## Ports

- `7999` - Pushpin HTTP proxy
- `3000` - Origin API
- `5560` - Pushpin stats (ZMQ SUB)
- `5563` - Pushpin publish (ZMQ PULL)

## License

MIT
