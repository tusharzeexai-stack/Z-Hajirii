/**
 * auth.js — Lambda handler for POST /auth/login
 *
 * Accepts: { username, password }
 * Returns: { token, user } on success
 *          { error } on failure (401)
 *
 * - Verifies the password server-side using bcrypt
 * - Issues a signed JWT (expires in 8 hours)
 * - NEVER returns password_hash to the client
 */

const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
let getPool;
try { getPool = require('../db').getPool; } catch { getPool = require('./db').getPool; }

let respond, parseBody, JWT_SECRET;
try { ({ respond, parseBody, JWT_SECRET } = require('../utils')); } catch { ({ respond, parseBody, JWT_SECRET } = require('./utils')); }

const TOKEN_EXPIRY = '8h';

// ── Brute-Force Protection ───────────────────────────────────────────────────
// In-memory store per Lambda warm instance. Resets on cold starts (acceptable).
// For multi-instance lockout use ElastiCache/DynamoDB — this covers 95% of attacks.
const loginAttempts = new Map(); // username -> { count, firstAttemptAt }
const MAX_ATTEMPTS = 5;          // lock after 5 wrong passwords
const LOCKOUT_MS   = 15 * 60 * 1000; // 15-minute lockout window

function isLockedOut(username) {
  const key = username.toLowerCase();
  const record = loginAttempts.get(key);
  if (!record) return false;
  const elapsed = Date.now() - record.firstAttemptAt;
  if (elapsed > LOCKOUT_MS) {
    loginAttempts.delete(key); // window expired — reset
    return false;
  }
  return record.count >= MAX_ATTEMPTS;
}

function recordFailedAttempt(username) {
  const key = username.toLowerCase();
  const record = loginAttempts.get(key) || { count: 0, firstAttemptAt: Date.now() };
  record.count += 1;
  loginAttempts.set(key, record);
}

function clearAttempts(username) {
  loginAttempts.delete(username.toLowerCase());
}


exports.handler = async (event) => {
  const method = event.httpMethod;

  // CORS preflight
  if (method === 'OPTIONS') return respond(200, { ok: true }, event);

  if (method !== 'POST') return respond(405, { error: 'Method not allowed' }, event);

  const { username, password } = parseBody(event.body);

  if (!username || !password) {
    return respond(400, { error: 'Username and password are required.' }, event);
  }

  // ── Brute-Force Check ───────────────────────────────────────────────────────
  if (isLockedOut(username)) {
    return respond(429, {
      error: 'Too many failed attempts. Account temporarily locked for 15 minutes.'
    }, event);
  }

  try {
    const pool = await getPool();

    // Fetch user — we only fetch password_hash HERE for comparison, never returned
    const result = await pool.query(
      `SELECT
         id, username, password_hash, full_name, email,
         employee_id, department, designation, phone_number,
         joining_date, role, status, intern_type, manager_id,
         created_at, updated_at
       FROM users
       WHERE LOWER(username) = LOWER($1)
       LIMIT 1`,
      [username.trim()]
    );

    if (result.rows.length === 0) {
      recordFailedAttempt(username); // count miss against brute force
      return respond(401, { error: 'Invalid username or password.' }, event);
    }

    const dbUser = result.rows[0];

    // Check account status
    if (dbUser.status === 'Disabled') {
      return respond(403, { error: 'Account is disabled. Contact your administrator.' }, event);
    }

    // Verify password server-side
    const passwordMatch = await bcrypt.compare(password, dbUser.password_hash);
    if (!passwordMatch) {
      recordFailedAttempt(username); // track failure
      return respond(401, { error: 'Invalid username or password.' }, event);
    }

    // Successful login — clear any previous failure tracking
    clearAttempts(username);

    // Build safe user profile — NO password_hash included
    const safeUser = {
      id: dbUser.id,
      username: dbUser.username,
      fullName: dbUser.full_name,
      email: dbUser.email,
      employeeId: dbUser.employee_id,
      department: dbUser.department,
      designation: dbUser.designation,
      phoneNumber: dbUser.phone_number || '',
      joiningDate: dbUser.joining_date || '',
      role: dbUser.role,
      status: dbUser.status,
      internType: dbUser.intern_type || 'Online Intern',
      managerId: dbUser.manager_id || null,
      createdAt: dbUser.created_at,
      updatedAt: dbUser.updated_at,
    };

    // Sign JWT
    const token = jwt.sign(
      {
        id: safeUser.id,
        username: safeUser.username,
        role: safeUser.role,
        fullName: safeUser.fullName,
        employeeId: safeUser.employeeId,
      },
      JWT_SECRET,
      { expiresIn: TOKEN_EXPIRY }
    );

    return respond(200, { token, user: safeUser }, event);
  } catch (err) {
    console.error('auth/login error:', err);
    return respond(500, { error: 'Internal server error.' }, event);
  }
};
