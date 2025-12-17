FROM oven/bun:1 AS base

WORKDIR /app

# Install dependencies
COPY package.json bun.lock* ./
RUN bun install --frozen-lockfile

# Copy app source
COPY . .

# Build the app
RUN bun run build

# Production stage
FROM oven/bun:1-slim AS runner
WORKDIR /app

ENV NODE_ENV=production

# Copy the build output
COPY --from=base /app/.next ./.next
COPY --from=base /app/node_modules ./node_modules
COPY --from=base /app/package.json ./package.json
COPY --from=base /app/public ./public

EXPOSE 3000

CMD ["bun", "run", "start"]


