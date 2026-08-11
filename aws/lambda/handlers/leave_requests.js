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
      let result;
      if (caller.role === 'Admin') {
        result = await pool.query('SELECT * FROM leave_requests ORDER BY created_at DESC');
      } else if (caller.role === 'Team Leader') {
        result = await pool.query(
          `SELECT lr.* FROM leave_requests lr
           LEFT JOIN users u ON lr.user_id = u.id
           WHERE lr.user_id = $1 OR u.manager_id = $1
           ORDER BY lr.created_at DESC`,
          [caller.id]
        );
      } else {
        result = await pool.query(
          'SELECT * FROM leave_requests WHERE user_id = $1 ORDER BY created_at DESC',
          [caller.id]
        );
      }
      return respond(200, result.rows, event);
    }

    if (method === 'POST') {
      const {
        id, user_id, leave_type, from_date, to_date, total_days,
        reason, description, attachment, status,
        admin_comment, approved_by, approved_at
      } = parseBody(event.body);

      // Security Check
      if (caller.role !== 'Admin') {
        if (caller.role === 'Team Leader') {
          const targetUser = await pool.query('SELECT manager_id FROM users WHERE id = $1', [user_id]);
          const isManaged = targetUser.rows.length > 0 && targetUser.rows[0].manager_id === caller.id;
          if (user_id !== caller.id && !isManaged) {
            return respond(403, { error: 'Forbidden' }, event);
          }
        } else if (user_id !== caller.id) {
          return respond(403, { error: 'Forbidden' }, event);
        }
      }

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

      if (caller.role !== 'Admin') {
        const leaveRes = await pool.query('SELECT user_id FROM leave_requests WHERE id = $1', [id]);
        if (leaveRes.rows.length > 0 && leaveRes.rows[0].user_id !== caller.id) {
          return respond(403, { error: 'Forbidden' }, event);
        }
      }

      await pool.query('DELETE FROM leave_requests WHERE id = $1', [id]);
      return respond(200, { deleted: true }, event);
    }

    return respond(405, { error: 'Method not allowed' }, event);
  } catch (err) {
    console.error('leave_requests handler error:', err);
    return respond(500, { error: err.message }, event);
  }
};
