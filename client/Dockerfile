FROM oven/bun:1

WORKDIR /app

# Copy package files and install dependencies
COPY package.json bun.lockb* ./
RUN bun install --frozen-lockfile

# Copy source code and public files
COPY . .

# Expose the dev server port
EXPOSE 8080

# Run the Bun dev server
CMD ["bun", "run", "src/server.tsx"]

