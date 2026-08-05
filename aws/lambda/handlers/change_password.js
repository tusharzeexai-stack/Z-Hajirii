/**
 * change_password.js — Lambda handler for POST /auth/change-password
 *
 * Accepts: { old_password, new_password }
 * Requires: valid JWT in Authorization header
 * Verifies old password server-side, updates hash in DB.
 */

const bcrypt = require('bcryptjs');
const { getPool } = require('../db');
const { respond, parseBody, verifyToken } = require('../utils');

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return respond(200, { ok: true }, event);

  if (event.httpMethod !== 'POST') return respond(405, { error: 'Method not allowed' }, event);

  // JWT Guard
  const caller = verifyToken(event);
  if (!caller) return respond(401, { error: 'Unauthorized' }, event);

  const { old_password, new_password } = parseBody(event.body);

  if (!old_password || !new_password) {
    return respond(400, { error: 'old_password and new_password are required.' }, event);
  }

  if (new_password.length < 8) {
    return respond(400, { error: 'New password must be at least 8 characters.' }, event);
  }

  try {
    const pool = await getPool();

    // Fetch current hash
    const result = await pool.query(
      'SELECT password_hash FROM users WHERE id = $1 LIMIT 1',
      [caller.id]
    );

    if (result.rows.length === 0) {
      return respond(404, { error: 'User not found.' }, event);
    }

    const currentHash = result.rows[0].password_hash;
    const oldMatches = await bcrypt.compare(old_password, currentHash);

    if (!oldMatches) {
      return respond(401, { error: 'Incorrect current password.' }, event);
    }

    const newHash = await bcrypt.hash(new_password, 10);
    await pool.query(
      'UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2',
      [newHash, caller.id]
    );

    return respond(200, { success: true }, event);
  } catch (err) {
    console.error('change-password error:', err);
    return respond(500, { error: 'Internal server error.' }, event);
  }
};
