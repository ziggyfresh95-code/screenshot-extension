// config.js
// Holds the Supabase connection settings (project URL + anon/public key).
//
// Two ways to supply them:
//   1. Enter them once in the extension's in-app Setup screen — they are saved
//      to chrome.storage.local and survive reloads. (Recommended: nothing
//      sensitive ever touches the source or git.)
//   2. Or bake them into BAKED below so the extension works out of the box.
//
// The anon (public) key is meant to be embedded in client apps and is safe to
// ship — access is enforced by Supabase Row Level Security. NEVER put the
// service_role (secret) key here.

const BAKED = {
  url: '', // e.g. 'https://abcdefgh.supabase.co'
  anonKey: '', // the anon / public key (starts with 'eyJ...')
};

const KEY = 'supabaseConfig';

export async function getConfig() {
  const r = await chrome.storage.local.get(KEY);
  const stored = r[KEY];
  if (stored && stored.url && stored.anonKey) return stored;
  return BAKED;
}

export async function setConfig(url, anonKey) {
  const clean = {
    url: (url || '').trim().replace(/\/+$/, ''),
    anonKey: (anonKey || '').trim(),
  };
  if (!/^https?:\/\/.+/i.test(clean.url)) {
    throw new Error('Enter a valid Supabase URL (https://…supabase.co)');
  }
  if (clean.anonKey.length < 20) {
    throw new Error('That anon key looks too short — double-check it.');
  }
  await chrome.storage.local.set({ [KEY]: clean });
  return clean;
}

export async function isConfigured() {
  const c = await getConfig();
  return !!(c.url && c.anonKey);
}
