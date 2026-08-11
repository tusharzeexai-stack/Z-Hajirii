/**
 * users.js — Lambda handler for /users resource.
 * Supports: GET (list), POST (upsert), DELETE (by id or IN list)
 *
 * Security:
 *  - All routes require a valid JWT (Authorization: Bearer <token>)
 *  - GET /users NEVER returns password_hash — safe profiles only
 */
const bcrypt = require('bcryptjs');
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
        // Admin gets full user management records (password_hash stripped)
        result = await pool.query(
          `SELECT id, username, full_name, email, employee_id, department,
                  designation, phone_number, joining_date, role, status,
                  intern_type, manager_id, created_at, updated_at
           FROM users
           ORDER BY created_at DESC`
        );
      } else {
        // Non-admin (Employee / Team Leader): Return full details for caller's own record,
        // and safe sanitized directory projection for others (masking private phone/email)
        result = await pool.query(
          `SELECT id, username, full_name, designation, department, role, status,
                  intern_type, manager_id, employee_id, created_at, updated_at,
                  CASE WHEN id = $1 THEN email ELSE NULL END AS email,
                  CASE WHEN id = $1 THEN phone_number ELSE NULL END AS phone_number,
                  CASE WHEN id = $1 THEN joining_date ELSE NULL END AS joining_date
           FROM users
           ORDER BY created_at DESC`,
          [caller.id]
        );
      }
      return respond(200, result.rows, event);
    }

    if (method === 'POST') {
      const body = parseBody(event.body);
      const action = event.queryStringParameters?.action;

      // Only Admin can perform write operations
      if (caller.role !== 'Admin') {
        return respond(403, { error: 'Forbidden: Admin access required.' }, event);
      }

      // ── Admin Set Password (bcrypt-hashes on server) ─────────────────────
      if (action === 'set_password') {
        const { user_id, new_password } = body;
        if (!user_id || !new_password) {
          return respond(400, { error: 'user_id and new_password are required.' }, event);
        }
        if (new_password.length < 6) {
          return respond(400, { error: 'Password must be at least 6 characters.' }, event);
        }
        const hashed = await bcrypt.hash(new_password, 10);
        const result = await pool.query(
          `UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2 RETURNING id, username`,
          [hashed, user_id]
        );
        if (result.rowCount === 0) {
          return respond(404, { error: 'User not found.' }, event);
        }
        console.log(`[admin] Password reset for user: ${result.rows[0].username}`);
        return respond(200, { success: true }, event);
      }

      // ── Batch delete (prune users) ────────────────────────────────────────
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

      // ── Password safety: always ensure stored hash is bcrypt ───────────────
      let finalHash = password_hash || '';
      if (finalHash && !finalHash.startsWith('$2b$') && !finalHash.startsWith('$2a$')) {
        // Plaintext was passed — hash it now (covers legacy & Admin dashboard path)
        finalHash = await bcrypt.hash(finalHash, 10);
      }

      if (id) {
        // Check if this is an UPDATE (user exists). If no password supplied, keep existing hash.
        const existing = await pool.query('SELECT password_hash FROM users WHERE id = $1', [id]);
        if (existing.rows.length > 0 && !password_hash) {
          // Editing existing user but no new password given → preserve old hash
          finalHash = existing.rows[0].password_hash;
        } else if (existing.rows.length > 0 && !finalHash) {
          finalHash = existing.rows[0].password_hash;
        }
      }

      // Fall back to hashed default 'Pass@123' for brand-new users with no password
      if (!finalHash) {
        finalHash = await bcrypt.hash('Pass@123', 10);
      }

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
        [id, username, finalHash, full_name, email, employee_id,
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
