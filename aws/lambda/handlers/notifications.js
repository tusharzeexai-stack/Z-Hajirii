/**
 * notifications.js — Lambda handler for /notifications resource.
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
        // Admin sees ALL notifications across all users
        result = await pool.query('SELECT * FROM notifications ORDER BY created_at DESC');
      } else {
        // Employee / Team Leader only see their own notifications
        result = await pool.query(
          'SELECT * FROM notifications WHERE user_id = $1 ORDER BY created_at DESC',
          [caller.id]
        );
      }
      return respond(200, result.rows, event);
    }

    if (method === 'POST') {
      const body = parseBody(event.body);
      const action = event.queryStringParameters?.action;

      if (action === 'mark_read') {
        const { id } = body;
        // Non-admin can only mark their own notifications
        if (caller.role === 'Admin') {
          await pool.query('UPDATE notifications SET is_read = true WHERE id = $1', [id]);
        } else {
          await pool.query('UPDATE notifications SET is_read = true WHERE id = $1 AND user_id = $2', [id, caller.id]);
        }
        return respond(200, { success: true }, event);
      }

      if (action === 'mark_all_read') {
        // Always scope to caller's own notifications for non-admin; admin passes user_id explicitly
        const effectiveUserId = caller.role === 'Admin' ? (body.user_id || caller.id) : caller.id;
        await pool.query('UPDATE notifications SET is_read = true WHERE user_id = $1', [effectiveUserId]);
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
        // Non-admin can only clear their own notifications
        const effectiveUserId = caller.role === 'Admin' ? (body.user_id || caller.id) : caller.id;
        await pool.query('DELETE FROM notifications WHERE user_id = $1', [effectiveUserId]);
        return respond(200, { deleted: true }, event);
      }

      const id = event.pathParameters?.id || event.queryStringParameters?.id;
      if (!id) return respond(400, { error: 'Missing id' }, event);
      // Non-admin can only delete their own notification
      if (caller.role === 'Admin') {
        await pool.query('DELETE FROM notifications WHERE id = $1', [id]);
      } else {
        await pool.query('DELETE FROM notifications WHERE id = $1 AND user_id = $2', [id, caller.id]);
      }
      return respond(200, { deleted: true }, event);
    }

    return respond(405, { error: 'Method not allowed' }, event);
  } catch (err) {
    console.error('notifications handler error:', err);
    return respond(500, { error: err.message }, event);
  }
};
