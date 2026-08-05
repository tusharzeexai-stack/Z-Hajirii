/**
 * verifyToken.js — JWT verification middleware for Lambda handlers.
 *
 * Usage in any handler:
 *   const { verifyToken } = require('../middleware/verifyToken');
 *   const user = verifyToken(event);
 *   if (!user) return respond(401, { error: 'Unauthorized' });
 */

const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'changeme-insecure-default';

/**
 * Extracts and verifies the JWT from the Authorization header.
 * Returns the decoded payload on success, or null on failure.
 */
function verifyToken(event) {
  try {
    const authHeader =
      event.headers?.Authorization ||
      event.headers?.authorization ||
      '';

    if (!authHeader.startsWith('Bearer ')) return null;

    const token = authHeader.slice(7);
    const decoded = jwt.verify(token, JWT_SECRET);
    return decoded; // { id, username, role, fullName, employeeId, iat, exp }
  } catch (err) {
    return null;
  }
}

module.exports = { verifyToken, JWT_SECRET };
