/**
 * server/db.js
 * Database connection layer for the Express backend (ES Module).
 * Uses PostgreSQL (pg Pool) if DB_HOST or DATABASE_URL is configured in environment,
 * otherwise falls back to an in-memory storage manager with seed data for zero-config local development.
 */

import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Pool } = pg;
let pool = null;
let usePostgres = false;

const isDbConfigured = Boolean(
  process.env.DATABASE_URL ||
  process.env.DB_HOST ||
  (process.env.DB_USER && process.env.DB_PASS)
);

if (isDbConfigured) {
  try {
    const config = process.env.DATABASE_URL
      ? { connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } }
      : {
          host: process.env.DB_HOST,
          port: parseInt(process.env.DB_PORT || '5432', 10),
          database: process.env.DB_NAME || 'postgres',
          user: process.env.DB_USER,
          password: process.env.DB_PASS,
          ssl: process.env.DB_SSL === 'false' ? false : { rejectUnauthorized: false },
        };
    pool = new Pool(config);
    usePostgres = true;
    console.log('[DB] Configured for PostgreSQL mode.');
  } catch (err) {
    console.warn('[DB] Failed to initialize PostgreSQL pool, using fallback in-memory store:', err.message);
  }
} else {
  console.log('[DB] No PostgreSQL credentials found. Running in In-Memory / Local Storage Fallback Mode.');
}

// ── Table Auto-Initialization for Postgres ──────────────────────────────────
let initialized = false;
async function initTables() {
  if (!usePostgres || initialized) return;
  try {
    await pool.query(`
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
    console.log('[DB] PostgreSQL tables verified/created successfully.');
  } catch (err) {
    console.error('[DB] PostgreSQL table initialization error:', err);
  }
}

if (usePostgres) {
  initTables();
}

// ── In-Memory Store Fallback ────────────────────────────────────────────────
export const memoryStore = {
  employees: [],
  users: [],
  attendance_logs: [],
  tasks: [],
  leave_requests: [],
  notifications: [],
  chat_messages: [],
  audit_logs: [],
};

export function isPostgres() {
  return usePostgres;
}

export async function getPool() {
  if (usePostgres) {
    await initTables();
    return pool;
  }
  return null;
}
