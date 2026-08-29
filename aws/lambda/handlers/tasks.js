/**
 * tasks.js — Lambda handler for /tasks resource.
 *
 * Security: All routes require a valid JWT (Authorization: Bearer <token>)
 */
let getPool;
try { getPool = require('../db').getPool; } catch { getPool = require('./db').getPool; }

let respond, parseBody, verifyToken;
try { ({ respond, parseBody, verifyToken } = require('../utils')); } catch { ({ respond, parseBody, verifyToken } = require('./utils')); }

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return respond(200, { ok: true }, event);

  // ── JWT Guard ──────────────────────────────────────────────────────────────
  const caller = verifyToken(event);
  if (!caller) return respond(401, { error: 'Unauthorized' }, event);

  const pool = await getPool();
  const method = event.httpMethod;

  try {
    if (method === 'GET') {
      let result;
      if (caller.role === 'Admin') {
        result = await pool.query('SELECT * FROM tasks ORDER BY created_at DESC');
      } else if (caller.role === 'Team Leader') {
        result = await pool.query(
          `SELECT t.* FROM tasks t
           LEFT JOIN users u ON t.user_id = u.id
           WHERE t.user_id = $1 OR u.manager_id = $1
           ORDER BY t.created_at DESC`,
          [caller.id]
        );
      } else {
        result = await pool.query(
          'SELECT * FROM tasks WHERE user_id = $1 ORDER BY created_at DESC',
          [caller.id]
        );
      }
      return respond(200, result.rows, event);
    }

    if (method === 'POST') {
      const { id, user_id, title, description, priority, deadline, status, attachment, completed_at, file_type, file_size } = parseBody(event.body);

      // Attachment File Validation (Pillar 6: File Upload Security)
      if (attachment) {
        const MAX_SIZE = 5 * 1024 * 1024; // 5MB
        if (file_size && file_size > MAX_SIZE) {
          return respond(400, { error: 'Attachment exceeds maximum allowed size of 5MB.' }, event);
        }
        const ALLOWED_MIME = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
        if (file_type && !ALLOWED_MIME.includes(file_type.toLowerCase())) {
          return respond(400, { error: 'Invalid file type. Only PDF and images (JPEG, PNG, WEBP) are allowed.' }, event);
        }
      }

      // Security check: Non-admins can only create/update tasks for themselves or their managed interns
      if (caller.role !== 'Admin') {
        if (caller.role === 'Team Leader') {
          const targetUser = await pool.query('SELECT manager_id FROM users WHERE id = $1', [user_id]);
          const isManaged = targetUser.rows.length > 0 && targetUser.rows[0].manager_id === caller.id;
          if (user_id !== caller.id && !isManaged) {
            return respond(403, { error: 'Forbidden: Cannot create/edit tasks for unmanaged users.' }, event);
          }
        } else if (user_id !== caller.id) {
          return respond(403, { error: 'Forbidden: Cannot create/edit tasks for other users.' }, event);
        }
      }

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

      if (caller.role !== 'Admin') {
        // Enforce ownership: only owner or manager can delete task
        const taskRes = await pool.query(
          `SELECT t.user_id, u.manager_id FROM tasks t
           LEFT JOIN users u ON t.user_id = u.id
           WHERE t.id = $1`, [id]
        );
        if (taskRes.rows.length > 0) {
          const t = taskRes.rows[0];
          if (t.user_id !== caller.id && t.manager_id !== caller.id) {
            return respond(403, { error: 'Forbidden' }, event);
          }
        }
      }

      await pool.query('DELETE FROM tasks WHERE id = $1', [id]);
      return respond(200, { deleted: true }, event);
    }

    return respond(405, { error: 'Method not allowed' }, event);
  } catch (err) {
    console.error('tasks handler error:', err);
    return respond(500, { error: err.message }, event);
  }
};
