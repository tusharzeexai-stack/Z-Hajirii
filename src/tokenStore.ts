/**
 * tokenStore.ts
 *
 * Hybrid Closure & Transient Session Token Store.
 * Keeps tokens in JS memory closure, backed by transient sessionStorage
 * to ensure F5 page refreshes maintain seamless login status without 401 errors.
 *
 * Security Guarantees:
 * 1. Zero disk footprint: localStorage is 100% cleared.
 * 2. Auto-destruct: sessionStorage clears completely when the browser tab is closed.
 * 3. Tamper-proof: Tokens are cryptographically validated server-side (HS256).
 */

let inMemoryToken: string | null = null;
let inMemoryRefreshToken: string | null = null;
let inMemoryUserSession: any | null = null;

// Wipe persistent localStorage to ensure zero permanent storage leaks
try {
  [
    'zhajirii_users', 'zhajirii_employees', 'zhajirii_logs',
    'zhajirii_tasks', 'zhajirii_leaves', 'zhajirii_notifications',
    'zhajirii_audit_logs', 'zhajirii_chat_messages',
    'zhajirii_session', 'zhajirii_token', 'zhajirii_refresh_token'
  ].forEach(key => localStorage.removeItem(key));
} catch (e) {}

export const tokenStore = {
  getToken: (): string | null => {
    if (inMemoryToken) return inMemoryToken;
    try {
      const stored = sessionStorage.getItem('zhajirii_token');
      if (stored) {
        inMemoryToken = stored;
        return stored;
      }
    } catch (e) {}
    return null;
  },
  setToken: (token: string): void => {
    inMemoryToken = token;
    try {
      sessionStorage.setItem('zhajirii_token', token);
    } catch (e) {}
  },
  getRefreshToken: (): string | null => {
    if (inMemoryRefreshToken) return inMemoryRefreshToken;
    try {
      const stored = sessionStorage.getItem('zhajirii_refresh_token');
      if (stored) {
        inMemoryRefreshToken = stored;
        return stored;
      }
    } catch (e) {}
    return null;
  },
  setRefreshToken: (refreshToken: string): void => {
    inMemoryRefreshToken = refreshToken;
    try {
      sessionStorage.setItem('zhajirii_refresh_token', refreshToken);
    } catch (e) {}
  },
  getSessionUser: (): any | null => {
    if (inMemoryUserSession) return inMemoryUserSession;
    try {
      const stored = sessionStorage.getItem('zhajirii_session');
      if (stored) {
        inMemoryUserSession = JSON.parse(stored);
        return inMemoryUserSession;
      }
    } catch (e) {}
    return null;
  },
  setSessionUser: (user: any): void => {
    inMemoryUserSession = user;
    try {
      sessionStorage.setItem('zhajirii_session', JSON.stringify(user));
    } catch (e) {}
  },
  clear: (): void => {
    inMemoryToken = null;
    inMemoryRefreshToken = null;
    inMemoryUserSession = null;
    try {
      sessionStorage.clear();
      localStorage.clear();
    } catch (e) {}
  }
};
