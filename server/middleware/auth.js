import { verifyToken } from '../utils/crypto.js';

const JWT_SECRET = process.env.JWT_SECRET || 'bike-auction-secret-key-12345';

/**
 * Extracts and validates the token from authorization headers or query parameters (for EventSource).
 * @param {object} req - HTTP request
 * @returns {object|null} Decoded user payload or null if invalid
 */
export function getAuthenticatedUser(req) {
  let token = null;

  // 1. Try Authorization Header
  const authHeader = req.headers['authorization'] || req.headers['Authorization'];
  if (authHeader) {
    const parts = authHeader.split(' ');
    if (parts.length === 2 && parts[0].toLowerCase() === 'bearer') {
      token = parts[1];
    }
  }

  // 2. Fallback to query parameter (required for browser native EventSource SSE requests)
  if (!token && req.query && req.query.token) {
    token = req.query.token;
  }

  if (!token) return null;

  return verifyToken(token, JWT_SECRET);
}

/**
 * Route decorator that requires authentication.
 * @param {function} handler 
 */
export function withAuth(handler) {
  return async (req, res) => {
    const user = getAuthenticatedUser(req);
    if (!user) {
      return res.json({ error: "Unauthorized. Valid token required." }, 401);
    }
    req.user = user;
    return handler(req, res);
  };
}

/**
 * Route decorator that requires Admin privileges.
 * @param {function} handler 
 */
export function withAdmin(handler) {
  return async (req, res) => {
    const user = getAuthenticatedUser(req);
    if (!user) {
      return res.json({ error: "Unauthorized. Valid token required." }, 401);
    }
    if (user.role !== 'ADMIN') {
      return res.json({ error: "Forbidden. Admin privileges required." }, 403);
    }
    req.user = user;
    return handler(req, res);
  };
}
