// popup.js
import {
  getFolders,
  createFolder,
  saveScreenshot,
  getLastFolderId,
  setLastFolderId,
} from './lib/storage.js';

const els = {
  capture: document.getElementById('captureBtn'),
  previewWrap: document.getElementById('previewWrap'),
  previewImg: document.getElementById('previewImg'),
  folderSelect: document.getElementById('folderSelect'),
  newFolderBtn: document.getElementById('newFolderBtn'),
  newFolderRow: document.getElementById('newFolderRow'),
  newFolderInput: document.getElementById('newFolderInput'),
  createFolderBtn: document.getElementById('createFolderBtn'),
  cancelFolderBtn: document.getElementById('cancelFolderBtn'),
  save: document.getElementById('saveBtn'),
  download: document.getElementById('downloadBtn'),
  status: document.getElementById('status'),
  openGallery: document.getElementById('openGallery'),
};

// Holds the most recent capture until it is saved/discarded.
let pending = null; // { dataUrl, sourceUrl, title }

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

async function doCapture() {
  setStatus('Capturing…');
  els.capture.disabled = true;
  try {
    const res = await chrome.runtime.sendMessage({ type: 'CAPTURE_VISIBLE' });
    if (!res || !res.ok) {
      throw new Error((res && res.error) || 'Capture failed');
    }
    pending = {
      dataUrl: res.dataUrl,
      sourceUrl: res.sourceUrl,
      title: res.title,
    };
    els.previewImg.src = res.dataUrl;
    els.previewWrap.hidden = false;
    els.save.disabled = false;
    els.download.disabled = false;
    setStatus('Captured. Choose a folder and save.', 'success');
  } catch (err) {
    setStatus(err.message, 'error');
  } finally {
    els.capture.disabled = false;
  }
}

async function doSave() {
  if (!pending) return;
  els.save.disabled = true;
  try {
    const folderId = els.folderSelect.value;
    const shot = await saveScreenshot({
      folderId,
      dataUrl: pending.dataUrl,
      sourceUrl: pending.sourceUrl,
      title: pending.title,
    });
    await setLastFolderId(shot.folderId);
    setStatus('Saved to folder ✓', 'success');
    // Reset for the next capture.
    pending = null;
    els.previewWrap.hidden = true;
    els.previewImg.src = '';
    els.download.disabled = true;
  } catch (err) {
    setStatus(err.message, 'error');
    els.save.disabled = false;
  }
}

function doDownload() {
  if (!pending) return;
  const folderName =
    els.folderSelect.options[els.folderSelect.selectedIndex]?.textContent ||
    'Snapshots';
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const safeFolder = folderName.replace(/[^a-z0-9_-]+/gi, '-');
  chrome.downloads.download({
    url: pending.dataUrl,
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
    showNewFolder(false);
    setStatus(`Folder “${folder.name}” created`, 'success');
  } catch (err) {
    setStatus(err.message, 'error');
  }
}

// ---- wire up ---------------------------------------------------------------

els.capture.addEventListener('click', doCapture);
els.save.addEventListener('click', doSave);
els.download.addEventListener('click', doDownload);
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
els.openGallery.addEventListener('click', () => {
  chrome.tabs.create({ url: chrome.runtime.getURL('gallery.html') });
});

refreshFolders();
