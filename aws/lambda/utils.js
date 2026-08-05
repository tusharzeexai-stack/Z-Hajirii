/**
 * utils.js — Shared Lambda response helpers.
 */

const jwt = require('jsonwebtoken');

// ── CORS ────────────────────────────────────────────────────────────────────
// Restrict to your deployed Vercel domain only.
// Add localhost for local development via a comma-separated allow-list check.
const ALLOWED_ORIGINS = [
  'https://z-hajirii.vercel.app',
  'https://d196dkcxe5jp1p.cloudfront.net',
  'http://localhost:3002',
  'http://localhost:3000',
];

function getCorsOrigin(event) {
  const origin = event?.headers?.origin || event?.headers?.Origin || '';
  return ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
}

function getCorsHeaders(event) {
  return {
    // ── CORS ────────────────────────────────────────────────────
    'Access-Control-Allow-Origin': getCorsOrigin(event),
    'Access-Control-Allow-Headers': 'Content-Type,Authorization',
    'Access-Control-Allow-Methods': 'GET,POST,DELETE,OPTIONS',
    'Access-Control-Allow-Credentials': 'true',
    'Content-Type': 'application/json',

    // ── HTTP Security Headers ────────────────────────────────────
    // Prevent MIME-type sniffing attacks
    'X-Content-Type-Options': 'nosniff',
    // Block clickjacking — do not allow embedding in iframes
    'X-Frame-Options': 'DENY',
    // Enable XSS filter in legacy browsers
    'X-XSS-Protection': '1; mode=block',
    // Force HTTPS for 1 year (only effective on HTTPS responses)
    'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
    // Only send origin as referrer to same-origin requests
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    // Restrict browser features (camera, mic, geolocation, etc.)
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
    // Basic CSP — allow only same-origin scripts and CloudFront/API origins
    'Content-Security-Policy': [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "font-src 'self' https://fonts.gstatic.com",
      "img-src 'self' data: https:",
      "connect-src 'self' https://d196dkcxe5jp1p.cloudfront.net https://yrhtexe0e5.execute-api.ap-south-1.amazonaws.com",
    ].join('; '),
  };
}

function respond(statusCode, body, event) {
  return {
    statusCode,
    headers: getCorsHeaders(event),
    body: JSON.stringify(body),
  };
}

function parseBody(rawBody) {
  if (!rawBody) return {};
  try {
    return JSON.parse(rawBody);
  } catch {
    return {};
  }
}

// ── JWT ─────────────────────────────────────────────────────────────────────
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  console.warn('[utils] JWT_SECRET is not set — authentication will be insecure!');
}

/**
 * Extracts and verifies the JWT from the Authorization header.
 * Returns the decoded payload on success, or null on failure.
 */
function verifyToken(event) {
  try {
    const authHeader =
      event.headers?.Authorization ||
      event.headers?.authorization ||
      '';

    if (!authHeader.startsWith('Bearer ')) return null;

    const token = authHeader.slice(7);
    const secret = JWT_SECRET || 'changeme-insecure-default';
    const decoded = jwt.verify(token, secret);
    return decoded; // { id, username, role, fullName, employeeId, iat, exp }
  } catch (err) {
    return null;
  }
}

module.exports = { respond, parseBody, getCorsHeaders, JWT_SECRET, verifyToken };
