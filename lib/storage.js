// storage.js
// Data-access layer for folders and screenshots — now backed by Supabase
// (Postgres via PostgREST), one private dataset per authenticated user.
//
// This stays the single choke point the UI talks to, so the rest of the
// extension didn't need to change when we moved from chrome.storage to the
// cloud. Screenshot images live in the `image` column; list queries omit that
// column and callers fetch a single image on demand via getScreenshotImage().

import { rest, q, FOLDERS_TABLE, SHOTS_TABLE } from './db.js';

const DEFAULT_FOLDER_NAME = 'Unsorted';
const SHOT_META = 'id,folder_id,name,source_url,title,created_at';

// ---- Folders ---------------------------------------------------------------

export async function getFolders() {
  const folders = await rest(FOLDERS_TABLE, {
    query: q({ select: 'id,name,created_at', order: 'created_at.asc' }),
  });
  if (folders.length === 0) {
    // Seed a default folder the first time this user runs the extension.
    const seeded = await insertFolder(DEFAULT_FOLDER_NAME);
    return [seeded];
  }
  return folders;
}

async function insertFolder(name) {
  const rows = await rest(FOLDERS_TABLE, {
    method: 'POST',
    query: '?select=id,name,created_at',
    prefer: 'return=representation',
    body: { name },
  });
  return rows[0];
}

export async function createFolder(name) {
  const clean = (name || '').trim();
  if (!clean) throw new Error('Folder name is required');
  const folders = await getFolders();
  if (folders.some((f) => f.name.toLowerCase() === clean.toLowerCase())) {
    throw new Error('A folder with that name already exists');
  }
  return await insertFolder(clean);
}

export async function renameFolder(id, name) {
  const clean = (name || '').trim();
  if (!clean) throw new Error('Folder name is required');
  const folders = await getFolders();
  if (
    folders.some(
      (f) => f.id !== id && f.name.toLowerCase() === clean.toLowerCase()
    )
  ) {
    throw new Error('A folder with that name already exists');
  }
  const rows = await rest(FOLDERS_TABLE, {
    method: 'PATCH',
    query: q({ filters: { id: 'eq.' + id }, select: 'id,name,created_at' }),
    prefer: 'return=representation',
    body: { name: clean },
  });
  return rows[0];
}

export async function deleteFolder(id) {
  // Screenshots in this folder are removed by the ON DELETE CASCADE FK.
  await rest(FOLDERS_TABLE, {
    method: 'DELETE',
    query: q({ filters: { id: 'eq.' + id } }),
  });
}

// ---- Screenshots -----------------------------------------------------------

export async function getScreenshots(folderId) {
  const query = q({
    select: SHOT_META,
    filters: folderId ? { folder_id: 'eq.' + folderId } : {},
    order: 'created_at.desc',
  });
  return await rest(SHOTS_TABLE, { query });
}

// Fetch just the image (base64 data URL) for a single screenshot.
export async function getScreenshotImage(id) {
  const rows = await rest(SHOTS_TABLE, {
    query: q({ select: 'image', filters: { id: 'eq.' + id } }),
  });
  return rows[0] ? rows[0].image : null;
}

export async function countByFolder() {
  const rows = await rest(SHOTS_TABLE, { query: q({ select: 'folder_id' }) });
  return rows.reduce((acc, s) => {
    acc[s.folder_id] = (acc[s.folder_id] || 0) + 1;
    return acc;
  }, {});
}

export async function saveScreenshot({
  folderId,
  dataUrl,
  name,
  sourceUrl,
  title,
}) {
  if (!dataUrl) throw new Error('Screenshot image data is missing');
  const folders = await getFolders();
  const targetId = folders.some((f) => f.id === folderId)
    ? folderId
    : folders[0].id;
  const rows = await rest(SHOTS_TABLE, {
    method: 'POST',
    query: '?select=' + SHOT_META,
    prefer: 'return=representation',
    body: {
      folder_id: targetId,
      name: (name || defaultName(title)).trim(),
      image: dataUrl,
      source_url: sourceUrl || '',
      title: title || '',
    },
  });
  return rows[0];
}

export async function moveScreenshot(id, folderId) {
  const rows = await rest(SHOTS_TABLE, {
    method: 'PATCH',
    query: q({ filters: { id: 'eq.' + id }, select: SHOT_META }),
    prefer: 'return=representation',
    body: { folder_id: folderId },
  });
  return rows[0];
}

export async function deleteScreenshot(id) {
  await rest(SHOTS_TABLE, {
    method: 'DELETE',
    query: q({ filters: { id: 'eq.' + id } }),
  });
}

function defaultName(title) {
  const stamp = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const ts = `${stamp.getFullYear()}-${pad(stamp.getMonth() + 1)}-${pad(
    stamp.getDate()
  )}_${pad(stamp.getHours())}-${pad(stamp.getMinutes())}-${pad(
    stamp.getSeconds()
  )}`;
  const base = (title || 'screenshot')
    .replace(/[^a-z0-9]+/gi, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
    .toLowerCase();
  return `${base || 'screenshot'}_${ts}`;
}

// The last-used folder is a local UI preference, kept in chrome.storage.
export async function getLastFolderId() {
  const r = await chrome.storage.local.get('lastFolderId');
  return r.lastFolderId;
}

export async function setLastFolderId(id) {
  await chrome.storage.local.set({ lastFolderId: id });
}
