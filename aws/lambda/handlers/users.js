/**
 * users.js — Lambda handler for /users resource.
 * Supports: GET (list, order by created_at desc), POST/PUT (upsert), DELETE (by id or IN list)
 */
const { getPool } = require('../db');
const { cors, respond, parseBody } = require('../utils');

exports.handler = async (event) => {
  const pool = await getPool();
  const method = event.httpMethod;

  try {
    if (method === 'OPTIONS') return respond(200, { ok: true });

    if (method === 'GET') {
      const result = await pool.query('SELECT * FROM users ORDER BY created_at DESC');
      return respond(200, result.rows);
    }

    if (method === 'POST') {
      const body = parseBody(event.body);
      const action = event.queryStringParameters?.action;

      // Batch delete (prune mock users)
      if (action === 'delete_in') {
        const ids = body.ids;
        if (!ids || !ids.length) return respond(200, { deleted: 0 });
        const placeholders = ids.map((_, i) => `$${i + 1}`).join(', ');
        const result = await pool.query(`DELETE FROM users WHERE id IN (${placeholders})`, ids);
        return respond(200, { deleted: result.rowCount });
      }

      // Upsert (insert or update on conflict)
      const {
        id, username, password_hash, full_name, email, employee_id,
        department, designation, phone_number, joining_date,
        role, status, intern_type, manager_id
      } = body;

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
      return respond(200, { success: true });
    }

    if (method === 'DELETE') {
      const id = event.pathParameters?.id || event.queryStringParameters?.id;
      if (!id) return respond(400, { error: 'Missing id' });
      await pool.query('DELETE FROM users WHERE id = $1', [id]);
      return respond(200, { deleted: true });
    }

    return respond(405, { error: 'Method not allowed' });
  } catch (err) {
    console.error('users handler error:', err);
    return respond(500, { error: err.message });
  }
};
