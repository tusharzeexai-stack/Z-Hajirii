/**
 * attendance_logs.js — Lambda handler for /attendance_logs resource.
 */
const { getPool } = require('../db');
const { respond, parseBody } = require('../utils');

exports.handler = async (event) => {
  const pool = await getPool();
  const method = event.httpMethod;

  try {
    if (method === 'OPTIONS') return respond(200, { ok: true });

    if (method === 'GET') {
      const result = await pool.query('SELECT * FROM attendance_logs ORDER BY created_at DESC');
      return respond(200, result.rows);
    }

    if (method === 'POST') {
      const body = parseBody(event.body);
      const action = event.queryStringParameters?.action;

      if (action === 'delete_by_employee') {
        const { employee_id } = body;
        await pool.query('DELETE FROM attendance_logs WHERE employee_id = $1', [employee_id]);
        return respond(200, { deleted: true });
      }

      const { id, employee_id, date, clock_in, clock_out, total_hours, status } = body;

      if (action === 'update') {
        await pool.query(
          `UPDATE attendance_logs SET clock_in=$1, clock_out=$2, total_hours=$3, status=$4
           WHERE employee_id=$5 AND date=$6`,
          [clock_in, clock_out, total_hours, status, employee_id, date]
        );
        return respond(200, { success: true });
      }

      // Insert
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
      return respond(200, { success: true });
    }

    if (method === 'DELETE') {
      const id = event.pathParameters?.id || event.queryStringParameters?.id;
      if (!id) return respond(400, { error: 'Missing id' });
      await pool.query('DELETE FROM attendance_logs WHERE id = $1', [id]);
      return respond(200, { deleted: true });
    }

    return respond(405, { error: 'Method not allowed' });
  } catch (err) {
    console.error('attendance_logs handler error:', err);
    return respond(500, { error: err.message });
  }
};
