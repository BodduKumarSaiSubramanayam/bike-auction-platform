import crypto from 'node:crypto';

// Base64Url encoding/decoding helpers
function toBase64url(str) {
  return Buffer.from(str, 'utf8').toString('base64url');
}

function fromBase64url(str) {
  return Buffer.from(str, 'base64url').toString('utf8');
}

/**
 * Signs a payload to create a custom JWT-like token.
 * @param {object} payload - Data to encode.
 * @param {string} secret - Signing key.
 * @param {number} expiresInSeconds - Expiration time (default 24h).
 * @returns {string} Token string.
 */
export function signToken(payload, secret, expiresInSeconds = 86400) {
  const header = { alg: 'HS256', typ: 'JWT' };
  const exp = Math.floor(Date.now() / 1000) + expiresInSeconds;
  const fullPayload = { ...payload, exp };

  const headerB64 = toBase64url(JSON.stringify(header));
  const payloadB64 = toBase64url(JSON.stringify(fullPayload));

  const signature = crypto
    .createHmac('sha256', secret)
    .update(`${headerB64}.${payloadB64}`)
    .digest('base64url');

  return `${headerB64}.${payloadB64}.${signature}`;
}

/**
 * Verifies and decodes a signed token.
 * @param {string} token - Signed token.
 * @param {string} secret - Signing key.
 * @returns {object|null} Decoded payload or null if invalid/expired.
 */
export function verifyToken(token, secret) {
  try {
    if (!token) return null;
    const parts = token.split('.');
    if (parts.length !== 3) return null;

    const [headerB64, payloadB64, signature] = parts;

    const expectedSignature = crypto
      .createHmac('sha256', secret)
      .update(`${headerB64}.${payloadB64}`)
      .digest('base64url');

    if (signature !== expectedSignature) return null;

    const payload = JSON.parse(fromBase64url(payloadB64));

    if (payload.exp && (Date.now() / 1000) > payload.exp) {
      return null; // Expired
    }

    return payload;
  } catch (error) {
    return null;
  }
}

/**
 * Hashes a password using PBKDF2.
 * @param {string} password - Raw password.
 * @returns {string} Salted hash (format: "salt:hash").
 */
export function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.pbkdf2Sync(password, salt, 1000, 64, 'sha512').toString('hex');
  return `${salt}:${hash}`;
}

/**
 * Verifies a password against a stored salt+hash.
 * @param {string} password - Raw password to check.
 * @param {string} storedHash - Stored hash ("salt:hash").
 * @returns {boolean} True if match, false otherwise.
 */
export function verifyPassword(password, storedHash) {
  try {
    if (!storedHash) return false;
    const [salt, hash] = storedHash.split(':');
    if (!salt || !hash) return false;
    const verifyHash = crypto.pbkdf2Sync(password, salt, 1000, 64, 'sha512').toString('hex');
    return hash === verifyHash;
  } catch (error) {
    return false;
  }
}
