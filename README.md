# Snapshot Folders — Chrome Extension

Capture a screenshot of the current Chrome tab and organize your captures into
folders. Everything is stored locally in the browser today; a **Supabase login
and cloud sync** layer is planned next (see [Roadmap](#roadmap)).

## Features

- 📸 **One-click capture** of the visible area of the active tab (`Ctrl+Shift+S`
  / `Cmd+Shift+S` opens the popup).
- 🗂️ **Folders** — create, rename, and delete folders to organize captures.
- 🖼️ **Gallery** — a full-page view to browse folders, preview screenshots in a
  lightbox, move them between folders, download, or delete.
- 💾 **Download to disk** into a subfolder named after the folder.
- 🔒 Works fully offline; captures never leave your machine (until cloud sync
  is added).

## Install (unpacked, for development)

1. Open `chrome://extensions` in Chrome.
2. Toggle **Developer mode** on (top-right).
3. Click **Load unpacked** and select this project folder
   (`screenshot-extension`).
4. Pin the **Snapshot Folders** icon from the extensions menu for quick access.

## Usage

1. Navigate to any regular web page (browser-internal pages like
   `chrome://` and the Web Store cannot be captured).
2. Click the extension icon (or press `Ctrl+Shift+S` / `Cmd+Shift+S`).
3. Pick a folder at the top (or click **+ New** to create one).
4. Click **Capture & Save** — the screenshot is captured **and** saved to
   that folder in one step. A confirmation and preview appear.
5. Use **Download PNG** to also save a copy to disk, or **Open gallery** to
   browse everything you've captured.

The **gallery** opens as its own browser tab. It's the full view of your
folders and screenshots — click a thumbnail to enlarge it (press `Esc` or the
✕ to close the preview), and close the tab like any other when you're done.

## Project structure

```
manifest.json      Manifest V3 config (permissions, action, service worker)
background.js      Service worker — performs chrome.tabs.captureVisibleTab
popup.html/.css/.js  Toolbar popup: capture, choose folder, save/download
gallery.html/.css/.js  Full-page browser for folders & screenshots
lib/storage.js     Data-access layer (folders + screenshots) — the single
                   place that talks to storage, so a Supabase backend can be
                   dropped in without touching the UI
icons/             Extension icons (16/32/48/128)
```

### Data model

Stored in `chrome.storage.local` (the `unlimitedStorage` permission is
requested so large PNGs fit):

- **folders**: `{ id, name, createdAt }`
- **screenshots**: `{ id, folderId, name, dataUrl, sourceUrl, title, createdAt }`

All persistence goes through `lib/storage.js`. Keeping the UI decoupled from
the storage backend is deliberate — the Supabase sync layer will hook in here.

## Permissions rationale

| Permission         | Why                                                        |
| ------------------ | --------------------------------------------------------- |
| `activeTab`/`tabs` | Read the active tab and capture its visible contents      |
| `storage`          | Persist folders and screenshots                           |
| `unlimitedStorage` | Screenshots are large; avoid the default quota            |
| `downloads`        | Save a PNG to disk into a per-folder subfolder            |

## Roadmap

- [x] Screenshot capture of the current tab
- [x] Create / rename / delete folders
- [x] Gallery with preview, move, download, delete
- [ ] **Supabase login (email/password + OAuth)**
- [ ] **Cloud sync** of folders and screenshots via `lib/storage.js`
- [ ] Cross-device access to your saved captures

> The storage layer is already isolated so the login + sync work slots in
> behind it without a UI rewrite.
