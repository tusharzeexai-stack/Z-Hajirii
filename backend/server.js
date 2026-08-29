/**
 * server.js — Z-Hajirii Express.js Backend Server
 *
 * Architecture:
 *   React Frontend (Vercel)
 *       ↓  HTTPS + JWT Bearer Token
 *   Express.js Server (EC2 / port 5000)
 *       ↓  Parameterized SQL
 *   Amazon RDS PostgreSQL
 *
 * Security:
 *   - JWT verification on every protected route
 *   - RBAC (Role-Based Access Control) enforced per resource
 *   - bcrypt password hashing (never stored plaintext)
 *   - Brute-force lockout (5 failed attempts → 15 min lockout)
 *   - Enterprise HTTP security headers (HSTS, X-Frame-Options, CSP, etc.)
 *   - CORS restricted to allowed origins only
 *   - Rate limiting on auth routes
 */

require('dotenv').config();
const express   = require('express');
const rateLimit = require('express-rate-limit');

const { cors, securityHeaders } = require('./middleware/security');

// ── Route Imports ─────────────────────────────────────────────────────────────
const authRouter         = require('./routes/auth');
const usersRouter        = require('./routes/users');
const employeesRouter    = require('./routes/employees');
const tasksRouter        = require('./routes/tasks');
const attendanceRouter   = require('./routes/attendance_logs');
const leaveRouter        = require('./routes/leave_requests');
const notifRouter        = require('./routes/notifications');
const chatRouter         = require('./routes/chat_messages');
const auditRouter        = require('./routes/audit_logs');

const app  = express();
const PORT = process.env.PORT || 5000;

// ── Global Middleware ─────────────────────────────────────────────────────────
app.set('trust proxy', 1); // Required for correct IP behind EC2/ALB
app.use(cors);
app.use(securityHeaders);
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// ── Rate Limiting ─────────────────────────────────────────────────────────────
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20,
  message: { error: 'Too many requests. Please try again in 15 minutes.' },
  standardHeaders: true,
  legacyHeaders: false,
});

const apiLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 300,
  message: { error: 'Rate limit exceeded. Please slow down.' },
});

app.use('/auth', authLimiter);
app.use('/', apiLimiter);

// ── Health Check ──────────────────────────────────────────────────────────────
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'ok',
    server: 'Z-Hajirii Express Backend',
    timestamp: new Date().toISOString(),
  });
});

// ── API Routes ────────────────────────────────────────────────────────────────
app.use('/auth',           authRouter);
app.use('/users',          usersRouter);
app.use('/employees',      employeesRouter);
app.use('/tasks',          tasksRouter);
app.use('/attendance_logs', attendanceRouter);
app.use('/leave_requests', leaveRouter);
app.use('/notifications',  notifRouter);
app.use('/chat_messages',  chatRouter);
app.use('/audit_logs',     auditRouter);

// ── 404 Catch-All ─────────────────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ error: `Route not found: ${req.method} ${req.path}` });
});

// ── Global Error Handler ──────────────────────────────────────────────────────
app.use((err, req, res, next) => {
  console.error('[server] Unhandled error:', err.message);
  res.status(500).json({ error: 'Internal server error.' });
});

// ── Start ─────────────────────────────────────────────────────────────────────
app.listen(PORT, '0.0.0.0', () => {
  console.log(`\n🚀 Z-Hajirii Backend running on http://0.0.0.0:${PORT}`);
  console.log(`   Health check: http://0.0.0.0:${PORT}/health`);
  console.log(`   Environment:  ${process.env.NODE_ENV || 'development'}\n`);
});

module.exports = app;
