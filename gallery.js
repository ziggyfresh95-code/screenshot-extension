// gallery.js
import {
  getFolders,
  createFolder,
  renameFolder,
  deleteFolder,
  getScreenshots,
  getScreenshotImage,
  countByFolder,
  moveScreenshot,
  deleteScreenshot,
} from './lib/storage.js';
import { getUser, signOut } from './lib/auth.js';
import { mountAuth } from './lib/authview.js';

const els = {
  folderList: document.getElementById('folderList'),
  newFolderInput: document.getElementById('newFolderInput'),
  createFolderBtn: document.getElementById('createFolderBtn'),
  folderTitle: document.getElementById('folderTitle'),
  renameBtn: document.getElementById('renameBtn'),
  deleteFolderBtn: document.getElementById('deleteFolderBtn'),
  grid: document.getElementById('grid'),
  empty: document.getElementById('emptyState'),
  lightbox: document.getElementById('lightbox'),
  lightboxImg: document.getElementById('lightboxImg'),
  lightboxMeta: document.getElementById('lightboxMeta'),
  lightboxClose: document.getElementById('lightboxClose'),
  authGate: document.getElementById('authGate'),
  authRoot: document.getElementById('authRoot'),
  accountEmail: document.getElementById('accountEmail'),
  signOut: document.getElementById('signOutBtn'),
};

// null == the "All screenshots" view.
let activeFolderId = null;
let folders = [];

function fmtDate(ts) {
  return new Date(ts).toLocaleString();
}

// In-memory cache of fetched images so re-opening the lightbox / re-rendering
// doesn't re-download the same base64 blob.
const imageCache = new Map();
async function loadImage(id) {
  if (imageCache.has(id)) return imageCache.get(id);
  const data = await getScreenshotImage(id);
  imageCache.set(id, data);
  return data;
}

// Lazily fetch each thumbnail's image only when it scrolls into view.
const thumbObserver = new IntersectionObserver(
  (entries, obs) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      const img = entry.target;
      obs.unobserve(img);
      loadImage(img.dataset.shotId)
        .then((data) => {
          if (data) img.src = data;
          else img.classList.add('broken');
        })
        .catch(() => img.classList.add('broken'));
    }
  },
  { rootMargin: '200px' }
);

async function renderSidebar() {
  folders = await getFolders();
  const counts = await countByFolder();
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  els.folderList.innerHTML = '';

  els.folderList.appendChild(
    folderButton(null, 'All screenshots', total)
  );
  for (const f of folders) {
    els.folderList.appendChild(folderButton(f.id, f.name, counts[f.id] || 0));
  }
}

function folderButton(id, name, count) {
  const btn = document.createElement('button');
  btn.className = 'folder-item' + (id === activeFolderId ? ' active' : '');
  btn.type = 'button';

  const label = document.createElement('span');
  label.textContent = name;
  const badge = document.createElement('span');
  badge.className = 'count';
  badge.textContent = String(count);

  btn.append(label, badge);
  btn.addEventListener('click', () => selectFolder(id));
  return btn;
}

async function selectFolder(id) {
  activeFolderId = id;
  const folder = id ? folders.find((f) => f.id === id) : null;
  els.folderTitle.textContent = folder ? folder.name : 'All screenshots';
  // Rename/delete only make sense for a real folder.
  els.renameBtn.hidden = !folder;
  els.deleteFolderBtn.hidden = !folder;
  await renderSidebar();
  await renderGrid();
}

async function renderGrid() {
  const shots = await getScreenshots(activeFolderId);
  els.grid.innerHTML = '';
  els.empty.hidden = shots.length > 0;

  for (const shot of shots) {
    els.grid.appendChild(card(shot));
  }
}

function card(shot) {
  const el = document.createElement('div');
  el.className = 'card';

  const thumb = document.createElement('div');
  thumb.className = 'card-thumb';
  const img = document.createElement('img');
  img.alt = shot.name;
  img.dataset.shotId = shot.id;
  thumb.appendChild(img);
  thumbObserver.observe(img); // image loads when scrolled into view
  thumb.addEventListener('click', () => openLightbox(shot));

  const body = document.createElement('div');
  body.className = 'card-body';

  const name = document.createElement('div');
  name.className = 'card-name';
  name.textContent = shot.name;

  const meta = document.createElement('div');
  meta.className = 'card-meta';
  meta.textContent = fmtDate(shot.created_at);

  const actions = document.createElement('div');
  actions.className = 'card-actions';

  const dl = document.createElement('button');
  dl.textContent = 'Download';
  dl.addEventListener('click', () => download(shot));

  const move = document.createElement('select');
  move.title = 'Move to folder';
  const head = document.createElement('option');
  head.textContent = 'Move to…';
  head.value = '';
  move.appendChild(head);
  for (const f of folders) {
    if (f.id === shot.folder_id) continue;
    const opt = document.createElement('option');
    opt.value = f.id;
    opt.textContent = f.name;
    move.appendChild(opt);
  }
  move.addEventListener('change', async () => {
    if (!move.value) return;
    await moveScreenshot(shot.id, move.value);
    await renderSidebar();
    await renderGrid();
  });

  const del = document.createElement('button');
  del.className = 'del';
  del.textContent = 'Delete';
  del.addEventListener('click', async () => {
    if (!confirm('Delete this screenshot?')) return;
    await deleteScreenshot(shot.id);
    await renderSidebar();
    await renderGrid();
  });

  actions.append(dl, move, del);
  body.append(name, meta, actions);
  el.append(thumb, body);
  return el;
}

