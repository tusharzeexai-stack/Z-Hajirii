/**
 * middleware/auth.js — JWT verification middleware.
 *
 * Attaches req.caller = { id, username, role, fullName, employeeId }
 * on success. Returns 401 on missing or invalid token.
 */

const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET;

if (!JWT_SECRET) {
  console.warn('[auth middleware] ⚠️  JWT_SECRET is not set — authentication will fail!');
}

function verifyToken(req, res, next) {
  try {
    const authHeader = req.headers['authorization'] || req.headers['Authorization'] || '';

    if (!authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Unauthorized: Missing Bearer token.' });
    }

    const token = authHeader.slice(7);
    const secret = JWT_SECRET || 'changeme-insecure-default';
    const decoded = jwt.verify(token, secret);

    // Attach verified caller identity to request
    req.caller = {
      id:         decoded.id,
      username:   decoded.username,
      role:       decoded.role,
      fullName:   decoded.fullName,
      employeeId: decoded.employeeId,
    };

    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Session expired. Please log in again.', code: 401 });
    }
    return res.status(401).json({ error: 'Unauthorized: Invalid token.' });
  }
}

module.exports = { verifyToken };
