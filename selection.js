// selection.js — injected into the page to let the user drag-select a region.
//
// Runs fresh on each injection (chrome.scripting.executeScript re-executes the
// file). It draws a crosshair overlay, tracks a drag rectangle, then hands the
// rectangle (in CSS pixels) plus devicePixelRatio back to the service worker,
// which captures and crops. The overlay hides itself before reporting so it is
// never part of the screenshot.
(() => {
  // Guard against a stray previous overlay (e.g. double-trigger).
  const existing = document.getElementById('__snap_overlay');
  if (existing) existing.remove();

  const overlay = document.createElement('div');
  overlay.id = '__snap_overlay';

  const hint = document.createElement('div');
  hint.className = '__snap_hint';
  hint.textContent = 'Drag to select an area · Esc to cancel';

  const rectEl = document.createElement('div');
  rectEl.id = '__snap_rect';
  rectEl.hidden = true;

  overlay.append(hint, rectEl);
  document.documentElement.appendChild(overlay);

  let startX = 0;
  let startY = 0;
  let dragging = false;
  let current = null; // { x, y, width, height }

  function setRect(x1, y1, x2, y2) {
    const x = Math.min(x1, x2);
    const y = Math.min(y1, y2);
    const width = Math.abs(x2 - x1);
    const height = Math.abs(y2 - y1);
    current = { x, y, width, height };
    rectEl.style.left = x + 'px';
    rectEl.style.top = y + 'px';
    rectEl.style.width = width + 'px';
    rectEl.style.height = height + 'px';
    rectEl.hidden = false;
  }

  function cleanup() {
    overlay.removeEventListener('mousedown', onDown);
    window.removeEventListener('mousemove', onMove);
    window.removeEventListener('mouseup', onUp);
    window.removeEventListener('keydown', onKey);
    overlay.remove();
  }

  function cancel() {
    cleanup();
    chrome.runtime.sendMessage({ type: 'AREA_CANCEL' });
  }

  function onDown(e) {
    if (e.button !== 0) return;
    e.preventDefault();
    dragging = true;
    startX = e.clientX;
    startY = e.clientY;
    setRect(startX, startY, startX, startY);
  }

  function onMove(e) {
    if (!dragging) return;
    setRect(startX, startY, e.clientX, e.clientY);
  }

  function onUp(e) {
    if (!dragging) return;
    dragging = false;
    setRect(startX, startY, e.clientX, e.clientY);
    const rect = current;
    // Ignore accidental clicks / tiny selections.
    if (!rect || rect.width < 5 || rect.height < 5) {
      cancel();
      return;
    }
    const dpr = window.devicePixelRatio || 1;
    // Hide the overlay, let the page repaint, THEN ask the worker to capture,
    // so the crosshair/dimming never end up in the saved image.
    cleanup();
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        chrome.runtime.sendMessage({ type: 'AREA_RECT', rect, dpr });
      })
    );
  }

  function onKey(e) {
    if (e.key === 'Escape') {
      e.preventDefault();
      cancel();
    }
  }

  overlay.addEventListener('mousedown', onDown);
  window.addEventListener('mousemove', onMove);
  window.addEventListener('mouseup', onUp);
  window.addEventListener('keydown', onKey);
})();
