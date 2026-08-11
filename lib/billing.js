// billing.js
// Subscription status checks + starting Stripe Checkout. The extension never
// holds any Stripe secret — it reads the user's subscription row (written by
// the webhook via service role) and asks an Edge Function for a Checkout URL.

import { getConfig } from './config.js';
import { getSession } from './auth.js';
import { rest, q } from './db.js';

const SUBS_TABLE = 'chrome_snapshot_subscriptions';
const ACTIVE_STATUSES = new Set(['active', 'trialing']);

// The current user's subscription row, or a synthetic inactive one.
export async function getSubscription() {
  const rows = await rest(SUBS_TABLE, {
    query: q({ select: 'status,current_period_end,price_id' }),
  });
  return rows[0] || { status: 'inactive' };
}

export async function isSubscribed() {
  try {
    const sub = await getSubscription();
    return ACTIVE_STATUSES.has(sub.status);
  } catch (e) {
    // If the check fails (e.g. table missing), treat as not subscribed but
    // surface the reason to the caller if it wants it.
    throw e;
  }
}

// Asks the create-checkout-session Edge Function for a Stripe Checkout URL for
// the signed-in user. Returns the URL (open it in a new tab).
export async function startCheckout() {
  const { url, anonKey } = await getConfig();
  const session = await getSession();
  if (!session) throw new Error('Please sign in first.');

  const endpoint = `${url.replace(/\/+$/, '')}/functions/v1/create-checkout-session`;
  let res;
  try {
    res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: anonKey,
        Authorization: 'Bearer ' + session.access_token,
      },
      body: JSON.stringify({}),
    });
  } catch (_) {
    throw new Error('Could not reach the checkout service. Check your network.');
  }

  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.url) {
    throw new Error(
      data.error ||
        'Could not start checkout. Is the create-checkout-session function deployed?'
    );
  }
  return data.url;
}
