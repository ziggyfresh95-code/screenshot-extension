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
  // Baked-in so users never see the Setup screen — they just sign in. The anon
  // (public) key is meant to be shipped in client apps; Row Level Security is
  // what protects the data. NEVER put the service_role (secret) key here.
  url: 'https://isimlpyvasexzccjlwch.supabase.co',
  anonKey:
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlzaW1scHl2YXNleHpjY2psd2NoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg3NjA5MjksImV4cCI6MjA5NDMzNjkyOX0.6RAO6V4_EZUMHIAB7mzZ6QwmYAzxPeblJvabTE_bg0Q',
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
