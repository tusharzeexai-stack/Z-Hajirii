/**
 * routes/chat_messages.js — Team chat routes.
 */

const router = require('express').Router();
const pool = require('../db');
const { verifyToken } = require('../middleware/auth');

router.use(verifyToken);

// GET /chat_messages
router.get('/', async (req, res) => {
  try {
    let result;
    if (req.caller.role === 'Admin') {
      result = await pool.query('SELECT * FROM chat_messages ORDER BY created_at ASC');
    } else {
      result = await pool.query(
        `SELECT * FROM chat_messages
         WHERE sender_id = $1 OR receiver_id = $1
         ORDER BY created_at ASC`,
        [req.caller.id]
      );
    }
    return res.status(200).json(result.rows);
  } catch (err) {
    console.error('[chat GET]', err);
    return res.status(500).json({ error: err.message });
  }
});

// POST /chat_messages
router.post('/', async (req, res) => {
  const { id, sender_id, receiver_id, message, created_at } = req.body || {};
  // Prevent sender ID spoofing
  const effectiveSenderId = req.caller.role === 'Admin' ? sender_id : req.caller.id;

  try {
    await pool.query(
      `INSERT INTO chat_messages (id, sender_id, receiver_id, message, created_at)
       VALUES ($1,$2,$3,$4,$5)`,
      [id, effectiveSenderId, receiver_id, message, created_at || new Date().toISOString()]
    );
    return res.status(200).json({ success: true });
  } catch (err) {
    console.error('[chat POST]', err);
    return res.status(500).json({ error: err.message });
  }
});

module.exports = router;
