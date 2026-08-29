/**
 * routes/notifications.js — Notification management routes.
 */

const router = require('express').Router();
const pool = require('../db');
const { verifyToken } = require('../middleware/auth');

router.use(verifyToken);

// GET /notifications
router.get('/', async (req, res) => {
  try {
    let result;
    if (req.caller.role === 'Admin') {
      result = await pool.query('SELECT * FROM notifications ORDER BY created_at DESC');
    } else {
      result = await pool.query(
        'SELECT * FROM notifications WHERE user_id = $1 ORDER BY created_at DESC',
        [req.caller.id]
      );
    }
    return res.status(200).json(result.rows);
  } catch (err) {
    console.error('[notifications GET]', err);
    return res.status(500).json({ error: err.message });
  }
});

// POST /notifications — insert, mark_read, mark_all_read
router.post('/', async (req, res) => {
  const body = req.body || {};
  const action = req.query.action;

  try {
    if (action === 'mark_read') {
      const { id } = body;
      if (req.caller.role === 'Admin') {
        await pool.query('UPDATE notifications SET is_read = true WHERE id = $1', [id]);
      } else {
        await pool.query('UPDATE notifications SET is_read = true WHERE id = $1 AND user_id = $2', [id, req.caller.id]);
      }
      return res.status(200).json({ success: true });
    }

    if (action === 'mark_all_read') {
      const effectiveUserId = req.caller.role === 'Admin' ? (body.user_id || req.caller.id) : req.caller.id;
      await pool.query('UPDATE notifications SET is_read = true WHERE user_id = $1', [effectiveUserId]);
      return res.status(200).json({ success: true });
    }

    const { id, user_id, title, message, type, is_read } = body;
    await pool.query(
      `INSERT INTO notifications (id, user_id, title, message, type, is_read)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [id, user_id, title, message, type, is_read ?? false]
    );
    return res.status(200).json({ success: true });
  } catch (err) {
    console.error('[notifications POST]', err);
    return res.status(500).json({ error: err.message });
  }
});

// DELETE /notifications?action=delete_by_user or ?id=...
router.delete('/', async (req, res) => {
  const body = req.body || {};
  const action = req.query.action;

  try {
    if (action === 'delete_by_user') {
      const effectiveUserId = req.caller.role === 'Admin' ? (body.user_id || req.caller.id) : req.caller.id;
      await pool.query('DELETE FROM notifications WHERE user_id = $1', [effectiveUserId]);
      return res.status(200).json({ deleted: true });
    }

    const id = req.query.id;
    if (!id) return res.status(400).json({ error: 'Missing id' });
    if (req.caller.role === 'Admin') {
      await pool.query('DELETE FROM notifications WHERE id = $1', [id]);
    } else {
      await pool.query('DELETE FROM notifications WHERE id = $1 AND user_id = $2', [id, req.caller.id]);
    }
    return res.status(200).json({ deleted: true });
  } catch (err) {
    console.error('[notifications DELETE]', err);
    return res.status(500).json({ error: err.message });
  }
});

module.exports = router;
