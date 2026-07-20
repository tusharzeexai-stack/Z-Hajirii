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
 */

const API_BASE = (import.meta as any).env.VITE_API_GATEWAY_URL as string;

if (!API_BASE) {
  console.warn(
    '[awsApiClient] VITE_API_GATEWAY_URL is not set. ' +
    'Set it in your .env file after deploying the CloudFormation stack.'
  );
}

// ── Helpers ────────────────────────────────────────────────────────────────

async function apiFetch(
  path: string,
  options: RequestInit = {}
): Promise<{ data: any; error: any }> {
  try {
    const res = await fetch(`${API_BASE}${path}`, {
      headers: { 'Content-Type': 'application/json' },
      ...options,
    });
    const json = await res.json();
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
        body: JSON.stringify({ ...this._body, eq_col: this._eqCol, eq_val: this._eqVal }),
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

// ── Public API ─────────────────────────────────────────────────────────────

export const db = {
  from(table: string): QueryBuilder {
    return new QueryBuilder(table);
  },
};

// Named export alias — lets App.tsx keep "supabase" variable name with 1-line change:
// import { supabase } from './awsApiClient';
export const supabase = db;
