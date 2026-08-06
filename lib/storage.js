// storage.js
// Data-access layer for folders and screenshots.
//
// Everything is persisted in chrome.storage.local today. This module is the
// single choke point for reads/writes so that a Supabase-backed sync layer can
// be introduced later without touching the UI: swap the internals of these
// functions (or have them dual-write) and the popup/gallery keep working.

const FOLDERS_KEY = 'folders';
const SHOTS_KEY = 'screenshots';
const DEFAULT_FOLDER_NAME = 'Unsorted';

function uid() {
  return (
    Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8)
  );
}

function get(key) {
  return new Promise((resolve) => {
    chrome.storage.local.get(key, (res) => resolve(res[key]));
  });
}

function set(obj) {
  return new Promise((resolve) => {
    chrome.storage.local.set(obj, () => resolve());
  });
}

// ---- Folders ---------------------------------------------------------------

export async function getFolders() {
  const folders = (await get(FOLDERS_KEY)) || [];
  if (folders.length === 0) {
    const seed = [
      { id: uid(), name: DEFAULT_FOLDER_NAME, createdAt: Date.now() },
    ];
    await set({ [FOLDERS_KEY]: seed });
    return seed;
  }
  return folders;
}

export async function createFolder(name) {
  const clean = (name || '').trim();
  if (!clean) throw new Error('Folder name is required');
  const folders = await getFolders();
  if (
    folders.some((f) => f.name.toLowerCase() === clean.toLowerCase())
  ) {
    throw new Error('A folder with that name already exists');
  }
  const folder = { id: uid(), name: clean, createdAt: Date.now() };
  folders.push(folder);
  await set({ [FOLDERS_KEY]: folders });
  return folder;
}

export async function renameFolder(id, name) {
  const clean = (name || '').trim();
  if (!clean) throw new Error('Folder name is required');
  const folders = await getFolders();
  const folder = folders.find((f) => f.id === id);
  if (!folder) throw new Error('Folder not found');
  if (
    folders.some(
      (f) => f.id !== id && f.name.toLowerCase() === clean.toLowerCase()
    )
  ) {
    throw new Error('A folder with that name already exists');
  }
  folder.name = clean;
  await set({ [FOLDERS_KEY]: folders });
  return folder;
}

export async function deleteFolder(id) {
  let folders = await getFolders();
  folders = folders.filter((f) => f.id !== id);
  await set({ [FOLDERS_KEY]: folders });
  // Cascade: drop screenshots that belonged to the folder.
  const shots = (await get(SHOTS_KEY)) || [];
  await set({ [SHOTS_KEY]: shots.filter((s) => s.folderId !== id) });
}

// ---- Screenshots -----------------------------------------------------------

export async function getScreenshots(folderId) {
  const shots = (await get(SHOTS_KEY)) || [];
  const list = folderId ? shots.filter((s) => s.folderId === folderId) : shots;
  return list.sort((a, b) => b.createdAt - a.createdAt);
}

export async function countByFolder() {
  const shots = (await get(SHOTS_KEY)) || [];
  return shots.reduce((acc, s) => {
    acc[s.folderId] = (acc[s.folderId] || 0) + 1;
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
  // Fall back to the first folder if the requested one has vanished.
  const targetId = folders.some((f) => f.id === folderId)
    ? folderId
    : folders[0].id;
  const shots = (await get(SHOTS_KEY)) || [];
  const shot = {
    id: uid(),
    folderId: targetId,
    name: (name || defaultName(title)).trim(),
    dataUrl,
    sourceUrl: sourceUrl || '',
    title: title || '',
    createdAt: Date.now(),
  };
  shots.push(shot);
  await set({ [SHOTS_KEY]: shots });
  return shot;
}

export async function moveScreenshot(id, folderId) {
  const shots = (await get(SHOTS_KEY)) || [];
  const shot = shots.find((s) => s.id === id);
  if (!shot) throw new Error('Screenshot not found');
  shot.folderId = folderId;
  await set({ [SHOTS_KEY]: shots });
  return shot;
}

export async function deleteScreenshot(id) {
  const shots = (await get(SHOTS_KEY)) || [];
  await set({ [SHOTS_KEY]: shots.filter((s) => s.id !== id) });
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

// Remember the folder the user captured into last, for a smoother default.
export async function getLastFolderId() {
  return await get('lastFolderId');
}

export async function setLastFolderId(id) {
  await set({ lastFolderId: id });
}
