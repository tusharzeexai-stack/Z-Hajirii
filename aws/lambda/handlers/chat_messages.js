/**
 * chat_messages.js — Lambda handler for /chat_messages resource.
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
      const result = await pool.query('SELECT * FROM chat_messages ORDER BY created_at ASC');
      return respond(200, result.rows, event);
    }

    if (method === 'POST') {
      const { id, sender_id, receiver_id, message, created_at } = parseBody(event.body);
      await pool.query(
        `INSERT INTO chat_messages (id, sender_id, receiver_id, message, created_at)
         VALUES ($1,$2,$3,$4,$5)`,
        [id, sender_id, receiver_id, message, created_at || new Date().toISOString()]
      );
      return respond(200, { success: true }, event);
    }

    return respond(405, { error: 'Method not allowed' }, event);
  } catch (err) {
    console.error('chat_messages handler error:', err);
    return respond(500, { error: err.message }, event);
  }
};
