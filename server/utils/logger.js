import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { db } from '../db/connection.js';
import crypto from 'node:crypto';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const logFilePath = path.resolve(__dirname, '../../server.log');

let logBroadcastCallback = null;

/**
 * Register a callback to stream logs live to SSE clients.
 * @param {function} callback 
 */
export function registerLogBroadcast(callback) {
  logBroadcastCallback = callback;
}

/**
 * Log a message to Console, File, SQLite DB, and SSE.
 * @param {string} level - 'INFO' | 'WARN' | 'ERROR'
 * @param {string} message 
 * @param {any} details 
 */
export function log(level, message, details = null) {
  const timestamp = new Date().toISOString();
  
  let detailsStr = null;
  if (details) {
    if (details instanceof Error) {
      detailsStr = JSON.stringify({
        message: details.message,
        stack: details.stack
      });
    } else if (typeof details === 'object') {
      detailsStr = JSON.stringify(details);
    } else {
      detailsStr = String(details);
    }
  }

  const logEntry = {
    id: crypto.randomUUID(),
    level,
    message,
    details: detailsStr,
    timestamp
  };

  // 1. Colorized console log
  const colors = {
    INFO: '\x1b[32m',  // Green
    WARN: '\x1b[33m',  // Yellow
    ERROR: '\x1b[31m', // Red
    RESET: '\x1b[0m'
  };
  const color = colors[level] || colors.RESET;
  console.log(`[${timestamp}] ${color}${level}${colors.RESET}: ${message}`, details ? details : '');

  // 2. Append to server.log file
  try {
    fs.appendFileSync(logFilePath, JSON.stringify(logEntry) + '\n');
  } catch (err) {
    console.error("Logger: failed to write to log file:", err);
  }

  // 3. Persist to Database if open
  try {
    if (db) {
      const stmt = db.prepare(`
        INSERT INTO system_logs (id, level, message, details, timestamp)
        VALUES (?, ?, ?, ?, ?)
      `);
      stmt.run(logEntry.id, logEntry.level, logEntry.message, logEntry.details, logEntry.timestamp);
    }
  } catch (dbErr) {
    if (!dbErr.message.includes('no such table')) {
      console.error("Logger: failed to persist log to SQLite:", dbErr);
    }
  }

  // 4. Live Broadcast to SSE listeners
  if (logBroadcastCallback) {
    logBroadcastCallback(logEntry);
  }
}

export const logger = {
  info: (message, details = null) => log('INFO', message, details),
  warn: (message, details = null) => log('WARN', message, details),
  error: (message, details = null) => log('ERROR', message, details)
};
