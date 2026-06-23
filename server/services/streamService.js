import { logger } from '../utils/logger.js';

// Map: auctionId -> Set of client response objects
const auctionRooms = new Map();

// Map: auctionId -> Set of unique client identifiers (e.g. session-id or IP-port string)
const auctionViewers = new Map();

// Set of active observability dashboard response objects
const observabilityClients = new Set();

/**
 * Register a client to receive real-time logs and system performance metrics.
 * @param {object} res - Express Response object.
 */
export function addObservabilityClient(res) {
  observabilityClients.add(res);
  logger.info(`Observability dashboard connected. Active dashboards: ${observabilityClients.size}`);

  res.on('close', () => {
    observabilityClients.delete(res);
    logger.info(`Observability dashboard disconnected. Active dashboards: ${observabilityClients.size}`);
  });
}

/**
 * Broadcasts a system log entry to all connected observability dashboards.
 * @param {object} logEntry 
 */
export function broadcastLog(logEntry) {
  const payload = `data: ${JSON.stringify({ type: 'log', log: logEntry })}\n\n`;
  for (const client of observabilityClients) {
    try {
      client.write(payload);
    } catch (err) {
      // Stream failed or was closed silently
    }
  }
}

/**
 * Broadcasts system hardware and request metrics to connected dashboards.
 * @param {object} metrics 
 */
export function broadcastMetrics(metrics) {
  const payload = `data: ${JSON.stringify({ type: 'metrics', metrics })}\n\n`;
  for (const client of observabilityClients) {
    try {
      client.write(payload);
    } catch (err) {
      // Ignore write errors
    }
  }
}

/**
 * Register a client to a specific auction room for live bidding, timers, and viewers count.
 * @param {string} auctionId 
 * @param {string} clientKey - Unique key representing the viewer session.
 * @param {object} res - Express Response object.
 */
export function addAuctionClient(auctionId, clientKey, res) {
  if (!auctionRooms.has(auctionId)) {
    auctionRooms.set(auctionId, new Set());
  }
  auctionRooms.get(auctionId).add(res);

  if (!auctionViewers.has(auctionId)) {
    auctionViewers.set(auctionId, new Set());
  }
  auctionViewers.get(auctionId).add(clientKey);

  // Send initial message and current viewer count
  res.write(`data: ${JSON.stringify({ type: 'welcome', message: `Connected to room: ${auctionId}` })}\n\n`);
  
  // Broadcast updated viewer count to all clients in the room
  broadcastToAuction(auctionId, {
    type: 'viewer_count',
    count: auctionViewers.get(auctionId).size
  });

  logger.info(`User joined room [${auctionId}]. Room size: ${auctionRooms.get(auctionId).size}, Viewers: ${auctionViewers.get(auctionId).size}`);

  res.on('close', () => {
    // Clean up room connection
    const room = auctionRooms.get(auctionId);
    if (room) {
      room.delete(res);
      if (room.size === 0) {
        auctionRooms.delete(auctionId);
      }
    }

    // Clean up viewer key
    const viewers = auctionViewers.get(auctionId);
    if (viewers) {
      viewers.delete(clientKey);
      broadcastToAuction(auctionId, {
        type: 'viewer_count',
        count: viewers.size
      });
      if (viewers.size === 0) {
        auctionViewers.delete(auctionId);
      }
    }

    logger.info(`User left room [${auctionId}].`);
  });
}

/**
 * Sends a message payload to all clients in a specific auction room.
 * @param {string} auctionId 
 * @param {object} payload 
 */
export function broadcastToAuction(auctionId, payload) {
  const formattedMsg = `data: ${JSON.stringify(payload)}\n\n`;
  const room = auctionRooms.get(auctionId);
  if (room) {
    for (const client of room) {
      try {
        client.write(formattedMsg);
      } catch (err) {
        // Stream write failed
      }
    }
  }
}

/**
 * Broadcasts an auction state transition to the room and the observability portals.
 * @param {string} auctionId 
 * @param {string} status 
 * @param {object} details - Additional metadata.
 */
export function broadcastAuctionStatus(auctionId, status, details = {}) {
  // Broadcast to room
  broadcastToAuction(auctionId, {
    type: 'status_change',
    auctionId,
    status,
    ...details
  });

  // Broadcast to observability dashboards
  const logMsg = `data: ${JSON.stringify({ type: 'lifecycle', auctionId, status, details })}\n\n`;
  for (const client of observabilityClients) {
    try {
      client.write(logMsg);
    } catch (err) {}
  }
}

let pingIntervalId = setInterval(() => {
  const pingPayload = `data: ${JSON.stringify({ type: 'ping' })}\n\n`;
  
  for (const client of observabilityClients) {
    try { client.write(pingPayload); } catch (e) {}
  }
  for (const room of auctionRooms.values()) {
    for (const client of room) {
      try { client.write(pingPayload); } catch (e) {}
    }
  }
}, 15000);

/**
 * Stop the periodic keep-alive SSE ping timer.
 */
export function stopStreamServicePinger() {
  if (pingIntervalId) {
    clearInterval(pingIntervalId);
    pingIntervalId = null;
  }
}
