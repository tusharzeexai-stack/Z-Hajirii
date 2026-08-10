/**
 * attendance_logs.js — Lambda handler for /attendance_logs resource.
 *
 * Security: All routes require a valid JWT (Authorization: Bearer <token>)
 */
let getPool;
try { getPool = require('../db').getPool; } catch { getPool = require('./db').getPool; }

let respond, parseBody, verifyToken;
try { ({ respond, parseBody, verifyToken } = require('../utils')); } catch { ({ respond, parseBody, verifyToken } = require('./utils')); }

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return respond(200, { ok: true }, event);

  // ── JWT Guard ──────────────────────────────────────────────────────────────
  const caller = verifyToken(event);
  if (!caller) return respond(401, { error: 'Unauthorized' }, event);

  const pool = await getPool();
  const method = event.httpMethod;

  try {
    if (method === 'GET') {
      const result = await pool.query('SELECT * FROM attendance_logs ORDER BY created_at DESC');
      return respond(200, result.rows, event);
    }

    if (method === 'POST') {
      const body = parseBody(event.body);
      const action = event.queryStringParameters?.action;

      if (action === 'delete_by_employee') {
        if (caller.role !== 'Admin') return respond(403, { error: 'Forbidden' }, event);
        const { employee_id } = body;
        await pool.query('DELETE FROM attendance_logs WHERE employee_id = $1', [employee_id]);
        return respond(200, { deleted: true }, event);
      }

      if (action === 'update' || body.eq_col) {
        const targetId = body.id || (body.eq_col === 'id' ? body.eq_val : null);
        const fields = [];
        const values = [];
        let idx = 1;

        if (body.clock_in !== undefined) { fields.push(`clock_in = $${idx++}`); values.push(body.clock_in); }
        if (body.clock_out !== undefined) { fields.push(`clock_out = $${idx++}`); values.push(body.clock_out); }
        if (body.total_hours !== undefined) { fields.push(`total_hours = $${idx++}`); values.push(body.total_hours); }
        if (body.status !== undefined) { fields.push(`status = $${idx++}`); values.push(body.status); }

        if (fields.length > 0 && targetId) {
          values.push(targetId);
          await pool.query(
            `UPDATE attendance_logs SET ${fields.join(', ')} WHERE id = $${idx}`,
            values
          );
          return respond(200, { success: true }, event);
        }

        if (fields.length > 0 && body.employee_id && body.date) {
          values.push(body.employee_id, body.date);
          await pool.query(
            `UPDATE attendance_logs SET ${fields.join(', ')} WHERE employee_id = $${idx++} AND date = $${idx}`,
            values
          );
          return respond(200, { success: true }, event);
        }
      }

      // Default Insert / Upsert by ID
      const { id, employee_id, date, clock_in, clock_out, total_hours, status } = body;
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
      return respond(200, { success: true }, event);
    }

    if (method === 'DELETE') {
      if (caller.role !== 'Admin') return respond(403, { error: 'Forbidden' }, event);
      const id = event.pathParameters?.id || event.queryStringParameters?.id;
      if (!id) return respond(400, { error: 'Missing id' }, event);
      await pool.query('DELETE FROM attendance_logs WHERE id = $1', [id]);
      return respond(200, { deleted: true }, event);
    }

    return respond(405, { error: 'Method not allowed' }, event);
  } catch (err) {
    console.error('attendance_logs handler error:', err);
    return respond(500, { error: err.message }, event);
  }
};
