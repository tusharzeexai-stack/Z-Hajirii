/**
 * db.js — PostgreSQL connection pool for Z-Hajirii backend.
 * Uses Amazon RDS PostgreSQL via the `pg` library.
 */

require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  host:     process.env.DB_HOST,
  port:     parseInt(process.env.DB_PORT || '5432', 10),
  database: process.env.DB_NAME,
  user:     process.env.DB_USER,
  password: process.env.DB_PASS,
  ssl:      process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
  max:      10,           // max simultaneous connections in pool
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

pool.on('error', (err) => {
  console.error('[db] Unexpected pool error:', err.message);
});

// Test connection on startup
pool.query('SELECT 1').then(() => {
  console.log('[db] ✅ Connected to Amazon RDS PostgreSQL');
}).catch((err) => {
  console.error('[db] ❌ RDS connection failed:', err.message);
});

module.exports = pool;
