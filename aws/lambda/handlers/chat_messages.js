/**
 * chat_messages.js — Lambda handler for /chat_messages resource.
 */
const { getPool } = require('../db');
const { respond, parseBody } = require('../utils');

exports.handler = async (event) => {
  const pool = await getPool();
  const method = event.httpMethod;

  try {
    if (method === 'OPTIONS') return respond(200, { ok: true });

    if (method === 'GET') {
      const result = await pool.query('SELECT * FROM chat_messages ORDER BY created_at ASC');
      return respond(200, result.rows);
    }

    if (method === 'POST') {
      const { id, sender_id, receiver_id, message, created_at } = parseBody(event.body);
      await pool.query(
        `INSERT INTO chat_messages (id, sender_id, receiver_id, message, created_at)
         VALUES ($1,$2,$3,$4,$5)`,
        [id, sender_id, receiver_id, message, created_at || new Date().toISOString()]
      );
      return respond(200, { success: true });
    }

    return respond(405, { error: 'Method not allowed' });
  } catch (err) {
    console.error('chat_messages handler error:', err);
    return respond(500, { error: err.message });
  }
};
