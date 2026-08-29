/**
 * middleware/security.js — Enterprise security headers middleware.
 *
 * Applies all HTTP security headers identical to Lambda utils.js CORS headers.
 * Works alongside helmet() for full coverage.
 */

const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || 'https://z-hajirii.vercel.app')
  .split(',')
  .map(o => o.trim());

function cors(req, res, next) {
  const origin = req.headers['origin'] || '';

  const isAllowed =
    ALLOWED_ORIGINS.includes(origin) ||
    origin.endsWith('.vercel.app') ||
    origin.includes('localhost') ||
    origin.includes('127.0.0.1');

  res.setHeader('Access-Control-Allow-Origin', isAllowed ? origin : ALLOWED_ORIGINS[0]);
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'Content-Type, Authorization, X-CSRF-Token, x-csrf-token, X-Signature, x-signature, X-Timestamp, x-timestamp, X-Nonce, x-nonce, X-Requested-With, Accept, Origin'
  );
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, PATCH, OPTIONS');

  // Handle preflight
  if (req.method === 'OPTIONS') {
    return res.status(200).json({ ok: true });
  }

  next();
}

function securityHeaders(req, res, next) {
  // Prevent MIME-type sniffing
  res.setHeader('X-Content-Type-Options', 'nosniff');
  // Block clickjacking
  res.setHeader('X-Frame-Options', 'DENY');
  // Browser XSS filter
  res.setHeader('X-XSS-Protection', '1; mode=block');
  // Force HTTPS for 1 year
  res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  // Referrer policy
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  // Disable browser features
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  // CSP
  res.setHeader(
    'Content-Security-Policy',
    [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "font-src 'self' https://fonts.gstatic.com",
      "img-src 'self' data: https:",
      `connect-src 'self' ${ALLOWED_ORIGINS.join(' ')}`,
    ].join('; ')
  );

  next();
}

module.exports = { cors, securityHeaders };
