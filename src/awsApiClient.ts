/**
 * awsApiClient.ts
 *
 * Drop-in replacement for the Supabase client.
 * Exports a `db` object with the same fluent interface that App.tsx uses:
 *   db.from('table').select('*').order(...)
 *   db.from('table').upsert(row)
 *   db.from('table').insert(row)
 *   db.from('table').update({...}).eq('col', val)
 *   db.from('table').delete().eq('col', val)
 *   db.from('table').delete().in('col', [vals])
 *
 * All methods return { data, error } to match Supabase SDK behavior.
 *
 * Security:
 *  - Attaches Authorization: Bearer <jwt> header on every request.
 *  - Token is read from sessionStorage (cleared on tab/window close).
 *  - No sensitive data is cached in localStorage.
 */

function sanitizeApiBase(url: string | undefined): string {
  if (!url) return 'https://d196dkcxe5jp1p.cloudfront.net';
  let cleaned = String(url).trim();
  // Strip URL-encoded %22 or quotes
  while (cleaned.startsWith('%22') || cleaned.startsWith('"') || cleaned.startsWith("'")) {
    if (cleaned.startsWith('%22')) cleaned = cleaned.slice(3);
    else cleaned = cleaned.slice(1);
  }
  while (cleaned.endsWith('%22') || cleaned.endsWith('"') || cleaned.endsWith("'")) {
    if (cleaned.endsWith('%22')) cleaned = cleaned.slice(0, -3);
    else cleaned = cleaned.slice(0, -1);
  }
  cleaned = cleaned.replace(/\/+$/, '').trim();
  return cleaned || 'https://d196dkcxe5jp1p.cloudfront.net';
}

const API_BASE = sanitizeApiBase((import.meta as any).env.VITE_API_GATEWAY_URL);

if (!API_BASE) {
  console.warn(
    '[awsApiClient] VITE_API_GATEWAY_URL is not set. ' +
    'Set it in your .env file after deploying the CloudFormation stack.'
  );
}

import { tokenStore } from './tokenStore';

// ── Token Management ────────────────────────────────────────────────────────

export function setAuthToken(token: string): void {
  tokenStore.setToken(token);
}

export function getAuthToken(): string | null {
  return tokenStore.getToken();
}

export function setRefreshToken(token: string): void {
  tokenStore.setRefreshToken(token);
}

export function getRefreshToken(): string | null {
  return tokenStore.getRefreshToken();
}

export function clearAuthToken(): void {
  tokenStore.clear();
}

export function getClaimsFromToken(): { id: string; username: string; role: string; fullName?: string; employeeId?: string; exp?: number } | null {
  const token = getAuthToken();
  if (!token) return null;
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const base64Url = parts[1];
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    const jsonPayload = decodeURIComponent(
      atob(base64)
        .split('')
        .map(c => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
        .join('')
    );
    const payload = JSON.parse(jsonPayload);

    // Check expiration
    if (payload.exp && payload.exp * 1000 < Date.now()) {
      clearAuthToken();
      return null;
    }
    return payload;
  } catch (e) {
    return null;
  }
}

