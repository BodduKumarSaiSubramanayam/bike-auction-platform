import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';
import { logger } from './logger.js';

const MIME_TYPES = {
  '.html': 'text/html',
  '.css': 'text/css',
  '.js': 'application/javascript',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.mp3': 'audio/mpeg'
};

export class Router {
  constructor() {
    this.routes = {
      GET: [],
      POST: [],
      OPTIONS: []
    };
  }

  /**
   * Adds a route pattern.
   * @param {string} method - 'GET' | 'POST'
   * @param {string} pattern - Route path template (e.g. '/api/auctions/:id')
   * @param {function} handler - Endpoint handler
   */
  addRoute(method, pattern, handler) {
    const paramNames = [];
    const regexSource = pattern
      .replace(/:([a-zA-Z0-9_]+)/g, (_, name) => {
        paramNames.push(name);
        return '([^/]+)';
      })
      .replace(/\*/g, '.*');

    const regex = new RegExp(`^${regexSource}$`);
    this.routes[method].push({ regex, paramNames, handler });
  }

  get(pattern, handler) { this.addRoute('GET', pattern, handler); }
  post(pattern, handler) { this.addRoute('POST', pattern, handler); }

  /**
   * Dispatches the request to the matching route or serves static content.
   */
  async handle(req, res, staticDir) {
    // 1. Attach standard CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    // Handle preflight OPTIONS request
    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    const parsedUrl = url.parse(req.url, true);
    const pathname = parsedUrl.pathname;
    req.query = parsedUrl.query;

    const routesForMethod = this.routes[req.method] || [];
    let matched = null;
    let params = {};

    for (const route of routesForMethod) {
      const match = pathname.match(route.regex);
      if (match) {
        matched = route;
        route.paramNames.forEach((name, idx) => {
          params[name] = match[idx + 1];
        });
        break;
      }
    }

    // Helper method to easily reply JSON
    res.json = (data, status = 200) => {
      res.writeHead(status, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(data));
    };

    if (matched) {
      req.params = params;

      // Automatically parse json request bodies for POSTs
      if (req.method === 'POST') {
        try {
          const bodyBuffer = [];
          for await (const chunk of req) {
            bodyBuffer.push(chunk);
          }
          const rawBody = Buffer.concat(bodyBuffer).toString();
          req.body = rawBody ? JSON.parse(rawBody) : {};
        } catch (err) {
          return res.json({ error: 'Malformed JSON request body.' }, 400);
        }
      }

      // Execute request handler
      try {
        await matched.handler(req, res);
      } catch (err) {
        logger.error(`Error in route [${req.method}] ${pathname}:`, err);
        return res.json({ error: 'Internal server error.' }, 500);
      }
    } else {
      // 2. Serve static UI files
      if (req.method === 'GET') {
        let filePath = path.join(staticDir, pathname);

        // Serve index.html if pointing to directory root
        try {
          const stats = fs.statSync(filePath);
          if (stats.isDirectory()) {
            filePath = path.join(filePath, 'index.html');
          }
        } catch (err) {
          // If file not found, fallback to index.html (SPA client side router)
          if (!pathname.startsWith('/api')) {
            filePath = path.join(staticDir, 'index.html');
          } else {
            return res.json({ error: 'API Endpoint not found.' }, 404);
          }
        }

        const ext = path.extname(filePath).toLowerCase();
        const contentType = MIME_TYPES[ext] || 'application/octet-stream';

        fs.readFile(filePath, (err, content) => {
          if (err) {
            res.writeHead(404, { 'Content-Type': 'text/plain' });
            res.end('File Not Found');
          } else {
            res.writeHead(200, { 'Content-Type': contentType });
            res.end(content);
          }
        });
      } else {
        return res.json({ error: 'Resource not found.' }, 404);
      }
    }
  }
}

/**
 * Utility to parse simple local .env files natively.
 * @param {string} filePath 
 */
export function loadEnv(filePath) {
  try {
    if (fs.existsSync(filePath)) {
      const content = fs.readFileSync(filePath, 'utf8');
      content.split(/\r?\n/).forEach(line => {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) return;
        const parts = trimmed.split('=');
        if (parts.length >= 2) {
          const key = parts[0].trim();
          const val = parts.slice(1).join('=').trim().replace(/(^['"]|['"]$)/g, '');
          if (key && !process.env[key]) {
            process.env[key] = val;
          }
        }
      });
    }
  } catch (err) {
    console.error("Failed to load environment file:", err);
  }
}
