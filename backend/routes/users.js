/**
 * routes/users.js — User management routes.
 *
 * GET  /users                        — List users (Admin: all; Employee: scoped)
 * POST /users                        — Upsert user (Admin only)
 * POST /users?action=set_password    — Reset any user's password (Admin only)
 * POST /users?action=delete_in       — Batch delete users (Admin only)
 * DELETE /users?id=...               — Delete single user (Admin only)
 */

const router = require('express').Router();
const bcrypt = require('bcryptjs');
const pool = require('../db');
const { verifyToken } = require('../middleware/auth');

router.use(verifyToken);

// GET /users
router.get('/', async (req, res) => {
  try {
    let result;
    if (req.caller.role === 'Admin') {
      result = await pool.query(
        `SELECT id, username, full_name, email, employee_id, department,
                designation, phone_number, joining_date, role, status,
                intern_type, manager_id, created_at, updated_at
         FROM users ORDER BY created_at DESC`
      );
    } else {
      // Non-admin: full own record, sanitized directory for others
      result = await pool.query(
        `SELECT id, username, full_name, designation, department, role, status,
                intern_type, manager_id, employee_id, created_at, updated_at,
                CASE WHEN id = $1 THEN email        ELSE NULL END AS email,
                CASE WHEN id = $1 THEN phone_number ELSE NULL END AS phone_number,
                CASE WHEN id = $1 THEN joining_date ELSE NULL END AS joining_date
         FROM users ORDER BY created_at DESC`,
        [req.caller.id]
      );
    }
    return res.status(200).json(result.rows);
  } catch (err) {
    console.error('[users GET]', err);
    return res.status(500).json({ error: err.message });
  }
});

// POST /users
router.post('/', async (req, res) => {
  if (req.caller.role !== 'Admin') {
    return res.status(403).json({ error: 'Forbidden: Admin access required.' });
  }

  const body = req.body || {};
  const action = req.query.action;

  try {
    // Admin set password
    if (action === 'set_password') {
      const { user_id, new_password } = body;
      if (!user_id || !new_password) return res.status(400).json({ error: 'user_id and new_password are required.' });
      if (new_password.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters.' });
      const hashed = await bcrypt.hash(new_password, 10);
      const result = await pool.query(
        'UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2 RETURNING id, username',
        [hashed, user_id]
      );
      if (result.rowCount === 0) return res.status(404).json({ error: 'User not found.' });
      return res.status(200).json({ success: true });
    }

    // Batch delete
    if (action === 'delete_in') {
      const { ids } = body;
      if (!ids || !ids.length) return res.status(200).json({ deleted: 0 });
      const placeholders = ids.map((_, i) => `$${i + 1}`).join(', ');
      const result = await pool.query(`DELETE FROM users WHERE id IN (${placeholders})`, ids);
      return res.status(200).json({ deleted: result.rowCount });
    }

    // Upsert
    const {
      id, username, password_hash, full_name, email, employee_id,
      department, designation, phone_number, joining_date,
      role, status, intern_type, manager_id
    } = body;

    let finalHash = password_hash || '';
    if (finalHash && !finalHash.startsWith('$2b$') && !finalHash.startsWith('$2a$')) {
      finalHash = await bcrypt.hash(finalHash, 10);
    }

    if (id) {
      const existing = await pool.query('SELECT password_hash FROM users WHERE id = $1', [id]);
      if (existing.rows.length > 0 && !password_hash) {
        finalHash = existing.rows[0].password_hash;
      }
    }

    if (!finalHash) finalHash = await bcrypt.hash('Pass@123', 10);

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
    return res.status(200).json({ success: true });
  } catch (err) {
    console.error('[users POST]', err);
    return res.status(500).json({ error: err.message });
  }
});

// DELETE /users?id=...
router.delete('/', async (req, res) => {
  if (req.caller.role !== 'Admin') return res.status(403).json({ error: 'Forbidden: Admin access required.' });
  const id = req.query.id;
  if (!id) return res.status(400).json({ error: 'Missing id' });
  try {
    await pool.query('DELETE FROM users WHERE id = $1', [id]);
    return res.status(200).json({ deleted: true });
  } catch (err) {
    console.error('[users DELETE]', err);
    return res.status(500).json({ error: err.message });
  }
});

module.exports = router;
