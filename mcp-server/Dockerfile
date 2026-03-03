# ── MCP Server ── Node 20 alpine ─────────────────────────────────────────────
FROM node:20-alpine AS builder

# Build tools for native addons (pg)
RUN apk add --no-cache python3 make g++

WORKDIR /app

# Install ALL deps (including devDependencies needed for tsc)
COPY package.json package-lock.json* ./
RUN npm ci

# Copy source and compile TypeScript
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# ── Runtime image ─────────────────────────────────────────────────────────────
FROM node:20-alpine

RUN apk add --no-cache python3 make g++

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm ci --omit=dev

# Copy compiled output from builder
COPY --from=builder /app/dist ./dist

EXPOSE 3002

CMD ["node", "dist/index.js"]
