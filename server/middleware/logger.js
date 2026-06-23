import { logger } from '../utils/logger.js';

const recentResponseTimes = [];
const MAX_METRIC_HISTORY = 100;
let requestCount = 0;
let errorCount = 0;

/**
 * Returns aggregated system metrics.
 * @returns {object}
 */
export function getObservabilityMetrics() {
  const mem = process.memoryUsage();
  return {
    memory: {
      rss: Math.round((mem.rss / 1024 / 1024) * 100) / 100,         // MB
      heapUsed: Math.round((mem.heapUsed / 1024 / 1024) * 100) / 100, // MB
      heapTotal: Math.round((mem.heapTotal / 1024 / 1024) * 100) / 100 // MB
    },
    uptime: Math.round(process.uptime()),
    requestCount,
    errorCount,
    recentResponseTimes: recentResponseTimes.slice(-30)
  };
}

/**
 * Registers an HTTP request and measures its duration.
 * @param {object} req 
 * @param {object} res 
 * @param {number} latencyMs 
 */
export function recordRequestMetrics(req, res, latencyMs) {
  requestCount++;
  const latencyRounded = Math.round(latencyMs * 100) / 100;

  recentResponseTimes.push({
    path: req.url.split('?')[0],
    method: req.method,
    status: res.statusCode,
    latency: latencyRounded,
    timestamp: new Date().toISOString()
  });

  if (recentResponseTimes.length > MAX_METRIC_HISTORY) {
    recentResponseTimes.shift();
  }

  const logMsg = `API [${req.method}] ${req.url} - ${res.statusCode} in ${latencyRounded}ms`;

  if (res.statusCode >= 500) {
    errorCount++;
    logger.error(logMsg);
  } else if (res.statusCode >= 400) {
    errorCount++;
    logger.warn(logMsg);
  } else {
    logger.info(logMsg);
  }
}
