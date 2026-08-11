/**
 * routes/audit_logs.js — Audit trail routes.
 * Admin-only for GET. All authenticated users can POST log entries.
 */

const router = require('express').Router();
const pool = require('../db');
const { verifyToken } = require('../middleware/auth');

router.use(verifyToken);

// GET /audit_logs — Admin only
router.get('/', async (req, res) => {
  if (req.caller.role !== 'Admin') return res.status(403).json({ error: 'Forbidden' });
  try {
    const result = await pool.query('SELECT * FROM audit_logs ORDER BY created_at DESC');
    return res.status(200).json(result.rows);
  } catch (err) {
    console.error('[audit GET]', err);
    return res.status(500).json({ error: err.message });
  }
});

// POST /audit_logs — Insert a log entry
router.post('/', async (req, res) => {
  const { id, user_id, username, action, details, ip_address } = req.body || {};
  try {
    await pool.query(
      `INSERT INTO audit_logs (id, user_id, username, action, details, ip_address)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [id, user_id || null, username || '', action, details, ip_address || req.ip || '']
    );
    return res.status(200).json({ success: true });
  } catch (err) {
    console.error('[audit POST]', err);
    return res.status(500).json({ error: err.message });
  }
});

module.exports = router;
