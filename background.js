// background.js — service worker
//
// Owns the actual capture call (chrome.tabs.captureVisibleTab must run from an
// extension context with tab access) and exposes it over a message channel so
// the popup can request a capture without holding the API itself.

async function captureActiveTab() {
  const [tab] = await chrome.tabs.query({
    active: true,
    currentWindow: true,
  });
  if (!tab) {
    throw new Error('No active tab to capture');
  }
  // Restricted schemes (chrome://, the Web Store, etc.) cannot be captured.
  const url = tab.url || '';
  if (/^(chrome|edge|about|chrome-extension|devtools):/i.test(url)) {
    throw new Error(
      'This page cannot be captured (browser-internal or store page).'
    );
  }
  const dataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, {
    format: 'png',
  });
  return { dataUrl, sourceUrl: url, title: tab.title || '' };
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message && message.type === 'CAPTURE_VISIBLE') {
    captureActiveTab()
      .then((result) => sendResponse({ ok: true, ...result }))
      .catch((err) => sendResponse({ ok: false, error: err.message }));
    return true; // keep the channel open for the async response
  }
  return false;
});
