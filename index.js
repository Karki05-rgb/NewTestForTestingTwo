// index.js

const express = require('express');
const http = require('http');
const WebSocket = require('ws');

const app = express();

// Only minimal HTTP routes; do NOT define GET handlers for /ws/cam1 or /ws/cam2,
// so that the upgrade event can fire for those paths.
app.get('/', (req, res) => {
  res.status(200).send('WebSocket binary image relay running');
});

// Optional health check
app.get('/ping', (req, res) => {
  res.status(200).send('pong');
});

const server = http.createServer(app);
// Create WebSocket.Server but let us handle upgrade manually
const wss = new WebSocket.Server({ noServer: true });

// Map of path (like "/ws/cam1") to a Set of WebSocket clients
const rooms = new Map();

// Handle upgrade for any path
server.on('upgrade', (request, socket, head) => {
  const { url } = request;
  console.log(`[Relay] Upgrade request for: ${url}`);
  // Accept all WebSocket upgrade requests; path-based logic in connection handler
  wss.handleUpgrade(request, socket, head, (ws) => {
    wss.emit('connection', ws, request);
  });
});

wss.on('connection', (ws, request) => {
  const path = request.url; // e.g. "/ws/cam1" or "/ws/cam2"
  console.log(`[Relay] New WebSocket connection on path: ${path}`);

  if (!rooms.has(path)) {
    rooms.set(path, new Set());
  }
  const clients = rooms.get(path);
  clients.add(ws);
  console.log(`[Relay] Client connected on ${path}. Count: ${clients.size}`);

  ws.on('message', (data, isBinary) => {
    // Forward binary data to other clients in same room
    for (const client of clients) {
      if (client !== ws && client.readyState === WebSocket.OPEN) {
        client.send(data, { binary: isBinary });
      }
    }
  });

  ws.on('close', () => {
    clients.delete(ws);
    console.log(`[Relay] Client disconnected from ${path}. Remaining: ${clients.size}`);
    if (clients.size === 0) {
      rooms.delete(path);
      console.log(`[Relay] No more clients on ${path}, room deleted.`);
    }
  });

  ws.on('error', (err) => {
    console.warn(`[Relay] Error on ${path}:`, err);
  });
});

// Start server
const PORT = process.env.PORT;
if (!PORT) {
  throw new Error("PORT environment variable is not set");
}
server.listen(PORT, () => {
  console.log(`Binary image WebSocket relay listening on port ${PORT}`);
});

