// popup.js
import {
  getFolders,
  createFolder,
  saveScreenshot,
  getLastFolderId,
  setLastFolderId,
} from './lib/storage.js';
import { getUser, signOut } from './lib/auth.js';
import { mountAuth } from './lib/authview.js';

const els = {
  authRoot: document.getElementById('authRoot'),
  appMain: document.getElementById('appMain'),
  openGalleryTop: document.getElementById('openGallery'),
  accountEmail: document.getElementById('accountEmail'),
  signOut: document.getElementById('signOutBtn'),
  capture: document.getElementById('captureBtn'),
  area: document.getElementById('areaBtn'),
  previewWrap: document.getElementById('previewWrap'),
  previewImg: document.getElementById('previewImg'),
  folderSelect: document.getElementById('folderSelect'),
  newFolderBtn: document.getElementById('newFolderBtn'),
  newFolderRow: document.getElementById('newFolderRow'),
  newFolderInput: document.getElementById('newFolderInput'),
  createFolderBtn: document.getElementById('createFolderBtn'),
  cancelFolderBtn: document.getElementById('cancelFolderBtn'),
  postActions: document.getElementById('postActions'),
  gallery: document.getElementById('galleryBtn'),
  download: document.getElementById('downloadBtn'),
  status: document.getElementById('status'),
  openGallery: document.getElementById('openGallery'),
};

// The most recently saved screenshot (for the Download button).
let lastSaved = null; // { dataUrl }

function setStatus(msg, kind = '') {
  els.status.textContent = msg;
  els.status.className = 'status' + (kind ? ' ' + kind : '');
}

async function refreshFolders() {
  const folders = await getFolders();
  const last = await getLastFolderId();
  els.folderSelect.innerHTML = '';
  for (const f of folders) {
    const opt = document.createElement('option');
    opt.value = f.id;
    opt.textContent = f.name;
    els.folderSelect.appendChild(opt);
  }
  if (last && folders.some((f) => f.id === last)) {
    els.folderSelect.value = last;
  }
}

function selectedFolderName() {
  const opt = els.folderSelect.options[els.folderSelect.selectedIndex];
  return opt ? opt.textContent : 'folder';
}

// One click: capture the visible tab AND save it to the chosen folder.
async function captureAndSave() {
  setStatus('Capturing…');
  els.capture.disabled = true;
  try {
    const res = await chrome.runtime.sendMessage({ type: 'CAPTURE_VISIBLE' });
    if (!res || !res.ok) {
      throw new Error((res && res.error) || 'Capture failed');
    }

    const folderId = els.folderSelect.value;
    const shot = await saveScreenshot({
      folderId,
      dataUrl: res.dataUrl,
      sourceUrl: res.sourceUrl,
      title: res.title,
    });
    await setLastFolderId(shot.folderId);

    lastSaved = { dataUrl: res.dataUrl };
    els.previewImg.src = res.dataUrl;
    els.previewWrap.hidden = false;
    els.postActions.hidden = false;
    setStatus(`Saved to “${selectedFolderName()}” ✓`, 'success');
  } catch (err) {
    setStatus(err.message, 'error');
  } finally {
    els.capture.disabled = false;
  }
}

// Area capture happens in the page + service worker. The popup only kicks it
// off (passing the target folder) and then closes so the overlay gets focus.
async function selectArea() {
  const folderId = els.folderSelect.value;
  await setLastFolderId(folderId);
  try {
    const res = await chrome.runtime.sendMessage({
      type: 'AREA_CAPTURE',
      folderId,
    });
    if (!res || !res.ok) {
      throw new Error((res && res.error) || 'Could not start area capture');
    }
    window.close(); // get out of the way so the user can drag on the page
  } catch (err) {
    setStatus(err.message, 'error');
  }
}

function doDownload() {
  if (!lastSaved) return;
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const safeFolder = selectedFolderName().replace(/[^a-z0-9_-]+/gi, '-');
  chrome.downloads.download({
    url: lastSaved.dataUrl,
    filename: `${safeFolder}/snapshot_${stamp}.png`,
    saveAs: false,
  });
  setStatus('Download started', 'success');
}

function showNewFolder(show) {
  els.newFolderRow.hidden = !show;
  if (show) {
    els.newFolderInput.value = '';
    els.newFolderInput.focus();
  }
}

async function doCreateFolder() {
  try {
    const folder = await createFolder(els.newFolderInput.value);
    await refreshFolders();
    els.folderSelect.value = folder.id;
    await setLastFolderId(folder.id);
    showNewFolder(false);
    setStatus(`Folder “${folder.name}” created`, 'success');
  } catch (err) {
    setStatus(err.message, 'error');
  }
}

function openGallery() {
  chrome.tabs.create({ url: chrome.runtime.getURL('gallery.html') });
}

// ---- wire up ---------------------------------------------------------------

els.capture.addEventListener('click', captureAndSave);
els.area.addEventListener('click', selectArea);
els.download.addEventListener('click', doDownload);
els.gallery.addEventListener('click', openGallery);
els.openGallery.addEventListener('click', openGallery);
els.newFolderBtn.addEventListener('click', () => showNewFolder(true));
els.cancelFolderBtn.addEventListener('click', () => showNewFolder(false));
els.createFolderBtn.addEventListener('click', doCreateFolder);
els.newFolderInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') doCreateFolder();
  if (e.key === 'Escape') showNewFolder(false);
});
els.folderSelect.addEventListener('change', () =>
  setLastFolderId(els.folderSelect.value)
);
els.signOut.addEventListener('click', async () => {
  await signOut();
  showSignedOut();
});

// ---- auth gate -------------------------------------------------------------

function showSignedOut() {
  els.appMain.hidden = true;
  els.openGalleryTop.hidden = true;
  els.signOut.hidden = true;
  els.accountEmail.textContent = '';
  els.authRoot.hidden = false;
  mountAuth(els.authRoot, showSignedIn);
}

async function showSignedIn() {
  els.authRoot.hidden = true;
  els.authRoot.innerHTML = '';
  els.appMain.hidden = false;
  els.openGalleryTop.hidden = false;
  els.signOut.hidden = false;
  const user = await getUser();
  els.accountEmail.textContent = user?.email || '';
  await refreshFolders();
}

async function init() {
  // Clear the "saved ✓" action badge left by a prior area capture.
  chrome.action.setBadgeText({ text: '' });
  const user = await getUser();
  if (user) {
    await showSignedIn();
  } else {
    showSignedOut();
  }
}

init();
