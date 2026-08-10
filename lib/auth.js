// auth.js
// A minimal Supabase Auth (GoTrue) client built on fetch — no bundled library,
// which keeps it compatible with the MV3 content-security policy.
//
// Session shape stored in chrome.storage.local['supabaseSession']:
//   { access_token, refresh_token, expires_at (ms epoch), user }

import { getConfig } from './config.js';

const SESSION_KEY = 'supabaseSession';

async function authFetch(path, { method = 'POST', body, token, params } = {}) {
  const { url, anonKey } = await getConfig();
  if (!url || !anonKey) {
    throw new Error('Supabase is not set up yet. Add your project details.');
  }
  const u = new URL(url.replace(/\/+$/, '') + '/auth/v1' + path);
  if (params) {
    for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
  }
  const headers = { apikey: anonKey, 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = 'Bearer ' + token;

  let res;
  try {
    res = await fetch(u.toString(), {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch (_) {
    throw new Error('Could not reach Supabase. Check the URL and your network.');
  }

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg =
      data.error_description ||
      data.msg ||
      data.error ||
      data.message ||
      `Request failed (${res.status})`;
    throw new Error(msg);
  }
  return data;
}

async function storeSession(data) {
  const session = {
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expires_at: Date.now() + (data.expires_in ? data.expires_in * 1000 : 3600000),
    user: data.user || null,
  };
  await chrome.storage.local.set({ [SESSION_KEY]: session });
  return session;
}

async function readSession() {
  const r = await chrome.storage.local.get(SESSION_KEY);
  return r[SESSION_KEY] || null;
}

// ---- public API ------------------------------------------------------------

export async function signUp(email, password) {
  const data = await authFetch('/signup', { body: { email, password } });
  // When "Confirm email" is OFF, signup returns a full session immediately.
  if (data.access_token) {
    await storeSession(data);
    return { signedIn: true, user: data.user || null };
  }
  // When "Confirm email" is ON, no session until the user confirms by email.
  return { signedIn: false, user: data.user || data };
}

export async function signIn(email, password) {
  const data = await authFetch('/token', {
    params: { grant_type: 'password' },
    body: { email, password },
  });
  await storeSession(data);
  return data.user || null;
}

export async function signOut() {
  const s = await readSession();
  try {
    if (s?.access_token) {
      await authFetch('/logout', { token: s.access_token });
    }
  } catch (_) {
    /* best-effort server-side revoke; always clear locally */
  }
  await chrome.storage.local.remove(SESSION_KEY);
}

// Returns a valid session, refreshing if it is expired/near expiry, or null.
export async function getSession() {
  let s = await readSession();
  if (!s) return null;
  if (Date.now() > s.expires_at - 60000) {
    if (!s.refresh_token) {
      await chrome.storage.local.remove(SESSION_KEY);
      return null;
    }
    try {
      const data = await authFetch('/token', {
        params: { grant_type: 'refresh_token' },
        body: { refresh_token: s.refresh_token },
      });
      s = await storeSession(data);
    } catch (_) {
      await chrome.storage.local.remove(SESSION_KEY);
      return null;
    }
  }
  return s;
}

export async function getUser() {
  const s = await getSession();
  return s ? s.user : null;
}
