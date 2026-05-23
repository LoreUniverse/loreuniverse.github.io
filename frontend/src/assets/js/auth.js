/**
 * auth.js — Better Auth browser client
 *
 * Loaded on every page as <script type="module">.
 * Exports: getSession, signIn, signUp, signOut
 * Side effect: updates the nav Account dropdown on DOMContentLoaded.
 */
import { createAuthClient } from 'https://esm.sh/better-auth@1.6.11/client';

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------
const API_BASE     = 'https://loreuniverse-api.fly.dev';
const CACHE_KEY    = 'lr-session';
const CACHE_TTL_MS = 30_000; // 30 seconds

const authClient = createAuthClient({ baseURL: API_BASE });

// ---------------------------------------------------------------------------
// Session cache (sessionStorage, 30-second TTL)
// ---------------------------------------------------------------------------

/** @returns {object|null} cached session object, or null if missing/expired */
function getCachedSession() {
  try {
    const raw = sessionStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const { session, ts } = JSON.parse(raw);
    if (Date.now() - ts > CACHE_TTL_MS) {
      sessionStorage.removeItem(CACHE_KEY);
      return null;
    }
    return session;
  } catch {
    return null;
  }
}

/** @param {object|null} session */
function setCachedSession(session) {
  try {
    sessionStorage.setItem(CACHE_KEY, JSON.stringify({ session, ts: Date.now() }));
  } catch { /* quota exceeded — degrade silently */ }
}

function clearCachedSession() {
  try { sessionStorage.removeItem(CACHE_KEY); } catch { }
}

// ---------------------------------------------------------------------------
// Public API (exported for page scripts to import)
// ---------------------------------------------------------------------------

/**
 * Returns the current session object (from cache or API).
 * Returns null if the user is not signed in.
 * @returns {Promise<object|null>}
 */
export async function getSession() {
  const cached = getCachedSession();
  if (cached !== null) return cached;
  const { data } = await authClient.getSession();
  const session = data ?? null;
  setCachedSession(session);
  return session;
}

/**
 * Sign in with email + password.
 * Returns the Better Auth result object: { data, error }.
 * Clears the session cache on success.
 * @param {string} email
 * @param {string} password
 * @returns {Promise<{data: object|null, error: object|null}>}
 */
export async function signIn(email, password) {
  const result = await authClient.signIn.email({ email, password });
  if (!result.error) clearCachedSession();
  return result;
}

/**
 * Register a new account.
 * Passes callbackURL so the verification link redirects back to the site.
 * Returns the Better Auth result object: { data, error }.
 * @param {string} name
 * @param {string} email
 * @param {string} password
 * @returns {Promise<{data: object|null, error: object|null}>}
 */
export async function signUp(name, email, password) {
  return authClient.signUp.email({
    name,
    email,
    password,
    callbackURL: 'https://loreuniverse.github.io/',
  });
}

/**
 * Sign out and clear the session cache.
 * @returns {Promise<void>}
 */
export async function signOut() {
  await authClient.signOut();
  clearCachedSession();
}

// ---------------------------------------------------------------------------
// Nav update
// ---------------------------------------------------------------------------

/**
 * Reveals the Account nav button and populates its dropdown
 * based on the current session.
 * @param {object|null} session
 */
function updateNav(session) {
  const accountItem = document.getElementById('nav-account');
  const accountBtn  = document.getElementById('nav-account-btn');
  const accountMenu = document.getElementById('nav-account-menu');
  if (!accountItem || !accountBtn || !accountMenu) return;

  if (session) {
    // Logged-in state: show first name + Profile / Sign out dropdown
    const firstName = (session.user?.name || 'Account').split(' ')[0];
    accountBtn.textContent = firstName;
    accountMenu.innerHTML = `
      <li class="nav__subitem">
        <a class="nav__sublink" href="/account/profile/">Profile</a>
      </li>
      <li class="nav__subitem nav__subitem--divider" role="separator"></li>
      <li class="nav__subitem">
        <button class="nav__sublink nav__sublink--btn" id="nav-sign-out-btn" type="button">
          Sign out
        </button>
      </li>
    `;
    document.getElementById('nav-sign-out-btn')?.addEventListener('click', async () => {
      await signOut();
      location.href = '/';
    });
  } else {
    // Logged-out state: show Sign in / Register links
    accountBtn.textContent = 'Account';
    accountMenu.innerHTML = `
      <li class="nav__subitem">
        <a class="nav__sublink" href="/account/">Sign in</a>
      </li>
      <li class="nav__subitem">
        <a class="nav__sublink" href="/account/?tab=register">Register</a>
      </li>
    `;
  }

  // Reveal the button (was visibility:hidden to prevent FOUC)
  accountItem.style.visibility = '';
}

// ---------------------------------------------------------------------------
// Boot: check session on every page load, update nav
// ---------------------------------------------------------------------------
document.addEventListener('DOMContentLoaded', async () => {
  const session = await getSession();
  updateNav(session);
});
