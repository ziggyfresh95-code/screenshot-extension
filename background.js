// background.js — service worker
//
// Owns the capture APIs (chrome.tabs.captureVisibleTab, chrome.scripting) and
// the cropping step, exposing them over a message channel. Two capture modes:
//
//   CAPTURE_VISIBLE  -> full visible tab, returned to the popup to save.
//   AREA_CAPTURE     -> inject a drag-to-select overlay into the page; when the
//                       user finishes, crop the capture to that rectangle and
//                       save it here (the popup has usually closed by then).

import { saveScreenshot, setLastFolderId } from './lib/storage.js';

const RESTRICTED = /^(chrome|edge|about|chrome-extension|devtools|view-source):/i;

async function getActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

function assertCapturable(tab) {
  if (!tab) throw new Error('No active tab to capture');
  if (RESTRICTED.test(tab.url || '')) {
    throw new Error(
      'This page cannot be captured (browser-internal or store page).'
    );
  }
}

async function captureVisible(tab) {
  assertCapturable(tab);
  return await chrome.tabs.captureVisibleTab(tab.windowId, { format: 'png' });
}

// ---- area capture ----------------------------------------------------------

async function beginAreaCapture(folderId) {
  const tab = await getActiveTab();
  assertCapturable(tab);
  // Remember what to do once the user finishes selecting. Persisted so a brief
  // service-worker restart during the drag doesn't lose the target folder.
  await chrome.storage.local.set({
    areaPending: { folderId, tabId: tab.id, windowId: tab.windowId },
  });
  await chrome.scripting.insertCSS({
    target: { tabId: tab.id },
    files: ['selection.css'],
  });
  await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    files: ['selection.js'],
  });
}

async function finishAreaCapture(rect, dpr, sender) {
  const { areaPending } = await chrome.storage.local.get('areaPending');
  await chrome.storage.local.remove('areaPending');
  if (!areaPending) return;

  const windowId = sender?.tab?.windowId ?? areaPending.windowId;
  const fullDataUrl = await chrome.tabs.captureVisibleTab(windowId, {
    format: 'png',
  });
  const cropped = await cropDataUrl(fullDataUrl, rect, dpr);

  const shot = await saveScreenshot({
    folderId: areaPending.folderId,
    dataUrl: cropped,
    sourceUrl: sender?.tab?.url || '',
    title: sender?.tab?.title || '',
  });
  await setLastFolderId(shot.folder_id);
  await flashBadge('✓', '#059669');
}

// Crop a PNG data URL to a rectangle (given in CSS pixels + devicePixelRatio).
async function cropDataUrl(dataUrl, rect, dpr) {
  const blob = await (await fetch(dataUrl)).blob();
  const bitmap = await createImageBitmap(blob);

  let sx = Math.round(rect.x * dpr);
  let sy = Math.round(rect.y * dpr);
  let sw = Math.round(rect.width * dpr);
  let sh = Math.round(rect.height * dpr);
  // Clamp to the captured image so drawImage never reads out of bounds.
  sx = Math.max(0, Math.min(sx, bitmap.width - 1));
  sy = Math.max(0, Math.min(sy, bitmap.height - 1));
  sw = Math.max(1, Math.min(sw, bitmap.width - sx));
  sh = Math.max(1, Math.min(sh, bitmap.height - sy));

  const canvas = new OffscreenCanvas(sw, sh);
  const ctx = canvas.getContext('2d');
  ctx.drawImage(bitmap, sx, sy, sw, sh, 0, 0, sw, sh);
  bitmap.close();
  const outBlob = await canvas.convertToBlob({ type: 'image/png' });
  return await blobToDataUrl(outBlob);
}

// Service workers have no FileReader, so encode the blob to base64 by hand.
async function blobToDataUrl(blob) {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
  }
  return 'data:image/png;base64,' + btoa(binary);
}

async function flashBadge(text, color) {
  try {
    await chrome.action.setBadgeBackgroundColor({ color });
    await chrome.action.setBadgeText({ text });
  } catch (_) {
    /* action badge is best-effort */
  }
}

// ---- message router --------------------------------------------------------

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const type = message && message.type;

  if (type === 'CAPTURE_VISIBLE') {
    getActiveTab()
      .then(async (tab) => {
        const dataUrl = await captureVisible(tab);
        sendResponse({
          ok: true,
          dataUrl,
          sourceUrl: tab.url || '',
          title: tab.title || '',
        });
      })
      .catch((err) => sendResponse({ ok: false, error: err.message }));
    return true;
  }

  if (type === 'AREA_CAPTURE') {
    beginAreaCapture(message.folderId)
      .then(() => sendResponse({ ok: true }))
      .catch((err) => sendResponse({ ok: false, error: err.message }));
    return true;
  }

  if (type === 'AREA_RECT') {
    finishAreaCapture(message.rect, message.dpr, sender)
      .catch((err) => {
        console.error('Area capture failed:', err);
        flashBadge('!', '#dc2626');
      });
    return false;
  }

  if (type === 'AREA_CANCEL') {
    chrome.storage.local.remove('areaPending');
    return false;
  }

  return false;
});
