/**
 * routes/leave_requests.js — Leave request management routes.
 */

const router = require('express').Router();
const pool = require('../db');
const { verifyToken } = require('../middleware/auth');

router.use(verifyToken);

// GET /leave_requests
router.get('/', async (req, res) => {
  try {
    let result;
    if (req.caller.role === 'Admin') {
      result = await pool.query('SELECT * FROM leave_requests ORDER BY created_at DESC');
    } else if (req.caller.role === 'Team Leader') {
      result = await pool.query(
        `SELECT lr.* FROM leave_requests lr
         LEFT JOIN users u ON lr.user_id = u.id
         WHERE lr.user_id = $1 OR u.manager_id = $1
         ORDER BY lr.created_at DESC`,
        [req.caller.id]
      );
    } else {
      result = await pool.query(
        'SELECT * FROM leave_requests WHERE user_id = $1 ORDER BY created_at DESC',
        [req.caller.id]
      );
    }
    return res.status(200).json(result.rows);
  } catch (err) {
    console.error('[leave GET]', err);
    return res.status(500).json({ error: err.message });
  }
});

// POST /leave_requests
router.post('/', async (req, res) => {
  const {
    id, user_id, leave_type, from_date, to_date, total_days,
    reason, description, attachment, status,
    admin_comment, approved_by, approved_at
  } = req.body || {};

  // Ownership check
  if (req.caller.role !== 'Admin') {
    try {
      if (req.caller.role === 'Team Leader') {
        const targetUser = await pool.query('SELECT manager_id FROM users WHERE id = $1', [user_id]);
        const isManaged = targetUser.rows.length > 0 && targetUser.rows[0].manager_id === req.caller.id;
        if (user_id !== req.caller.id && !isManaged) {
          return res.status(403).json({ error: 'Forbidden' });
        }
      } else if (user_id !== req.caller.id) {
        return res.status(403).json({ error: 'Forbidden' });
      }
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  try {
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
    return res.status(200).json({ success: true });
  } catch (err) {
    console.error('[leave POST]', err);
    return res.status(500).json({ error: err.message });
  }
});

// DELETE /leave_requests?id=...
router.delete('/', async (req, res) => {
  const id = req.query.id;
  if (!id) return res.status(400).json({ error: 'Missing id' });

  try {
    if (req.caller.role !== 'Admin') {
      const leaveRes = await pool.query('SELECT user_id FROM leave_requests WHERE id = $1', [id]);
      if (leaveRes.rows.length > 0 && leaveRes.rows[0].user_id !== req.caller.id) {
        return res.status(403).json({ error: 'Forbidden' });
      }
    }
    await pool.query('DELETE FROM leave_requests WHERE id = $1', [id]);
    return res.status(200).json({ deleted: true });
  } catch (err) {
    console.error('[leave DELETE]', err);
    return res.status(500).json({ error: err.message });
  }
});

module.exports = router;
