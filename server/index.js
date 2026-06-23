import http from 'node:http';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

// Import local services/routes
import { initSchema, seedData } from './db/schema.js';
import { Router, loadEnv } from './utils/router.js';
import { registerRoutes } from './routes.js';
import { startAuctionLifecycleService, stopAuctionLifecycleService } from './services/auctionManager.js';
import { registerLogBroadcast, logger } from './utils/logger.js';
import { broadcastLog, broadcastMetrics, stopStreamServicePinger } from './services/streamService.js';
import { recordRequestMetrics, getObservabilityMetrics } from './middleware/logger.js';

// Setup environment variables
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
loadEnv(path.resolve(__dirname, '../.env'));

// Initialize DB schema & seed mock data
initSchema();
logger.info("Database schema initialized.");
seedData();

// Initialize custom Router
const router = new Router();
registerRoutes(router);

const PORT = process.env.PORT || 5000;
const publicPath = path.resolve(__dirname, '../public');

// Create Native HTTP Server
const server = http.createServer(async (req, res) => {
  const startTime = process.hrtime();

  res.on('finish', () => {
    const diff = process.hrtime(startTime);
    const latencyMs = (diff[0] * 1e9 + diff[1]) / 1e6;
    
    // Skip static assets logging to avoid log pollution
    const isApi = req.url.startsWith('/api');
    if (isApi) {
      recordRequestMetrics(req, res, latencyMs);
    }
  });

  // Handle request through custom router (serves /public as static if no route matches)
  await router.handle(req, res, publicPath);
});

// Wire up the logger to broadcast live to SSE clients
registerLogBroadcast(broadcastLog);

// Start background services
startAuctionLifecycleService();

// Periodically broadcast performance metrics to active dashboards (every 5 seconds)
const metricsInterval = setInterval(() => {
  try {
    const metrics = getObservabilityMetrics();
    broadcastMetrics(metrics);
  } catch (err) {
    // Silent catch
  }
}, 5000);

// Only start listening if run directly (not in tests)
const isMain = import.meta.url === pathToFileURL(process.argv[1]).href || process.env.NODE_ENV !== 'test';
if (isMain) {
  server.listen(PORT, () => {
    logger.info(`Bike Auction Platform Server running at http://localhost:${PORT}`);
    logger.info(`Serving static files from directory: ${publicPath}`);
  });
}

// Server close cleanups (crucial for clearing active timers in test runner)
server.on('close', () => {
  logger.warn("Server closing. Cleaning up background services...");
  clearInterval(metricsInterval);
  stopAuctionLifecycleService();
  stopStreamServicePinger();
});

// Graceful shutdown handling
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

function shutdown() {
  logger.warn("Received shutdown signal. Stopping services...");
  server.close(() => {
    logger.info("HTTP Server closed.");
    process.exit(0);
  });
}

// Export server application for testing
export const app = server;
export default server;
