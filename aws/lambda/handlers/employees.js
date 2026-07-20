/**
 * employees.js — Lambda handler for /employees resource.
 */
const { getPool } = require('../db');
const { respond, parseBody } = require('../utils');

exports.handler = async (event) => {
  const pool = await getPool();
  const method = event.httpMethod;

  try {
    if (method === 'OPTIONS') return respond(200, { ok: true });

    if (method === 'GET') {
      const result = await pool.query('SELECT * FROM employees ORDER BY created_at DESC');
      return respond(200, result.rows);
    }

    if (method === 'POST') {
      const body = parseBody(event.body);
      const action = event.queryStringParameters?.action;

      // Batch delete
      if (action === 'delete_in') {
        const ids = body.ids;
        if (!ids || !ids.length) return respond(200, { deleted: 0 });
        const placeholders = ids.map((_, i) => `$${i + 1}`).join(', ');
        await pool.query(`DELETE FROM employees WHERE id IN (${placeholders})`, ids);
        return respond(200, { deleted: true });
      }

      const { id, name, role, email, avatar_url, emp_id, active_now } = body;
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
        [id, name, role, email, avatar_url, emp_id, active_now]
      );
      return respond(200, { success: true });
    }

    if (method === 'DELETE') {
      const id = event.pathParameters?.id || event.queryStringParameters?.id;
      if (!id) return respond(400, { error: 'Missing id' });
      await pool.query('DELETE FROM employees WHERE id = $1', [id]);
      return respond(200, { deleted: true });
    }

    return respond(405, { error: 'Method not allowed' });
  } catch (err) {
    console.error('employees handler error:', err);
    return respond(500, { error: err.message });
  }
};