async function download(shot) {
  const folder = folders.find((f) => f.id === shot.folder_id);
  const safeFolder = (folder ? folder.name : 'Snapshots').replace(
    /[^a-z0-9_-]+/gi,
    '-'
  );
  const safeName = shot.name.replace(/[^a-z0-9_-]+/gi, '-');
  const data = await loadImage(shot.id);
  if (!data) return;
  chrome.downloads.download({
    url: data,
    filename: `${safeFolder}/${safeName}.png`,
    saveAs: false,
  });
}

async function openLightbox(shot) {
  els.lightboxImg.removeAttribute('src');
  els.lightboxMeta.innerHTML = '';
  const line = document.createElement('div');
  line.textContent = `${shot.name} · ${fmtDate(shot.created_at)}`;
  els.lightboxMeta.appendChild(line);
  if (shot.source_url) {
    const a = document.createElement('a');
    a.href = shot.source_url;
    a.textContent = shot.source_url;
    a.target = '_blank';
    a.rel = 'noreferrer';
    els.lightboxMeta.appendChild(a);
  }
  els.lightbox.hidden = false;
  const data = await loadImage(shot.id);
  if (data) els.lightboxImg.src = data;
}

function closeLightbox() {
  els.lightbox.hidden = true;
  els.lightboxImg.src = '';
}

// ---- folder actions --------------------------------------------------------

async function onCreateFolder() {
  const name = els.newFolderInput.value;
  if (!name.trim()) return;
  try {
    const folder = await createFolder(name);
    els.newFolderInput.value = '';
    await selectFolder(folder.id);
  } catch (err) {
    alert(err.message);
  }
}

async function onRename() {
  const folder = folders.find((f) => f.id === activeFolderId);
  if (!folder) return;
  const name = prompt('Rename folder', folder.name);
  if (name === null) return;
  try {
    await renameFolder(folder.id, name);
    await selectFolder(folder.id);
  } catch (err) {
    alert(err.message);
  }
}

async function onDeleteFolder() {
  const folder = folders.find((f) => f.id === activeFolderId);
  if (!folder) return;
  if (
    !confirm(
      `Delete folder “${folder.name}” and all screenshots inside it? This cannot be undone.`
    )
  ) {
    return;
  }
  await deleteFolder(folder.id);
  await selectFolder(null);
}

// ---- wire up ---------------------------------------------------------------

els.createFolderBtn.addEventListener('click', onCreateFolder);
els.newFolderInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') onCreateFolder();
});
els.renameBtn.addEventListener('click', onRename);
els.deleteFolderBtn.addEventListener('click', onDeleteFolder);
els.lightboxClose.addEventListener('click', closeLightbox);
els.lightbox.addEventListener('click', (e) => {
  if (e.target === els.lightbox) closeLightbox();
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !els.lightbox.hidden) closeLightbox();
});

els.signOut.addEventListener('click', async () => {
  await signOut();
  showSignedOut();
});

// If the session is cleared elsewhere (e.g. signed out in the popup), gate.
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local') return;
  if (changes.supabaseSession && !changes.supabaseSession.newValue) {
    showSignedOut();
  }
});

// Data lives in Supabase now, so refresh when returning to this tab (e.g.
// after capturing from the popup) to pull in anything new. Only when signed in
// (the auth gate is hidden).
window.addEventListener('focus', () => {
  if (els.authGate.hidden) {
    renderSidebar().then(renderGrid);
  }
});

// ---- auth gate -------------------------------------------------------------

function showSignedOut() {
  els.authGate.hidden = false;
  els.signOut.hidden = true;
  els.accountEmail.textContent = '';
  mountAuth(els.authRoot, showSignedIn);
}

async function showSignedIn() {
  els.authGate.hidden = true;
  els.authRoot.innerHTML = '';
  els.signOut.hidden = false;
  const user = await getUser();
  els.accountEmail.textContent = user?.email || '';
  await selectFolder(null);
}

async function init() {
  const user = await getUser();
  if (user) {
    await showSignedIn();
  } else {
    showSignedOut();
  }
}

init();
