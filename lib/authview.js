// authview.js
// Renders the setup + sign-in / sign-up UI into a container element. Shared by
// the popup and the gallery so both surfaces gate access the same way.

import { isConfigured, setConfig, getConfig } from './config.js';
import { signIn, signUp } from './auth.js';

// mountAuth(root, onAuthed): draws the right screen. Calls onAuthed() once the
// user is signed in.
export async function mountAuth(root, onAuthed) {
  if (!(await isConfigured())) {
    renderSetup(root, () => mountAuth(root, onAuthed));
  } else {
    renderAuthForm(root, onAuthed);
  }
}

function el(html) {
  const t = document.createElement('template');
  t.innerHTML = html.trim();
  return t.content.firstElementChild;
}

function renderSetup(root, done) {
  root.innerHTML = '';
  const form = el(`
    <div class="auth-card">
      <h2 class="auth-title">Connect Supabase</h2>
      <p class="auth-sub">Enter your project details once. Find them in your
        Supabase dashboard under <b>Project Settings → API</b>.</p>
      <label class="auth-label">Project URL</label>
      <input class="auth-input" id="cfgUrl" type="url"
        placeholder="https://your-project.supabase.co" autocomplete="off" />
      <label class="auth-label">Anon / public key</label>
      <input class="auth-input" id="cfgKey" type="password"
        placeholder="eyJ… (the public anon key)" autocomplete="off" />
      <p class="auth-hint">Use the <b>anon public</b> key — never the
        service_role secret.</p>
      <button class="auth-btn" id="cfgSave" type="button">Save &amp; continue</button>
      <p class="auth-error" id="cfgErr" role="alert"></p>
    </div>
  `);
  root.appendChild(form);

  const err = form.querySelector('#cfgErr');
  form.querySelector('#cfgSave').addEventListener('click', async () => {
    err.textContent = '';
    try {
      await setConfig(
        form.querySelector('#cfgUrl').value,
        form.querySelector('#cfgKey').value
      );
      done();
    } catch (e) {
      err.textContent = e.message;
    }
  });
}

function renderAuthForm(root, onAuthed) {
  root.innerHTML = '';
  let mode = 'signin'; // or 'signup'

  const card = el(`
    <div class="auth-card">
      <h2 class="auth-title" id="authTitle">Sign in</h2>
      <p class="auth-sub" id="authSub">Sign in to use Snapshot Folders.</p>
      <label class="auth-label">Email</label>
      <input class="auth-input" id="authEmail" type="email"
        placeholder="you@example.com" autocomplete="username" />
      <label class="auth-label">Password</label>
      <input class="auth-input" id="authPass" type="password"
        placeholder="Your password" autocomplete="current-password" />
      <button class="auth-btn" id="authSubmit" type="button">Sign in</button>
      <p class="auth-toggle">
        <span id="authToggleText">New here?</span>
        <a href="#" id="authToggle">Create an account</a>
      </p>
      <p class="auth-error" id="authErr" role="alert"></p>
      <p class="auth-note" id="authNote"></p>
    </div>
  `);
  root.appendChild(card);

  const q = (id) => card.querySelector('#' + id);
  const title = q('authTitle');
  const sub = q('authSub');
  const submit = q('authSubmit');
  const toggle = q('authToggle');
  const toggleText = q('authToggleText');
  const err = q('authErr');
  const note = q('authNote');
  const emailEl = q('authEmail');
  const passEl = q('authPass');

  function applyMode() {
    const signup = mode === 'signup';
    title.textContent = signup ? 'Create account' : 'Sign in';
    sub.textContent = signup
      ? 'Create an account to use Snapshot Folders.'
      : 'Sign in to use Snapshot Folders.';
    submit.textContent = signup ? 'Sign up' : 'Sign in';
    toggleText.textContent = signup ? 'Have an account?' : 'New here?';
    toggle.textContent = signup ? 'Sign in' : 'Create an account';
    passEl.autocomplete = signup ? 'new-password' : 'current-password';
    err.textContent = '';
    note.textContent = '';
  }
  applyMode();

  toggle.addEventListener('click', (e) => {
    e.preventDefault();
    mode = mode === 'signup' ? 'signin' : 'signup';
    applyMode();
  });

  async function doSubmit() {
    err.textContent = '';
    note.textContent = '';
    const email = emailEl.value.trim();
    const password = passEl.value;
    if (!email || !password) {
      err.textContent = 'Enter your email and password.';
      return;
    }
    submit.disabled = true;
    submit.textContent = 'Please wait…';
    try {
      if (mode === 'signup') {
        const res = await signUp(email, password);
        if (res.signedIn) {
          onAuthed();
        } else {
          note.textContent =
            'Account created. Check your email to confirm, then sign in.';
          mode = 'signin';
          applyMode();
        }
      } else {
        await signIn(email, password);
        onAuthed();
      }
    } catch (e2) {
      err.textContent = e2.message;
    } finally {
      submit.disabled = false;
      applyMode();
    }
  }

  submit.addEventListener('click', doSubmit);
  passEl.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') doSubmit();
  });
}
