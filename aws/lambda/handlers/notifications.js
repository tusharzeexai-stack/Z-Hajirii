/**
 * notifications.js — Lambda handler for /notifications resource.
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
      const result = await pool.query('SELECT * FROM notifications ORDER BY created_at DESC');
      return respond(200, result.rows, event);
    }

    if (method === 'POST') {
      const body = parseBody(event.body);
      const action = event.queryStringParameters?.action;

      if (action === 'mark_read') {
        const { id } = body;
        await pool.query('UPDATE notifications SET is_read = true WHERE id = $1', [id]);
        return respond(200, { success: true }, event);
      }

      if (action === 'mark_all_read') {
        const { user_id } = body;
        await pool.query('UPDATE notifications SET is_read = true WHERE user_id = $1', [user_id]);
        return respond(200, { success: true }, event);
      }

      // Insert
      const { id, user_id, title, message, type, is_read } = body;
      await pool.query(
        `INSERT INTO notifications (id, user_id, title, message, type, is_read)
         VALUES ($1,$2,$3,$4,$5,$6)`,
        [id, user_id, title, message, type, is_read ?? false]
      );
      return respond(200, { success: true }, event);
    }

    if (method === 'DELETE') {
      const body = parseBody(event.body);
      const action = event.queryStringParameters?.action;

      if (action === 'delete_by_user') {
        const { user_id } = body;
        await pool.query('DELETE FROM notifications WHERE user_id = $1', [user_id]);
        return respond(200, { deleted: true }, event);
      }

      const id = event.pathParameters?.id || event.queryStringParameters?.id;
      if (!id) return respond(400, { error: 'Missing id' }, event);
      await pool.query('DELETE FROM notifications WHERE id = $1', [id]);
      return respond(200, { deleted: true }, event);
    }

    return respond(405, { error: 'Method not allowed' }, event);
  } catch (err) {
    console.error('notifications handler error:', err);
    return respond(500, { error: err.message }, event);
  }
};