async function refreshAccessToken(): Promise<string | null> {
  const refreshToken = getRefreshToken();
  if (!refreshToken) return null;
  try {
    const res = await fetch(`${API_BASE}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'refresh', refreshToken }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (data.token) {
      setAuthToken(data.token);
      if (data.refreshToken) setRefreshToken(data.refreshToken);
      return data.token;
    }
    return null;
  } catch {
    return null;
  }
}

async function apiFetch(
  path: string,
  options: RequestInit = {},
  isRetry = false
): Promise<{ data: any; error: any }> {
  try {
    const token = getAuthToken();
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'X-CSRF-Token': token ? token.slice(-16) : 'csrf-protected',
    };

    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const res = await fetch(`${API_BASE}${path}`, {
      ...options,
      headers: {
        ...headers,
        ...(options.headers as Record<string, string> || {}),
      },
    });

    const json = await res.json();

    if (res.status === 401) {
      // Try silent refresh if not already retried
      if (!isRetry) {
        const newToken = await refreshAccessToken();
        if (newToken) {
          return apiFetch(path, options, true);
        }
      }

      // Token expired or refresh failed — clear session
      clearAuthToken();
      return { data: null, error: { message: 'Session expired. Please log in again.', code: 401 } };
    }

    if (!res.ok) {
      return { data: null, error: { message: json.error || `HTTP ${res.status}` } };
    }

    return { data: json, error: null };
  } catch (err: any) {
    return { data: null, error: { message: err.message || 'Network error' } };
  }
}

// ── Query Builder ──────────────────────────────────────────────────────────

interface OrderOptions {
  ascending?: boolean;
}

class QueryBuilder {
  private _table: string;
  private _operation: 'select' | 'upsert' | 'insert' | 'update' | 'delete' | null = null;
  private _body: any = null;
  private _orderCol: string | null = null;
  private _orderAsc = true;
  private _eqCol: string | null = null;
  private _eqVal: any = null;
  private _inCol: string | null = null;
  private _inVals: any[] | null = null;
  private _action: string | null = null;

  constructor(table: string) {
    this._table = table;
  }

  select(_cols = '*'): this {
    this._operation = 'select';
    return this;
  }

  order(col: string, opts: OrderOptions = {}): this {
    this._orderCol = col;
    this._orderAsc = opts.ascending ?? true;
    return this;
  }

  upsert(row: any): this {
    this._operation = 'upsert';
    this._body = row;
    return this;
  }

  insert(row: any): this {
    this._operation = 'insert';
    this._body = row;
    return this;
  }

  update(patch: any): this {
    this._operation = 'update';
    this._body = patch;
    return this;
  }

  delete(): this {
    this._operation = 'delete';
    return this;
  }

  eq(col: string, val: any): this {
    this._eqCol = col;
    this._eqVal = val;
    return this as unknown as this;
  }

  in(col: string, vals: any[]): this {
    this._inCol = col;
    this._inVals = vals;
    return this as unknown as this;
  }

  // Execute (returns Promise<{data,error}>)
  then(resolve: (v: { data: any; error: any }) => void, reject?: (e: any) => void): void {
    this._execute().then(resolve, reject);
  }

  async _execute(): Promise<{ data: any; error: any }> {
    const table = this._table;

    // ── SELECT ──────────────────────────────────────────────────────────
    if (this._operation === 'select') {
      const result = await apiFetch(`/${table}`, { method: 'GET' });
      if (result.error) return result;

      let rows: any[] = Array.isArray(result.data) ? result.data : [];

      // Client-side ordering (API returns pre-sorted, but honour explicit calls)
      if (this._orderCol) {
        const col = this._orderCol;
        const asc = this._orderAsc;
        rows = rows.sort((a, b) => {
          if (a[col] < b[col]) return asc ? -1 : 1;
          if (a[col] > b[col]) return asc ? 1 : -1;
          return 0;
        });
      }
      return { data: rows, error: null };
    }

    // ── UPSERT ──────────────────────────────────────────────────────────
    if (this._operation === 'upsert') {
      return apiFetch(`/${table}`, {
        method: 'POST',
        body: JSON.stringify(this._body),
      });
    }

    // ── INSERT ──────────────────────────────────────────────────────────
    if (this._operation === 'insert') {
      return apiFetch(`/${table}`, {
        method: 'POST',
        body: JSON.stringify(this._body),
      });
    }

    // ── UPDATE ──────────────────────────────────────────────────────────
    if (this._operation === 'update') {
      // Notifications: mark_read / mark_all_read
      if (table === 'notifications') {
        if (this._eqCol === 'id') {
          return apiFetch(`/${table}?action=mark_read`, {
            method: 'POST',
            body: JSON.stringify({ id: this._eqVal }),
          });
        }
        if (this._eqCol === 'user_id') {
          return apiFetch(`/${table}?action=mark_all_read`, {
            method: 'POST',
            body: JSON.stringify({ user_id: this._eqVal }),
          });
        }
      }
      // Attendance: update by employee_id + date (handled by upsert path)
      return apiFetch(`/${table}?action=update`, {
        method: 'POST',
        body: JSON.stringify({ ...this._body, eq_col: this._eqCol, eq_val: this._eqVal, id: this._eqCol === 'id' ? this._eqVal : undefined }),
      });
    }

    // ── DELETE ──────────────────────────────────────────────────────────
    if (this._operation === 'delete') {
      // Batch delete (e.g. delete().in('id', [...]))
      if (this._inCol && this._inVals) {
        return apiFetch(`/${table}?action=delete_in`, {
          method: 'POST',
          body: JSON.stringify({ ids: this._inVals }),
        });
      }

      // Delete notifications by user_id
      if (this._eqCol === 'user_id') {
        return apiFetch(`/${table}?action=delete_by_user`, {
          method: 'DELETE',
          body: JSON.stringify({ user_id: this._eqVal }),
        });
      }

      // Delete attendance logs by employee_id
      if (table === 'attendance_logs' && this._eqCol === 'employee_id') {
        return apiFetch(`/${table}?action=delete_by_employee`, {
          method: 'POST',
          body: JSON.stringify({ employee_id: this._eqVal }),
        });
      }

      // Standard delete by id
      return apiFetch(`/${table}?id=${encodeURIComponent(this._eqVal)}`, {
        method: 'DELETE',
      });
    }

    return { data: null, error: { message: 'Unknown operation' } };
  }
}

// ── Auth API ───────────────────────────────────────────────────────────────

/**
 * Calls POST /auth/login and returns { token, user } or throws an error string.
 * Password verification happens entirely on the server — no hashes cross the wire.
 */
export async function loginWithCredentials(
  username: string,
  password: string
): Promise<{ token: string; user: any }> {
  const res = await fetch(`${API_BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });

  const json = await res.json();

  if (!res.ok) {
    throw new Error(json.error || 'Invalid username or password.');
  }

  if (json.refreshToken) {
    setRefreshToken(json.refreshToken);
  }

  return json as { token: string; user: any; refreshToken?: string };
}

/**
 * Calls POST /auth/change-password to update password server-side.
 * The old password is verified and the new hash computed entirely on the server.
 */
export async function changePassword(
  oldPassword: string,
  newPassword: string
): Promise<void> {
  const token = getAuthToken();
  const res = await fetch(`${API_BASE}/auth/change-password`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ old_password: oldPassword, new_password: newPassword }),
  });

  const json = await res.json();
  if (!res.ok) {
    throw new Error(json.error || 'Failed to change password.');
  }
}

/**
 * Calls POST /users?action=set_password to bcrypt-hash and store a new password for any user.
 * Only Admin can call this — enforced server-side by JWT role check.
 */
export async function adminSetPassword(userId: string, newPassword: string): Promise<void> {
  const token = getAuthToken();
  const res = await fetch(`${API_BASE}/users?action=set_password`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ user_id: userId, new_password: newPassword }),
  });

  const json = await res.json();
  if (!res.ok) {
    throw new Error(json.error || 'Failed to set password.');
  }
}

export const db = {
  from(table: string): QueryBuilder {
    return new QueryBuilder(table);
  },
};

// Named export alias — lets App.tsx keep "supabase" variable name with 1-line change:
// import { supabase } from './awsApiClient';
export const supabase = db;
