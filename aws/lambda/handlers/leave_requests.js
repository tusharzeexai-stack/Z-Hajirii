/**
 * leave_requests.js — Lambda handler for /leave_requests resource.
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
      const result = await pool.query('SELECT * FROM leave_requests ORDER BY created_at DESC');
      return respond(200, result.rows, event);
    }

    if (method === 'POST') {
      const {
        id, user_id, leave_type, from_date, to_date, total_days,
        reason, description, attachment, status,
        admin_comment, approved_by, approved_at
      } = parseBody(event.body);

      await pool.query(
        `INSERT INTO leave_requests
           (id, user_id, leave_type, from_date, to_date, total_days, reason, description,
            attachment, status, admin_comment, approved_by, approved_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
         ON CONFLICT (id) DO UPDATE SET
           leave_type    = EXCLUDED.leave_type,
           from_date     = EXCLUDED.from_date,
           to_date       = EXCLUDED.to_date,
           total_days    = EXCLUDED.total_days,
           reason        = EXCLUDED.reason,
           description   = EXCLUDED.description,
           attachment    = EXCLUDED.attachment,
           status        = EXCLUDED.status,
           admin_comment = EXCLUDED.admin_comment,
           approved_by   = EXCLUDED.approved_by,
           approved_at   = EXCLUDED.approved_at`,
        [id, user_id, leave_type, from_date, to_date, total_days,
         reason, description || '', attachment || '', status,
         admin_comment || '', approved_by || null, approved_at || null]
      );
      return respond(200, { success: true }, event);
    }

    if (method === 'DELETE') {
      const id = event.pathParameters?.id || event.queryStringParameters?.id;
      if (!id) return respond(400, { error: 'Missing id' }, event);
      await pool.query('DELETE FROM leave_requests WHERE id = $1', [id]);
      return respond(200, { deleted: true }, event);
    }

    return respond(405, { error: 'Method not allowed' }, event);
  } catch (err) {
    console.error('leave_requests handler error:', err);
    return respond(500, { error: err.message }, event);
  }
};
