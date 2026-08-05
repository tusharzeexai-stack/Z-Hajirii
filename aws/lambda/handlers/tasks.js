/**
 * tasks.js — Lambda handler for /tasks resource.
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
      const result = await pool.query('SELECT * FROM tasks ORDER BY created_at DESC');
      return respond(200, result.rows, event);
    }

    if (method === 'POST') {
      const { id, user_id, title, description, priority, deadline, status, attachment, completed_at } = parseBody(event.body);
      await pool.query(
        `INSERT INTO tasks (id, user_id, title, description, priority, deadline, status, attachment, completed_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
         ON CONFLICT (id) DO UPDATE SET
           title        = EXCLUDED.title,
           description  = EXCLUDED.description,
           priority     = EXCLUDED.priority,
           deadline     = EXCLUDED.deadline,
           status       = EXCLUDED.status,
           attachment   = EXCLUDED.attachment,
           completed_at = EXCLUDED.completed_at`,
        [id, user_id, title, description, priority, deadline, status, attachment || null, completed_at || null]
      );
      return respond(200, { success: true }, event);
    }

    if (method === 'DELETE') {
      const id = event.pathParameters?.id || event.queryStringParameters?.id;
      if (!id) return respond(400, { error: 'Missing id' }, event);
      await pool.query('DELETE FROM tasks WHERE id = $1', [id]);
      return respond(200, { deleted: true }, event);
    }

    return respond(405, { error: 'Method not allowed' }, event);
  } catch (err) {
    console.error('tasks handler error:', err);
    return respond(500, { error: err.message }, event);
  }
};
