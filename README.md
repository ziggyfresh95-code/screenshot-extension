# Snapshot Folders — Chrome Extension

Capture a screenshot of the current Chrome tab and organize your captures into
folders. Everything is stored locally in the browser today; a **Supabase login
and cloud sync** layer is planned next (see [Roadmap](#roadmap)).

## Features

- 📸 **One-click capture** of the visible area of the active tab (`Ctrl+Shift+S`
  / `Cmd+Shift+S` opens the popup).
- ✂️ **Select an area** — drag a rectangle on the page to capture just that
  region; it's cropped and saved automatically.
- 🗂️ **Folders** — create, rename, and delete folders to organize captures.
- 🖼️ **Gallery** — a full-page view to browse folders, preview screenshots in a
  lightbox, move them between folders, download, or delete.
- 💾 **Download to disk** into a subfolder named after the folder.
- ☁️ **Per-user cloud storage** — folders and screenshots are saved to your
  Supabase project and are private to each signed-in user (enforced by Row
  Level Security), so your captures follow you across devices.

## Sign in (Supabase)

The extension is gated behind a Supabase login — you must sign in (or sign up)
before capturing. Captures are then stored per-user in your Supabase database.

### One-time database setup

Create the tables the extension uses (run once):

1. In your [Supabase dashboard](https://supabase.com/dashboard), open
   **SQL Editor → New query**.
2. Paste the contents of [`supabase_schema.sql`](./supabase_schema.sql) and
   click **Run**.

This creates two tables — `chrome_snapshot_folders` and
`chrome_snapshot_screenshots` — prefixed so they don't collide with the other
project sharing this database, with Row Level Security so each user only sees
their own rows.

### Connect the extension

On first launch you'll see a one-time **Setup** screen:

1. In your Supabase dashboard, open **Project Settings → API**.
2. Copy the **Project URL** and the **`anon` `public`** key.
3. Paste both into the extension's Setup screen and click **Save & continue**.
   - The values are stored locally in `chrome.storage.local` — not in the code
     or git.
   - The **anon key is safe to embed** in a client; access is enforced by
     Supabase Row Level Security. **Never** use the `service_role` secret key.
4. Create an account or sign in with **email + password**.

> If **Authentication → Providers → Email → Confirm email** is ON in Supabase,
> new sign-ups must click the confirmation link in their email before their
> first sign-in. If it's OFF, sign-up logs you straight in.

You can change the Supabase details later via **“Change Supabase settings”** on
the sign-in screen, and **Sign out** from the popup footer or the gallery
sidebar.

## Paywall (Stripe subscription — $7/month)

After signing in, users without an active subscription see a paywall and must
subscribe before capturing. Stripe's secret key and payment verification run in
two Supabase Edge Functions — never in the extension.

### A. Stripe dashboard (test mode)

1. In [Stripe](https://dashboard.stripe.com/test) make sure **Test mode** is on.
2. **Products → Add product**: name it (e.g. “Snapshot Folders Pro”), add a
   **recurring** price of **$7 / month**. Save, then copy the **Price ID**
   (`price_...`).
3. **Developers → API keys**: copy the **Secret key** (`sk_test_...`).

### B. Database

Run [`stripe_schema.sql`](./stripe_schema.sql) in Supabase → SQL Editor (creates
`chrome_snapshot_subscriptions`, read-only to users).

### C. Deploy the Edge Functions (Supabase CLI)

```bash
# one-time
npm i -g supabase
supabase login
supabase link --project-ref <your-project-ref>   # from your Supabase URL

# from the repo root (this folder):
supabase functions deploy create-checkout-session
supabase functions deploy stripe-webhook --no-verify-jwt   # Stripe must reach it

# set the secrets the functions need
supabase secrets set STRIPE_SECRET_KEY=sk_test_xxx
supabase secrets set STRIPE_PRICE_ID=price_xxx
```

### D. Connect the Stripe webhook

1. Stripe **Developers → Webhooks → Add endpoint**.
2. Endpoint URL:
   `https://<project-ref>.supabase.co/functions/v1/stripe-webhook`
3. Select events: `checkout.session.completed`,
   `customer.subscription.updated`, `customer.subscription.deleted`.
4. Copy the endpoint’s **Signing secret** (`whsec_...`) and set it:
   ```bash
   supabase secrets set STRIPE_WEBHOOK_SECRET=whsec_xxx
   ```

### E. Cancel / manage subscription (Customer Portal)

Signed-in subscribers get a **Manage billing** button (popup footer and gallery
sidebar) that opens Stripe's hosted Customer Portal to cancel or update payment.

1. Deploy the third function: `supabase/functions/create-portal-session`
   (keep **Verify JWT ON**). It reuses `STRIPE_SECRET_KEY` — no new secret.
2. One-time: activate the portal in test mode at
   **Stripe → Settings → Billing → Customer portal**
   (https://dashboard.stripe.com/test/settings/billing/portal) and enable
   **"Cancel subscriptions"**. Save.

When a user cancels, Stripe sends `customer.subscription.updated` /
`.deleted`; the webhook flips their row's `status`, and the extension re-gates
to the paywall once it's no longer `active`.

### F. Test

1. Reload the extension, sign in → the **paywall** appears.
2. **Subscribe with Stripe** → pay on the Stripe page with test card
   `4242 4242 4242 4242`, any future expiry, any CVC/ZIP.
3. The webhook records the subscription; the extension polls and unlocks.
4. Verify in Supabase → **Table Editor → chrome_snapshot_subscriptions**
   (`status = active`).

> Until you optionally enable the server-side RLS block at the bottom of
> `stripe_schema.sql`, the paywall is enforced in the extension UI only.

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
4. Capture in one of two ways — both save to the chosen folder automatically:
   - **Capture full tab** — grabs the whole visible page, shows a preview.
   - **Select area** — the popup closes and the page dims; **drag a rectangle**
     over the part you want (press `Esc` to cancel). It's cropped and saved,
     and a green ✓ appears on the toolbar icon to confirm.
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
selection.js/.css  Injected drag-to-select overlay for area capture
lib/storage.js     Data-access layer (folders + screenshots) — the single
                   place that talks to storage, so a Supabase backend can be
                   dropped in without touching the UI
lib/config.js      Supabase connection settings (URL + anon key)
lib/auth.js        Fetch-based Supabase Auth (GoTrue) client + session mgmt
lib/authview.js    Shared setup / sign-in / sign-up UI
icons/             Extension icons (16/32/48/128)
```

### Data model

Folders and screenshots are stored in Supabase, one private dataset per user
(see [`supabase_schema.sql`](./supabase_schema.sql)):

- **chrome_snapshot_folders**: `id, user_id, name, created_at`
- **chrome_snapshot_screenshots**:
  `id, user_id, folder_id, name, image (base64 data URL), source_url, title, created_at`

All persistence goes through `lib/storage.js`, which talks to Supabase via
`lib/db.js` (a small PostgREST client). List queries fetch metadata only; each
image is loaded on demand (lazily as thumbnails scroll into view, or when a
screenshot is opened/downloaded) to keep things fast. The last-used folder is
the only thing kept locally, in `chrome.storage.local`.

## Permissions rationale

| Permission         | Why                                                        |
| ------------------ | --------------------------------------------------------- |
| `activeTab`/`tabs` | Read the active tab and capture its visible contents      |
| `scripting`        | Inject the drag-to-select overlay for area capture        |
| `storage`          | Persist folders and screenshots                           |
| `unlimitedStorage` | Screenshots are large; avoid the default quota            |
| `downloads`        | Save a PNG to disk into a per-folder subfolder            |
| `host_permissions` | `https://*.supabase.co/*` — talk to Supabase Auth         |

## Roadmap

- [x] Screenshot capture of the current tab
- [x] Create / rename / delete folders
- [x] Gallery with preview, move, download, delete
- [x] **Supabase login** (email/password) gating the whole extension
- [x] **Per-user cloud storage** of folders and screenshots (RLS-protected)
- [x] **Stripe subscription paywall** ($7/month) via Supabase Edge Functions
- [ ] OAuth providers (e.g. Google) — needs a stable extension ID
- [ ] Move image bytes to Supabase Storage (vs. base64 in a column) for scale
- [ ] Thumbnail column so grids load without fetching full images

> Auth lives in `lib/auth.js` (a small fetch-based GoTrue client),
> `lib/config.js` (connection settings), and `lib/authview.js` (the shared
> sign-in / setup UI). Data access is in `lib/storage.js` over `lib/db.js`
> (PostgREST).
