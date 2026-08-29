/**
 * server/index.js
 * Express.js Backend Server for Z-Hajirii Attendance & Management System (ES Module).
 */

import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { getPool, isPostgres, memoryStore } from './db.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;
const JWT_SECRET = process.env.JWT_SECRET || 'zhajirii-secret-key-2026';

app.use(cors());
app.use(express.json());

// ── Health Check ─────────────────────────────────────────────────────────────
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    mode: isPostgres() ? 'PostgreSQL' : 'In-Memory Fallback',
    timestamp: new Date().toISOString(),
  });
});

// ── AUTH ROUTES ───────────────────────────────────────────────────────────────

// POST /auth/login
app.post('/auth/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required.' });
    }

    let user = null;

    if (isPostgres()) {
      const pool = await getPool();
      const result = await pool.query(
        'SELECT * FROM users WHERE LOWER(username) = LOWER($1) AND status = $2',
        [username.trim(), 'active']
      );
      user = result.rows[0] || null;
    } else {
      user = memoryStore.users.find(
        (u) => u.username.toLowerCase() === username.trim().toLowerCase() && u.status === 'active'
      ) || null;
    }

    if (!user) {
      return res.status(401).json({ error: 'Invalid username or password.' });
    }

    // Verify password against stored hash
    const isValid = await bcrypt.compare(password, user.password_hash);
    if (!isValid) {
      return res.status(401).json({ error: 'Invalid username or password.' });
    }

    // Issue JWT token (24 hour expiry)
    const token = jwt.sign(
      { id: user.id, username: user.username, role: user.role },
      JWT_SECRET,
      { expiresIn: '24h' }
    );

    // Never return password_hash to client
    const { password_hash: _ph, ...safeUser } = user;

    return res.json({ token, user: safeUser });
  } catch (err) {
    console.error('[auth/login] Error:', err.message);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// POST /auth/change-password
app.post('/auth/change-password', async (req, res) => {
  try {
    const { old_password, new_password } = req.body;
    const authHeader = req.headers['authorization'] || '';
    const token = authHeader.replace('Bearer ', '').trim();

    if (!token) return res.status(401).json({ error: 'Unauthorized.' });

    let decoded;
    try {
      decoded = jwt.verify(token, JWT_SECRET);
    } catch {
      return res.status(401).json({ error: 'Invalid or expired token.' });
    }

    let user = null;
    if (isPostgres()) {
      const pool = await getPool();
      const result = await pool.query('SELECT * FROM users WHERE id = $1', [decoded.id]);
      user = result.rows[0] || null;
    } else {
      user = memoryStore.users.find((u) => u.id === decoded.id) || null;
    }

    if (!user) return res.status(404).json({ error: 'User not found.' });

    const isValid = await bcrypt.compare(old_password, user.password_hash);
    if (!isValid) return res.status(401).json({ error: 'Current password is incorrect.' });

    const newHash = await bcrypt.hash(new_password, 12);

    if (isPostgres()) {
      const pool = await getPool();
      await pool.query(
        'UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2',
        [newHash, user.id]
      );
    } else {
      const idx = memoryStore.users.findIndex((u) => u.id === user.id);
      if (idx >= 0) memoryStore.users[idx].password_hash = newHash;
    }

    return res.json({ success: true });
  } catch (err) {
    console.error('[auth/change-password] Error:', err.message);
    res.status(500).json({ error: 'Internal server error.' });
  }
});



// ── 1. EMPLOYEES ─────────────────────────────────────────────────────────────
app.get('/employees', async (req, res) => {
  try {
    if (isPostgres()) {
      const pool = await getPool();
      const result = await pool.query('SELECT * FROM employees ORDER BY created_at DESC');
      return res.json(result.rows);
    }
    const employees = [...memoryStore.employees].sort(
      (a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0)
    );
    res.json(employees);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/employees', async (req, res) => {
  try {
    const { id, name, role, email, avatar_url, emp_id, active_now } = req.body;
    if (isPostgres()) {
      const pool = await getPool();
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
        [id, name, role, email, avatar_url, emp_id, active_now ?? true]
      );
      return res.json({ success: true });
    }

    const idx = memoryStore.employees.findIndex((e) => e.id === id);
    const empData = {
      id,
      name,
      role,
      email,
      avatar_url,
      emp_id,
      active_now: active_now ?? true,
      created_at: idx >= 0 ? memoryStore.employees[idx].created_at : new Date().toISOString(),
    };
    if (idx >= 0) {
      memoryStore.employees[idx] = empData;
    } else {
      memoryStore.employees.push(empData);
    }
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/employees', async (req, res) => {
  try {
    const id = req.query.id;
    if (!id) return res.status(400).json({ error: 'Missing id' });

    if (isPostgres()) {
      const pool = await getPool();
      await pool.query('DELETE FROM employees WHERE id = $1', [id]);
      return res.json({ deleted: true });
    }

    memoryStore.employees = memoryStore.employees.filter((e) => e.id !== id);
    res.json({ deleted: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── 2. USERS ─────────────────────────────────────────────────────────────────
app.get('/users', async (req, res) => {
  try {
    if (isPostgres()) {
      const pool = await getPool();
      const result = await pool.query('SELECT * FROM users ORDER BY created_at DESC');
      return res.json(result.rows);
    }
    const users = [...memoryStore.users].sort(
      (a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0)
    );
    res.json(users);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/users', async (req, res) => {
  try {
    const action = req.query.action;
    const body = req.body;

    if (action === 'delete_in') {
      const ids = body.ids || [];
      if (!ids.length) return res.json({ deleted: 0 });

      if (isPostgres()) {
        const pool = await getPool();
        const placeholders = ids.map((_, i) => `$${i + 1}`).join(', ');
        const result = await pool.query(`DELETE FROM users WHERE id IN (${placeholders})`, ids);
        return res.json({ deleted: result.rowCount });
      }

      const initialLen = memoryStore.users.length;
      memoryStore.users = memoryStore.users.filter((u) => !ids.includes(u.id));
      return res.json({ deleted: initialLen - memoryStore.users.length });
    }

    // Upsert User
    const {
      id, username, password_hash, full_name, email, employee_id,
      department, designation, phone_number, joining_date,
      role, status, intern_type, manager_id
    } = body;

    if (isPostgres()) {
      const pool = await getPool();
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
        [id, username, password_hash, full_name, email, employee_id,
         department, designation, phone_number, joining_date,
         role, status, intern_type, manager_id]
      );
      return res.json({ success: true });
    }

    const idx = memoryStore.users.findIndex((u) => u.id === id);
    const userData = {
      id, username, password_hash, full_name, email, employee_id,
      department, designation, phone_number, joining_date,
      role, status, intern_type, manager_id,
      created_at: idx >= 0 ? memoryStore.users[idx].created_at : new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    if (idx >= 0) {
      memoryStore.users[idx] = userData;
    } else {
      memoryStore.users.push(userData);
    }
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/users', async (req, res) => {
  try {
    const id = req.query.id;
    if (!id) return res.status(400).json({ error: 'Missing id' });

    if (isPostgres()) {
      const pool = await getPool();
      await pool.query('DELETE FROM users WHERE id = $1', [id]);
      return res.json({ deleted: true });
    }

    memoryStore.users = memoryStore.users.filter((u) => u.id !== id);
    res.json({ deleted: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── 3. ATTENDANCE LOGS ───────────────────────────────────────────────────────
app.get('/attendance_logs', async (req, res) => {
  try {
    if (isPostgres()) {
      const pool = await getPool();
      const result = await pool.query('SELECT * FROM attendance_logs ORDER BY created_at DESC');
      return res.json(result.rows);
    }
    const logs = [...memoryStore.attendance_logs].sort(
      (a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0)
    );
    res.json(logs);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/attendance_logs', async (req, res) => {
  try {
    const action = req.query.action;
    const body = req.body;

    if (action === 'delete_by_employee') {
      const { employee_id } = body;
      if (isPostgres()) {
        const pool = await getPool();
        await pool.query('DELETE FROM attendance_logs WHERE employee_id = $1', [employee_id]);
        return res.json({ deleted: true });
      }
      memoryStore.attendance_logs = memoryStore.attendance_logs.filter((a) => a.employee_id !== employee_id);
      return res.json({ deleted: true });
    }

    if (action === 'update' || body.eq_col) {
      const targetId = body.id || (body.eq_col === 'id' ? body.eq_val : null);
      if (isPostgres()) {
        const pool = await getPool();
        const fields = [];
        const values = [];
        let idx = 1;
        if (body.clock_in !== undefined) { fields.push(`clock_in = $${idx++}`); values.push(body.clock_in); }
        if (body.clock_out !== undefined) { fields.push(`clock_out = $${idx++}`); values.push(body.clock_out); }
        if (body.total_hours !== undefined) { fields.push(`total_hours = $${idx++}`); values.push(body.total_hours); }
        if (body.status !== undefined) { fields.push(`status = $${idx++}`); values.push(body.status); }

        if (fields.length > 0 && targetId) {
          values.push(targetId);
          await pool.query(`UPDATE attendance_logs SET ${fields.join(', ')} WHERE id = $${idx}`, values);
          return res.json({ success: true });
        }
        if (fields.length > 0 && body.employee_id && body.date) {
          values.push(body.employee_id, body.date);
          await pool.query(`UPDATE attendance_logs SET ${fields.join(', ')} WHERE employee_id = $${idx++} AND date = $${idx}`, values);
          return res.json({ success: true });
        }
      } else {
        const itemIdx = memoryStore.attendance_logs.findIndex(
          (a) => a.id === targetId || (a.employee_id === body.employee_id && a.date === body.date)
        );
        if (itemIdx >= 0) {
          if (body.clock_in !== undefined) memoryStore.attendance_logs[itemIdx].clock_in = body.clock_in;
          if (body.clock_out !== undefined) memoryStore.attendance_logs[itemIdx].clock_out = body.clock_out;
          if (body.total_hours !== undefined) memoryStore.attendance_logs[itemIdx].total_hours = body.total_hours;
          if (body.status !== undefined) memoryStore.attendance_logs[itemIdx].status = body.status;
        }
        return res.json({ success: true });
      }
    }

    // Default Insert/Upsert
    const { id, employee_id, date, clock_in, clock_out, total_hours, status } = body;
    if (isPostgres()) {
      const pool = await getPool();
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
      return res.json({ success: true });
    }

    const idx = memoryStore.attendance_logs.findIndex((a) => a.id === id);
    const logData = {
      id, employee_id, date, clock_in, clock_out, total_hours, status,
      created_at: idx >= 0 ? memoryStore.attendance_logs[idx].created_at : new Date().toISOString(),
    };
    if (idx >= 0) {
      memoryStore.attendance_logs[idx] = logData;
    } else {
      memoryStore.attendance_logs.push(logData);
    }
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/attendance_logs', async (req, res) => {
  try {
    const id = req.query.id;
    if (!id) return res.status(400).json({ error: 'Missing id' });

    if (isPostgres()) {
      const pool = await getPool();
      await pool.query('DELETE FROM attendance_logs WHERE id = $1', [id]);
      return res.json({ deleted: true });
    }

    memoryStore.attendance_logs = memoryStore.attendance_logs.filter((a) => a.id !== id);
    res.json({ deleted: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── 4. TASKS ─────────────────────────────────────────────────────────────────
app.get('/tasks', async (req, res) => {
  try {
    if (isPostgres()) {
      const pool = await getPool();
      const result = await pool.query('SELECT * FROM tasks ORDER BY created_at DESC');
      return res.json(result.rows);
    }
    const tasks = [...memoryStore.tasks].sort(
      (a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0)
    );
    res.json(tasks);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/tasks', async (req, res) => {
  try {
    const { id, user_id, title, description, priority, deadline, status, attachment, completed_at } = req.body;
    if (isPostgres()) {
      const pool = await getPool();
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
        [id, user_id, title, description, priority, deadline, status, attachment, completed_at]
      );
      return res.json({ success: true });
    }

    const idx = memoryStore.tasks.findIndex((t) => t.id === id);
    const taskData = {
      id, user_id, title, description, priority, deadline, status, attachment, completed_at,
      created_at: idx >= 0 ? memoryStore.tasks[idx].created_at : new Date().toISOString(),
    };
    if (idx >= 0) {
      memoryStore.tasks[idx] = taskData;
    } else {
      memoryStore.tasks.push(taskData);
    }
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/tasks', async (req, res) => {
  try {
    const id = req.query.id;
    if (!id) return res.status(400).json({ error: 'Missing id' });

    if (isPostgres()) {
      const pool = await getPool();
      await pool.query('DELETE FROM tasks WHERE id = $1', [id]);
      return res.json({ deleted: true });
    }

    memoryStore.tasks = memoryStore.tasks.filter((t) => t.id !== id);
    res.json({ deleted: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── 5. LEAVE REQUESTS ────────────────────────────────────────────────────────
app.get('/leave_requests', async (req, res) => {
  try {
    if (isPostgres()) {
      const pool = await getPool();
      const result = await pool.query('SELECT * FROM leave_requests ORDER BY created_at DESC');
      return res.json(result.rows);
    }
    const leaves = [...memoryStore.leave_requests].sort(
      (a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0)
    );
    res.json(leaves);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/leave_requests', async (req, res) => {
  try {
    const {
      id, user_id, leave_type, from_date, to_date, total_days,
      reason, description, attachment, status, admin_comment, approved_by, approved_at
    } = req.body;

    if (isPostgres()) {
      const pool = await getPool();
      await pool.query(
        `INSERT INTO leave_requests
           (id, user_id, leave_type, from_date, to_date, total_days, reason, description, attachment, status, admin_comment, approved_by, approved_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
         ON CONFLICT (id) DO UPDATE SET
           status        = EXCLUDED.status,
           admin_comment = EXCLUDED.admin_comment,
           approved_by   = EXCLUDED.approved_by,
           approved_at   = EXCLUDED.approved_at`,
        [id, user_id, leave_type, from_date, to_date, total_days, reason, description, attachment, status, admin_comment, approved_by, approved_at]
      );
      return res.json({ success: true });
    }

    const idx = memoryStore.leave_requests.findIndex((l) => l.id === id);
    const leaveData = {
      id, user_id, leave_type, from_date, to_date, total_days,
      reason, description, attachment, status, admin_comment, approved_by, approved_at,
      created_at: idx >= 0 ? memoryStore.leave_requests[idx].created_at : new Date().toISOString(),
    };
    if (idx >= 0) {
      memoryStore.leave_requests[idx] = leaveData;
    } else {
      memoryStore.leave_requests.push(leaveData);
    }
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/leave_requests', async (req, res) => {
  try {
    const id = req.query.id;
    if (!id) return res.status(400).json({ error: 'Missing id' });

    if (isPostgres()) {
      const pool = await getPool();
      await pool.query('DELETE FROM leave_requests WHERE id = $1', [id]);
      return res.json({ deleted: true });
    }

    memoryStore.leave_requests = memoryStore.leave_requests.filter((l) => l.id !== id);
    res.json({ deleted: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── 6. NOTIFICATIONS ─────────────────────────────────────────────────────────
app.get('/notifications', async (req, res) => {
  try {
    if (isPostgres()) {
      const pool = await getPool();
      const result = await pool.query('SELECT * FROM notifications ORDER BY created_at DESC');
      return res.json(result.rows);
    }
    const notifs = [...memoryStore.notifications].sort(
      (a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0)
    );
    res.json(notifs);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/notifications', async (req, res) => {
  try {
    const action = req.query.action;
    const body = req.body;

    if (action === 'mark_read') {
      const { id } = body;
      if (isPostgres()) {
        const pool = await getPool();
        await pool.query('UPDATE notifications SET is_read = true WHERE id = $1', [id]);
        return res.json({ success: true });
      }
      const item = memoryStore.notifications.find((n) => n.id === id);
      if (item) item.is_read = true;
      return res.json({ success: true });
    }

    if (action === 'mark_all_read') {
      const { user_id } = body;
      if (isPostgres()) {
        const pool = await getPool();
        await pool.query('UPDATE notifications SET is_read = true WHERE user_id = $1', [user_id]);
        return res.json({ success: true });
      }
      memoryStore.notifications.forEach((n) => {
        if (n.user_id === user_id) n.is_read = true;
      });
      return res.json({ success: true });
    }

    const { id, user_id, title, message, type, is_read } = body;
    if (isPostgres()) {
      const pool = await getPool();
      await pool.query(
        `INSERT INTO notifications (id, user_id, title, message, type, is_read)
         VALUES ($1,$2,$3,$4,$5,$6)`,
        [id, user_id, title, message, type, is_read ?? false]
      );
      return res.json({ success: true });
    }

    memoryStore.notifications.push({
      id, user_id, title, message, type, is_read: is_read ?? false,
      created_at: new Date().toISOString(),
    });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/notifications', async (req, res) => {
  try {
    const action = req.query.action;
    const body = req.body || {};

    if (action === 'delete_by_user') {
      const user_id = body.user_id;
      if (isPostgres()) {
        const pool = await getPool();
        await pool.query('DELETE FROM notifications WHERE user_id = $1', [user_id]);
        return res.json({ deleted: true });
      }
      memoryStore.notifications = memoryStore.notifications.filter((n) => n.user_id !== user_id);
      return res.json({ deleted: true });
    }

    const id = req.query.id;
    if (!id) return res.status(400).json({ error: 'Missing id' });

    if (isPostgres()) {
      const pool = await getPool();
      await pool.query('DELETE FROM notifications WHERE id = $1', [id]);
      return res.json({ deleted: true });
    }

    memoryStore.notifications = memoryStore.notifications.filter((n) => n.id !== id);
    res.json({ deleted: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── 7. CHAT MESSAGES ─────────────────────────────────────────────────────────
app.get('/chat_messages', async (req, res) => {
  try {
    if (isPostgres()) {
      const pool = await getPool();
      const result = await pool.query('SELECT * FROM chat_messages ORDER BY created_at ASC');
      return res.json(result.rows);
    }
    const msgs = [...memoryStore.chat_messages].sort(
      (a, b) => new Date(a.created_at || 0) - new Date(b.created_at || 0)
    );
    res.json(msgs);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/chat_messages', async (req, res) => {
  try {
    const { id, sender_id, receiver_id, message } = req.body;
    if (isPostgres()) {
      const pool = await getPool();
      await pool.query(
        `INSERT INTO chat_messages (id, sender_id, receiver_id, message)
         VALUES ($1,$2,$3,$4)`,
        [id, sender_id, receiver_id, message]
      );
      return res.json({ success: true });
    }

    memoryStore.chat_messages.push({
      id, sender_id, receiver_id, message,
      created_at: new Date().toISOString(),
    });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── 8. AUDIT LOGS ────────────────────────────────────────────────────────────
app.get('/audit_logs', async (req, res) => {
  try {
    if (isPostgres()) {
      const pool = await getPool();
      const result = await pool.query('SELECT * FROM audit_logs ORDER BY created_at DESC');
      return res.json(result.rows);
    }
    const logs = [...memoryStore.audit_logs].sort(
      (a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0)
    );
    res.json(logs);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/audit_logs', async (req, res) => {
  try {
    const { id, user_id, username, action, details, ip_address } = req.body;
    if (isPostgres()) {
      const pool = await getPool();
      await pool.query(
        `INSERT INTO audit_logs (id, user_id, username, action, details, ip_address)
         VALUES ($1,$2,$3,$4,$5,$6)`,
        [id, user_id, username, action, details, ip_address]
      );
      return res.json({ success: true });
    }

    memoryStore.audit_logs.push({
      id, user_id, username, action, details, ip_address,
      created_at: new Date().toISOString(),
    });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Start Express Server ─────────────────────────────────────────────────────
const HOST = process.env.HOST || '0.0.0.0';
app.listen(PORT, HOST, () => {
  console.log(`\n🚀 Z-Hajirii Express Backend running on http://${HOST}:${PORT}`);
  console.log(`👉 Health check: http://${HOST}:${PORT}/health\n`);
});
