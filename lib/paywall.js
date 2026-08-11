// paywall.js
// Renders the subscription paywall. Shown to signed-in users who don't yet have
// an active subscription. Subscribe opens Stripe Checkout in a new tab; the
// view polls the subscription status and calls onActive() once payment lands.

import { startCheckout, isSubscribed } from './billing.js';

const PRICE_LABEL = '$7';
const PRICE_PERIOD = '/ month';

const FEATURES = [
  'Unlimited screenshot captures — full page or a selected area',
  'Organize captures into unlimited folders',
  'Private cloud storage — your captures, tied to your account',
  'Access your library from any device you sign in on',
  'One-click download of any screenshot',
];

// mountPaywall(root, { user, onActive, onSignOut })
export function mountPaywall(root, { user, onActive, onSignOut }) {
  root.innerHTML = '';
  let polling = null;

  const stop = () => {
    if (polling) {
      clearInterval(polling);
      polling = null;
    }
  };

  const card = el(`
    <div class="pw-card">
      <div class="pw-badge">Pro</div>
      <h2 class="pw-title">Unlock Snapshot Folders</h2>
      <p class="pw-sub">Start your subscription to capture and sync your screenshots.</p>
      <div class="pw-price">
        <span class="pw-amount">${PRICE_LABEL}</span>
        <span class="pw-period">${PRICE_PERIOD}</span>
      </div>
      <ul class="pw-features"></ul>
      <button class="pw-btn" id="pwSubscribe" type="button">Subscribe with Stripe</button>
      <button class="pw-refresh" id="pwRefresh" type="button">I've completed payment — refresh</button>
      <p class="pw-error" id="pwErr" role="alert"></p>
      <p class="pw-foot">
        <span class="pw-email">${escapeHtml(user?.email || '')}</span>
        <a href="#" id="pwSignOut">Sign out</a>
      </p>
    </div>
  `);

  const list = card.querySelector('.pw-features');
  for (const f of FEATURES) {
    const li = document.createElement('li');
    li.innerHTML = `<span class="pw-check">✓</span><span>${escapeHtml(f)}</span>`;
    list.appendChild(li);
  }
  root.appendChild(card);

  const err = card.querySelector('#pwErr');
  const subscribeBtn = card.querySelector('#pwSubscribe');
  const refreshBtn = card.querySelector('#pwRefresh');

  async function recheck() {
    try {
      if (await isSubscribed()) {
        stop();
        onActive();
        return true;
      }
    } catch (_) {
      /* ignore transient errors while polling */
    }
    return false;
  }

  subscribeBtn.addEventListener('click', async () => {
    err.textContent = '';
    subscribeBtn.disabled = true;
    subscribeBtn.textContent = 'Opening checkout…';
    try {
      const checkoutUrl = await startCheckout();
      chrome.tabs.create({ url: checkoutUrl });
      // Poll so the extension unlocks automatically once the webhook records
      // the payment.
      subscribeBtn.textContent = 'Waiting for payment…';
      stop();
      polling = setInterval(recheck, 4000);
    } catch (e) {
      err.textContent = e.message;
      subscribeBtn.disabled = false;
      subscribeBtn.textContent = 'Subscribe with Stripe';
    }
  });

  refreshBtn.addEventListener('click', async () => {
    err.textContent = '';
    refreshBtn.disabled = true;
    const ok = await recheck();
    if (!ok) {
      err.textContent = 'No active subscription found yet. If you just paid, wait a moment and try again.';
      refreshBtn.disabled = false;
    }
  });

  card.querySelector('#pwSignOut').addEventListener('click', (e) => {
    e.preventDefault();
    stop();
    onSignOut();
  });

  // Re-check when the window regains focus (e.g. returning from the Stripe tab).
  const onFocus = () => recheck();
  window.addEventListener('focus', onFocus);
}

function el(html) {
  const t = document.createElement('template');
  t.innerHTML = html.trim();
  return t.content.firstElementChild;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])
  );
}
