/**
 * db.js — Shared PostgreSQL connection for all Lambda handlers.
 * Connects directly using DB environment variables or Secrets Manager fallback.
 * Tables are automatically created if they do not exist.
 * Connection pool is reused across warm invocations.
 */

const { Pool } = require('pg');
const { SecretsManagerClient, GetSecretValueCommand } = require('@aws-sdk/client-secrets-manager');

let pool = null;
let initialized = false;

async function initTables(p) {
  if (initialized) return;
  try {
    await p.query(`
      CREATE TABLE IF NOT EXISTS employees (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        role TEXT NOT NULL,
        email TEXT NOT NULL,
        avatar_url TEXT NOT NULL,
        emp_id TEXT NOT NULL UNIQUE,
        active_now BOOLEAN DEFAULT true,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        username TEXT NOT NULL UNIQUE,
        password_hash TEXT NOT NULL,
        full_name TEXT NOT NULL,
        email TEXT NOT NULL,
        employee_id TEXT REFERENCES employees(id) ON DELETE SET NULL,
        department TEXT NOT NULL,
        designation TEXT NOT NULL,
        phone_number TEXT,
        joining_date TEXT,
        role TEXT NOT NULL,
        status TEXT NOT NULL,
        intern_type TEXT,
        manager_id TEXT REFERENCES users(id) ON DELETE SET NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS attendance_logs (
        id TEXT PRIMARY KEY,
        employee_id TEXT NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
        date TEXT NOT NULL,
        clock_in TEXT NOT NULL,
        clock_out TEXT NOT NULL,
        total_hours TEXT NOT NULL,
        status TEXT NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS tasks (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        title TEXT NOT NULL,
        description TEXT,
        priority TEXT NOT NULL,
        deadline TEXT NOT NULL,
        status TEXT NOT NULL,
        attachment TEXT,
        completed_at TIMESTAMP WITH TIME ZONE,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS leave_requests (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        leave_type TEXT NOT NULL,
        from_date TEXT NOT NULL,
        to_date TEXT NOT NULL,
        total_days INTEGER NOT NULL,
        reason TEXT NOT NULL,
        description TEXT,
        attachment TEXT,
        status TEXT NOT NULL,
        admin_comment TEXT,
        approved_by TEXT REFERENCES users(id) ON DELETE SET NULL,
        approved_at TIMESTAMP WITH TIME ZONE,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS notifications (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        title TEXT NOT NULL,
        message TEXT NOT NULL,
        type TEXT NOT NULL,
        is_read BOOLEAN DEFAULT false NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS audit_logs (
        id TEXT PRIMARY KEY,
        user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
        username TEXT,
        action TEXT NOT NULL,
        details TEXT NOT NULL,
        ip_address TEXT,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS chat_messages (
        id TEXT PRIMARY KEY,
        sender_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        receiver_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        message TEXT NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );
    `);
    initialized = true;
  } catch (err) {
    console.error('Table auto-initialization error:', err);
  }
}

async function getPool() {
  if (pool) {
    await initTables(pool);
    return pool;
  }

  let host = process.env.DB_HOST;
  let port = process.env.DB_PORT || 5432;
  let database = process.env.DB_NAME;
  let user = process.env.DB_USER;
  let password = process.env.DB_PASS;

  if (!host && process.env.DB_SECRET_ARN) {
    try {
      const secretArn = process.env.DB_SECRET_ARN;
      const client = new SecretsManagerClient({ region: process.env.AWS_REGION || 'ap-south-1' });
      const response = await client.send(new GetSecretValueCommand({ SecretId: secretArn }));
      const secret = JSON.parse(response.SecretString);
      host = secret.host;
      port = secret.port;
      database = secret.dbname;
      user = secret.username;
      password = secret.password;
    } catch (err) {
      console.error('SecretsManager fetch error:', err);
    }
  }

  pool = new Pool({
    host,
    port: parseInt(port, 10),
    database,
    user,
    password,
    ssl: { rejectUnauthorized: false },
    max: 5,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000,
  });

  await initTables(pool);
  return pool;
}

module.exports = { getPool };
