# Laska real-time server: HTTP API + WebSocket, native-TS on Node 22.
# Build context is the Laska/ repo root because the server imports the shared
# rules engine from ../../../src — both src/ and server/ must be in the image.
FROM node:22-alpine

WORKDIR /app

# Shared, dependency-free rules engine (server imports it as TS source).
COPY src ./src

# Server package + source.
COPY server ./server
WORKDIR /app/server
RUN npm install --omit=dev

# Durable SQLite lives on a mounted volume so data survives redeploys.
# (Set LASKA_DB_PATH=/data/laska.db and mount a volume at /data on the host.)
ENV PORT=8080 \
    LASKA_DB=sqlite \
    LASKA_DB_PATH=/data/laska.db
EXPOSE 8080

CMD ["node", "--experimental-transform-types", "src/index.ts"]
