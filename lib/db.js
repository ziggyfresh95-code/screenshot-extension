// db.js
// Thin PostgREST client for the Supabase REST API, authenticated with the
// current user's session. Table names are prefixed `chrome_snapshot_` so they
// don't collide with the other project sharing this Supabase database.

import { getConfig } from './config.js';
import { getSession } from './auth.js';

export const FOLDERS_TABLE = 'chrome_snapshot_folders';
export const SHOTS_TABLE = 'chrome_snapshot_screenshots';

// Low-level REST call against /rest/v1/<table><query>. Returns parsed JSON
// (or null for empty responses). Throws a readable Error on failure.
export async function rest(table, { method = 'GET', query = '', body, prefer } = {}) {
  const { url, anonKey } = await getConfig();
  if (!url || !anonKey) {
    throw new Error('Supabase is not set up yet. Add your project details.');
  }
  const session = await getSession();
  if (!session) {
    throw new Error('Your session expired. Please sign in again.');
  }

  const endpoint = `${url.replace(/\/+$/, '')}/rest/v1/${table}${query}`;
  const headers = {
    apikey: anonKey,
    Authorization: 'Bearer ' + session.access_token,
    'Content-Type': 'application/json',
  };
  if (prefer) headers['Prefer'] = prefer;

  let res;
  try {
    res = await fetch(endpoint, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch (_) {
    throw new Error('Could not reach Supabase. Check your network.');
  }

  if (!res.ok) {
    const detail = await res.json().catch(() => ({}));
    const msg =
      detail.message || detail.hint || detail.details || `Request failed (${res.status})`;
    // A missing table almost always means the SQL schema hasn't been run yet.
    if (res.status === 404 || /relation .* does not exist/i.test(msg)) {
      throw new Error(
        'Database tables not found. Run supabase_schema.sql in your Supabase SQL editor.'
      );
    }
    throw new Error(msg);
  }

  if (res.status === 204) return null;
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

// Build a PostgREST query string from simple parts.
export function q(params) {
  const parts = [];
  if (params.select) parts.push('select=' + encodeURIComponent(params.select));
  for (const [col, cond] of Object.entries(params.filters || {})) {
    parts.push(`${col}=${encodeURIComponent(cond)}`);
  }
  if (params.order) parts.push('order=' + encodeURIComponent(params.order));
  return parts.length ? '?' + parts.join('&') : '';
}
