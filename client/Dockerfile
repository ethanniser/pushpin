FROM oven/bun:1

WORKDIR /app

# Copy package files and install dependencies
COPY package.json bun.lockb* ./
RUN bun install --frozen-lockfile

# Copy source code
COPY . .

# Expose the Vite dev server port
EXPOSE 8080

# Run the Vite dev server
CMD ["bun", "run", "dev"]

