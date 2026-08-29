/**
 * routes/attendance_logs.js — Attendance management routes.
 */

const router = require('express').Router();
const pool = require('../db');
const { verifyToken } = require('../middleware/auth');

router.use(verifyToken);

// GET /attendance_logs
router.get('/', async (req, res) => {
  try {
    let result;
    if (req.caller.role === 'Admin') {
      result = await pool.query('SELECT * FROM attendance_logs ORDER BY created_at DESC');
    } else if (req.caller.role === 'Team Leader') {
      result = await pool.query(
        `SELECT al.* FROM attendance_logs al
         LEFT JOIN users u ON (al.employee_id = u.employee_id OR al.employee_id = u.id)
         WHERE al.employee_id = $1 OR al.employee_id = $2 OR u.manager_id = $3
         ORDER BY al.created_at DESC`,
        [req.caller.id, req.caller.employeeId || req.caller.id, req.caller.id]
      );
    } else {
      result = await pool.query(
        `SELECT * FROM attendance_logs
         WHERE employee_id = $1 OR employee_id = $2
         ORDER BY created_at DESC`,
        [req.caller.id, req.caller.employeeId || req.caller.id]
      );
    }
    return res.status(200).json(result.rows);
  } catch (err) {
    console.error('[attendance GET]', err);
    return res.status(500).json({ error: err.message });
  }
});

// POST /attendance_logs — insert, update, or delete_by_employee
router.post('/', async (req, res) => {
  const body = req.body || {};
  const action = req.query.action;

  try {
    if (action === 'delete_by_employee') {
      if (req.caller.role !== 'Admin') return res.status(403).json({ error: 'Forbidden' });
      await pool.query('DELETE FROM attendance_logs WHERE employee_id = $1', [body.employee_id]);
      return res.status(200).json({ deleted: true });
    }

    if (action === 'update' || body.eq_col) {
      const targetId = body.id || (body.eq_col === 'id' ? body.eq_val : null);
      const fields = [], values = [];
      let idx = 1;

      if (body.clock_in    !== undefined) { fields.push(`clock_in = $${idx++}`);    values.push(body.clock_in); }
      if (body.clock_out   !== undefined) { fields.push(`clock_out = $${idx++}`);   values.push(body.clock_out); }
      if (body.total_hours !== undefined) { fields.push(`total_hours = $${idx++}`); values.push(body.total_hours); }
      if (body.status      !== undefined) { fields.push(`status = $${idx++}`);      values.push(body.status); }

      if (fields.length > 0 && targetId) {
        values.push(targetId);
        await pool.query(`UPDATE attendance_logs SET ${fields.join(', ')} WHERE id = $${idx}`, values);
        return res.status(200).json({ success: true });
      }

      if (fields.length > 0 && body.employee_id && body.date) {
        values.push(body.employee_id, body.date);
        await pool.query(
          `UPDATE attendance_logs SET ${fields.join(', ')} WHERE employee_id = $${idx++} AND date = $${idx}`,
          values
        );
        return res.status(200).json({ success: true });
      }
    }

    const { id, employee_id, date, clock_in, clock_out, total_hours, status } = body;
    await pool.query(
      `INSERT INTO attendance_logs (id, employee_id, date, clock_in, clock_out, total_hours, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7)
       ON CONFLICT (id) DO UPDATE SET
         clock_in    = EXCLUDED.clock_in,
         clock_out   = EXCLUDED.clock_out,
         total_hours = EXCLUDED.total_hours,
         status      = EXCLUDED.status`,
      [id, employee_id, date, clock_in, clock_out, total_hours, status]
    );
    return res.status(200).json({ success: true });
  } catch (err) {
    console.error('[attendance POST]', err);
    return res.status(500).json({ error: err.message });
  }
});

// DELETE /attendance_logs?id=...
router.delete('/', async (req, res) => {
  if (req.caller.role !== 'Admin') return res.status(403).json({ error: 'Forbidden' });
  const id = req.query.id;
  if (!id) return res.status(400).json({ error: 'Missing id' });
  try {
    await pool.query('DELETE FROM attendance_logs WHERE id = $1', [id]);
    return res.status(200).json({ deleted: true });
  } catch (err) {
    console.error('[attendance DELETE]', err);
    return res.status(500).json({ error: err.message });
  }
});

module.exports = router;
