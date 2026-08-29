/**
 * routes/employees.js — Employee CRUD routes.
 *
 * GET    /employees         — Fetch all employees
 * POST   /employees         — Insert / upsert / batch-delete / update
 * DELETE /employees?id=...  — Delete by ID (Admin only)
 */

const router = require('express').Router();
const pool = require('../db');
const { verifyToken } = require('../middleware/auth');

router.use(verifyToken);

// GET /employees
router.get('/', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM employees ORDER BY created_at DESC');
    return res.status(200).json(result.rows);
  } catch (err) {
    console.error('[employees GET]', err);
    return res.status(500).json({ error: err.message });
  }
});

// POST /employees  — handles upsert, update, batch-delete
router.post('/', async (req, res) => {
  const body = req.body || {};
  const action = req.query.action;

  try {
    // Batch delete
    if (action === 'delete_in') {
      if (req.caller.role !== 'Admin') return res.status(403).json({ error: 'Forbidden' });
      const { ids } = body;
      if (!ids || !ids.length) return res.status(200).json({ deleted: 0 });
      const placeholders = ids.map((_, i) => `$${i + 1}`).join(', ');
      await pool.query(`DELETE FROM employees WHERE id IN (${placeholders})`, ids);
      return res.status(200).json({ deleted: true });
    }

    // Partial update
    if (action === 'update' || body.eq_col) {
      const targetId = body.id || (body.eq_col === 'id' ? body.eq_val : null);
      const fields = [], values = [];
      let idx = 1;

      if (body.name       !== undefined) { fields.push(`name = $${idx++}`);       values.push(body.name); }
      if (body.role       !== undefined) { fields.push(`role = $${idx++}`);       values.push(body.role); }
      if (body.email      !== undefined) { fields.push(`email = $${idx++}`);      values.push(body.email); }
      if (body.avatar_url !== undefined) { fields.push(`avatar_url = $${idx++}`); values.push(body.avatar_url); }
      if (body.emp_id     !== undefined) { fields.push(`emp_id = $${idx++}`);     values.push(body.emp_id); }
      if (body.active_now !== undefined) { fields.push(`active_now = $${idx++}`); values.push(body.active_now); }

      if (fields.length > 0 && targetId) {
        values.push(targetId);
        await pool.query(`UPDATE employees SET ${fields.join(', ')} WHERE id = $${idx}`, values);
        return res.status(200).json({ success: true });
      }
    }

    // Upsert / insert
    if (req.caller.role !== 'Admin') return res.status(403).json({ error: 'Forbidden' });
    const { id, name, role, email, avatar_url, emp_id, active_now } = body;
    await pool.query(
      `INSERT INTO employees (id, name, role, email, avatar_url, emp_id, active_now)
       VALUES ($1,$2,$3,$4,$5,$6,$7)
       ON CONFLICT (id) DO UPDATE SET
         name       = EXCLUDED.name,
         role       = EXCLUDED.role,
         email      = EXCLUDED.email,
         avatar_url = EXCLUDED.avatar_url,
         emp_id     = EXCLUDED.emp_id,
         active_now = EXCLUDED.active_now`,
      [id, name, role, email, avatar_url, emp_id, active_now]
    );
    return res.status(200).json({ success: true });
  } catch (err) {
    console.error('[employees POST]', err);
    return res.status(500).json({ error: err.message });
  }
});

// DELETE /employees?id=...
router.delete('/', async (req, res) => {
  if (req.caller.role !== 'Admin') return res.status(403).json({ error: 'Forbidden' });
  const id = req.query.id;
  if (!id) return res.status(400).json({ error: 'Missing id' });
  try {
    await pool.query('DELETE FROM employees WHERE id = $1', [id]);
    return res.status(200).json({ deleted: true });
  } catch (err) {
    console.error('[employees DELETE]', err);
    return res.status(500).json({ error: err.message });
  }
});

module.exports = router;
