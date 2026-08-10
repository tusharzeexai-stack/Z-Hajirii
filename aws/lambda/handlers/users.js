/**
 * users.js — Lambda handler for /users resource.
 * Supports: GET (list), POST (upsert), DELETE (by id or IN list)
 *
 * Security:
 *  - All routes require a valid JWT (Authorization: Bearer <token>)
 *  - GET /users NEVER returns password_hash — safe profiles only
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
      // Strip password_hash — NEVER send to frontend
      const result = await pool.query(
        `SELECT
           id, username, full_name, email, employee_id, department,
           designation, phone_number, joining_date, role, status,
           intern_type, manager_id, created_at, updated_at
         FROM users
         ORDER BY created_at DESC`
      );
      return respond(200, result.rows, event);
    }

    if (method === 'POST') {
      const body = parseBody(event.body);
      const action = event.queryStringParameters?.action;

      // Only Admin can perform write operations
      if (caller.role !== 'Admin') {
        return respond(403, { error: 'Forbidden: Admin access required.' }, event);
      }

      // Batch delete (prune mock users)
      if (action === 'delete_in') {
        const ids = body.ids;
        if (!ids || !ids.length) return respond(200, { deleted: 0 }, event);
        const placeholders = ids.map((_, i) => `$${i + 1}`).join(', ');
        const result = await pool.query(`DELETE FROM users WHERE id IN (${placeholders})`, ids);
        return respond(200, { deleted: result.rowCount }, event);
      }

      // Upsert (insert or update on conflict)
      const {
        id, username, password_hash, full_name, email, employee_id,
        department, designation, phone_number, joining_date,
        role, status, intern_type, manager_id
      } = body;

      await pool.query(
        `INSERT INTO users
           (id, username, password_hash, full_name, email, employee_id, department, designation,
            phone_number, joining_date, role, status, intern_type, manager_id, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,NOW())
         ON CONFLICT (id) DO UPDATE SET
           username      = EXCLUDED.username,
           password_hash = EXCLUDED.password_hash,
           full_name     = EXCLUDED.full_name,
           email         = EXCLUDED.email,
           employee_id   = EXCLUDED.employee_id,
           department    = EXCLUDED.department,
           designation   = EXCLUDED.designation,
           phone_number  = EXCLUDED.phone_number,
           joining_date  = EXCLUDED.joining_date,
           role          = EXCLUDED.role,
           status        = EXCLUDED.status,
           intern_type   = EXCLUDED.intern_type,
           manager_id    = EXCLUDED.manager_id,
           updated_at    = NOW()`,
        [id, username, password_hash, full_name, email, employee_id,
         department, designation, phone_number, joining_date,
         role, status, intern_type, manager_id]
      );
      return respond(200, { success: true }, event);
    }

    if (method === 'DELETE') {
      // Only Admin can delete
      if (caller.role !== 'Admin') {
        return respond(403, { error: 'Forbidden: Admin access required.' }, event);
      }
      const id = event.pathParameters?.id || event.queryStringParameters?.id;
      if (!id) return respond(400, { error: 'Missing id' }, event);
      await pool.query('DELETE FROM users WHERE id = $1', [id]);
      return respond(200, { deleted: true }, event);
    }

    return respond(405, { error: 'Method not allowed' }, event);
  } catch (err) {
    console.error('users handler error:', err);
    return respond(500, { error: err.message }, event);
  }
};
