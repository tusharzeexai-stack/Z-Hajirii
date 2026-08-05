/**
 * audit_logs.js — Lambda handler for /audit_logs resource.
 *
 * Security: All routes require a valid JWT (Authorization: Bearer <token>)
 */
const { getPool } = require('../db');
const { respond, parseBody, verifyToken } = require('../utils');

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return respond(200, { ok: true }, event);

  // ── JWT Guard ──────────────────────────────────────────────────────────────
  const caller = verifyToken(event);
  if (!caller) return respond(401, { error: 'Unauthorized' }, event);

  const pool = await getPool();
  const method = event.httpMethod;

  try {
    if (method === 'GET') {
      // Only Admin can read audit logs
      if (caller.role !== 'Admin') return respond(403, { error: 'Forbidden' }, event);
      const result = await pool.query('SELECT * FROM audit_logs ORDER BY created_at DESC');
      return respond(200, result.rows, event);
    }

    if (method === 'POST') {
      const { id, user_id, username, action, details, ip_address } = parseBody(event.body);
      await pool.query(
        `INSERT INTO audit_logs (id, user_id, username, action, details, ip_address)
         VALUES ($1,$2,$3,$4,$5,$6)`,
        [id, user_id || null, username || '', action, details, ip_address || '']
      );
      return respond(200, { success: true }, event);
    }

    return respond(405, { error: 'Method not allowed' }, event);
  } catch (err) {
    console.error('audit_logs handler error:', err);
    return respond(500, { error: err.message }, event);
  }
};
