/**
 * audit_logs.js — Lambda handler for /audit_logs resource.
 */
const { getPool } = require('../db');
const { respond, parseBody } = require('../utils');

exports.handler = async (event) => {
  const pool = await getPool();
  const method = event.httpMethod;

  try {
    if (method === 'OPTIONS') return respond(200, { ok: true });

    if (method === 'GET') {
      const result = await pool.query('SELECT * FROM audit_logs ORDER BY created_at DESC');
      return respond(200, result.rows);
    }

    if (method === 'POST') {
      const { id, user_id, username, action, details, ip_address } = parseBody(event.body);
      await pool.query(
        `INSERT INTO audit_logs (id, user_id, username, action, details, ip_address)
         VALUES ($1,$2,$3,$4,$5,$6)`,
        [id, user_id || null, username || '', action, details, ip_address || '']
      );
      return respond(200, { success: true });
    }

    return respond(405, { error: 'Method not allowed' });
  } catch (err) {
    console.error('audit_logs handler error:', err);
    return respond(500, { error: err.message });
  }
};
