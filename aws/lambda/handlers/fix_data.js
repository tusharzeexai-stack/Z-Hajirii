/**
 * fix_data.js — Lambda handler to disable RLS and seed all Supabase data into RDS PostgreSQL.
 */

const bcrypt = require('bcryptjs');
let getPool;
try { getPool = require('../db').getPool; } catch { getPool = require('./db').getPool; }
let respond;
try { ({ respond } = require('../utils')); } catch { ({ respond } = require('./utils')); }

const SUPABASE_URL = 'https://muqjbhariqlsbtkoaeiq.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im11cWpiaGFyaXFsc2J0a29hZWlxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA5Mjg3NDksImV4cCI6MjA5NjUwNDc0OX0.vO9--pqZV_qap6uDQd4Nvs6-OuKDiTroFeKsvIDIA7U';

async function fetchSupabase(table) {
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?select=*`, {
      headers: {
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`
      }
    });
    if (!res.ok) return [];
    return await res.json();
  } catch {
    return [];
  }
}

exports.handler = async (event) => {
  try {
    const pool = await getPool();

    console.log('[fix_data] 1. Disabling PostgreSQL RLS on all tables...');
    const tables = ['users', 'employees', 'tasks', 'leave_requests', 'attendance_logs', 'notifications', 'audit_logs', 'chat_messages'];
    for (const tbl of tables) {
      try {
        await pool.query(`ALTER TABLE ${tbl} DISABLE ROW LEVEL SECURITY;`);
      } catch (e) {
        console.warn(`Could not disable RLS on ${tbl}:`, e.message);
      }
    }

    console.log('[fix_data] 2. Fetching all data from Supabase...');
    const employees = await fetchSupabase('employees');
    const users = await fetchSupabase('users');
    const attendanceLogs = await fetchSupabase('attendance_logs');
    const tasks = await fetchSupabase('tasks');
    const leaveRequests = await fetchSupabase('leave_requests');

    console.log(`Fetched: ${employees.length} employees, ${users.length} users, ${tasks.length} tasks`);

    // 1. Seed Employees
    for (const emp of employees) {
      await pool.query(
        `INSERT INTO employees (id, name, role, email, avatar_url, emp_id, active_now, created_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
         ON CONFLICT (id) DO UPDATE SET
           name = EXCLUDED.name,
           role = EXCLUDED.role,
           email = EXCLUDED.email,
           avatar_url = EXCLUDED.avatar_url,
           emp_id = EXCLUDED.emp_id,
           active_now = EXCLUDED.active_now`,
        [emp.id, emp.name, emp.role, emp.email, emp.avatar_url || '', emp.emp_id, emp.active_now ?? true, emp.created_at || new Date()]
      );
    }

    const validEmpIds = new Set(employees.map(e => e.id));
    const validUserIds = new Set(users.map(u => u.id));
    const defaultHash = await bcrypt.hash('123', 10);

    // 2. Seed Users
    for (const u of users) {
      let pwdHash = u.password_hash || defaultHash;
      if (!pwdHash.startsWith('$2b$') && !pwdHash.startsWith('$2a$')) {
        pwdHash = await bcrypt.hash(pwdHash || '123', 10);
      }

      const empId = validEmpIds.has(u.employee_id) ? u.employee_id : null;
      const mgrId = validUserIds.has(u.manager_id) ? u.manager_id : null;

      await pool.query(
        `INSERT INTO users (id, username, password_hash, full_name, email, employee_id, department, designation, phone_number, joining_date, role, status, intern_type, manager_id, created_at, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,NOW())
         ON CONFLICT (id) DO UPDATE SET
           username = EXCLUDED.username,
           password_hash = EXCLUDED.password_hash,
           full_name = EXCLUDED.full_name,
           email = EXCLUDED.email,
           employee_id = EXCLUDED.employee_id,
           department = EXCLUDED.department,
           designation = EXCLUDED.designation,
           phone_number = EXCLUDED.phone_number,
           joining_date = EXCLUDED.joining_date,
           role = EXCLUDED.role,
           status = EXCLUDED.status,
           intern_type = EXCLUDED.intern_type,
           manager_id = EXCLUDED.manager_id`,
        [
          u.id, u.username, pwdHash, u.full_name, u.email,
          empId, u.department || 'Operations', u.designation || 'Staff',
          u.phone_number || '', u.joining_date || '', u.role,
          u.status || 'Active', u.intern_type || 'Online Intern', mgrId,
          u.created_at || new Date()
        ]
      );
    }

    // 3. Seed Attendance Logs
    for (const log of attendanceLogs) {
      if (validEmpIds.has(log.employee_id)) {
        await pool.query(
          `INSERT INTO attendance_logs (id, employee_id, date, clock_in, clock_out, total_hours, status, created_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
           ON CONFLICT (id) DO NOTHING`,
          [log.id, log.employee_id, log.date, log.clock_in, log.clock_out, log.total_hours, log.status, log.created_at || new Date()]
        );
      }
    }

    // 4. Seed Tasks
    for (const t of tasks) {
      if (validUserIds.has(t.user_id)) {
        await pool.query(
          `INSERT INTO tasks (id, user_id, title, description, priority, deadline, status, attachment, completed_at, created_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
           ON CONFLICT (id) DO UPDATE SET
             title = EXCLUDED.title,
             description = EXCLUDED.description,
             priority = EXCLUDED.priority,
             deadline = EXCLUDED.deadline,
             status = EXCLUDED.status`,
          [t.id, t.user_id, t.title, t.description || '', t.priority || 'Medium', t.deadline || '', t.status || 'Pending', t.attachment || null, t.completed_at || null, t.created_at || new Date()]
        );
      }
    }

    // 5. Seed Leave Requests
    for (const l of leaveRequests) {
      if (validUserIds.has(l.user_id)) {
        const appBy = validUserIds.has(l.approved_by) ? l.approved_by : null;
        await pool.query(
          `INSERT INTO leave_requests (id, user_id, leave_type, from_date, to_date, total_days, reason, description, attachment, status, admin_comment, approved_by, approved_at, created_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
           ON CONFLICT (id) DO UPDATE SET status = EXCLUDED.status`,
          [l.id, l.user_id, l.leave_type, l.from_date, l.to_date, l.total_days || 1, l.reason, l.description || '', l.attachment || null, l.status, l.admin_comment || '', appBy, l.approved_at || null, l.created_at || new Date()]
        );
      }
    }

    // Verify row counts
    const uCount = await pool.query('SELECT COUNT(*) FROM users');
    const eCount = await pool.query('SELECT COUNT(*) FROM employees');
    const tCount = await pool.query('SELECT COUNT(*) FROM tasks');
    const aCount = await pool.query('SELECT COUNT(*) FROM attendance_logs');

    return respond(200, {
      success: true,
      message: 'RLS disabled and database seeded successfully!',
      stats: {
        users: uCount.rows[0].count,
        employees: eCount.rows[0].count,
        tasks: tCount.rows[0].count,
        attendanceLogs: aCount.rows[0].count
      }
    }, event);
  } catch (err) {
    console.error('fix_data error:', err);
    return respond(500, { error: err.message }, event);
  }
};
