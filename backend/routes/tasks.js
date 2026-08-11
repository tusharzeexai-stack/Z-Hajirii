/**
 * routes/tasks.js — Task management routes.
 *
 * GET    /tasks         — Fetch tasks (role-scoped: Admin=all, TL=team, Emp=own)
 * POST   /tasks         — Upsert task (with attachment validation & ownership checks)
 * DELETE /tasks?id=...  — Delete task (with ownership enforcement)
 */

const router = require('express').Router();
const pool = require('../db');
const { verifyToken } = require('../middleware/auth');

router.use(verifyToken);

// GET /tasks
router.get('/', async (req, res) => {
  try {
    let result;
    if (req.caller.role === 'Admin') {
      result = await pool.query('SELECT * FROM tasks ORDER BY created_at DESC');
    } else if (req.caller.role === 'Team Leader') {
      result = await pool.query(
        `SELECT t.* FROM tasks t
         LEFT JOIN users u ON t.user_id = u.id
         WHERE t.user_id = $1 OR u.manager_id = $1
         ORDER BY t.created_at DESC`,
        [req.caller.id]
      );
    } else {
      result = await pool.query(
        'SELECT * FROM tasks WHERE user_id = $1 ORDER BY created_at DESC',
        [req.caller.id]
      );
    }
    return res.status(200).json(result.rows);
  } catch (err) {
    console.error('[tasks GET]', err);
    return res.status(500).json({ error: err.message });
  }
});

// POST /tasks
router.post('/', async (req, res) => {
  const { id, user_id, title, description, priority, deadline, status, attachment, completed_at, file_type, file_size } = req.body || {};

  // File upload security
  if (attachment) {
    if (file_size && file_size > 5 * 1024 * 1024) {
      return res.status(400).json({ error: 'Attachment exceeds maximum allowed size of 5MB.' });
    }
    const ALLOWED_MIME = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
    if (file_type && !ALLOWED_MIME.includes(file_type.toLowerCase())) {
      return res.status(400).json({ error: 'Invalid file type. Only PDF and images (JPEG, PNG, WEBP) are allowed.' });
    }
  }

  // Ownership check for non-admins
  if (req.caller.role !== 'Admin') {
    try {
      if (req.caller.role === 'Team Leader') {
        const targetUser = await pool.query('SELECT manager_id FROM users WHERE id = $1', [user_id]);
        const isManaged = targetUser.rows.length > 0 && targetUser.rows[0].manager_id === req.caller.id;
        if (user_id !== req.caller.id && !isManaged) {
          return res.status(403).json({ error: 'Forbidden: Cannot create/edit tasks for unmanaged users.' });
        }
      } else if (user_id !== req.caller.id) {
        return res.status(403).json({ error: 'Forbidden: Cannot create/edit tasks for other users.' });
      }
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  try {
    await pool.query(
      `INSERT INTO tasks (id, user_id, title, description, priority, deadline, status, attachment, completed_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       ON CONFLICT (id) DO UPDATE SET
         title        = EXCLUDED.title,
         description  = EXCLUDED.description,
         priority     = EXCLUDED.priority,
         deadline     = EXCLUDED.deadline,
         status       = EXCLUDED.status,
         attachment   = EXCLUDED.attachment,
         completed_at = EXCLUDED.completed_at`,
      [id, user_id, title, description, priority, deadline, status, attachment || null, completed_at || null]
    );
    return res.status(200).json({ success: true });
  } catch (err) {
    console.error('[tasks POST]', err);
    return res.status(500).json({ error: err.message });
  }
});

// DELETE /tasks?id=...
router.delete('/', async (req, res) => {
  const id = req.query.id;
  if (!id) return res.status(400).json({ error: 'Missing id' });

  try {
    if (req.caller.role !== 'Admin') {
      const taskRes = await pool.query(
        `SELECT t.user_id, u.manager_id FROM tasks t
         LEFT JOIN users u ON t.user_id = u.id
         WHERE t.id = $1`,
        [id]
      );
      if (taskRes.rows.length > 0) {
        const t = taskRes.rows[0];
        if (t.user_id !== req.caller.id && t.manager_id !== req.caller.id) {
          return res.status(403).json({ error: 'Forbidden' });
        }
      }
    }

    await pool.query('DELETE FROM tasks WHERE id = $1', [id]);
    return res.status(200).json({ deleted: true });
  } catch (err) {
    console.error('[tasks DELETE]', err);
    return res.status(500).json({ error: err.message });
  }
});

module.exports = router;
