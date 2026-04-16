# ─────────────────────────────────────────────────
# Stage 1: build the React frontend
# ─────────────────────────────────────────────────
FROM node:20-alpine AS web-builder

WORKDIR /build/web
COPY web/package*.json ./
RUN npm ci

COPY web/ ./
RUN npm run build

# ─────────────────────────────────────────────────
# Stage 2: install server production deps
# ─────────────────────────────────────────────────
FROM node:20-alpine AS server-builder

WORKDIR /build/server
COPY server/package*.json ./

# better-sqlite3 needs a native build
RUN apk add --no-cache python3 make g++ \
 && npm ci --omit=dev

# ─────────────────────────────────────────────────
# Stage 3: lean runtime image
# ─────────────────────────────────────────────────
FROM node:20-alpine AS runtime

# Non-root user for security
RUN addgroup -S daily && adduser -S daily -G daily

WORKDIR /app

# Copy server source + prod node_modules
COPY --from=server-builder /build/server/node_modules ./server/node_modules
COPY server/src ./server/src
COPY server/package.json ./server/

# Copy built frontend into the location the server will serve it from
COPY --from=web-builder /build/web/dist ./web/dist

# Data volume mountpoint
RUN mkdir -p /data && chown daily:daily /data

USER daily

ENV NODE_ENV=production \
    PORT=8080 \
    DB_PATH=/data/daily.db

EXPOSE 8080

# Health check — Coolify picks this up automatically
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://localhost:8080/api/me || exit 1

WORKDIR /app/server
CMD ["node", "src/index.js"]
