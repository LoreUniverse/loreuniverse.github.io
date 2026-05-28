/**
 * auth.js — Auth client using native fetch
 *
 * No external dependencies — uses browser fetch with credentials: 'include'.
 * Loaded on every page as <script type="module">.
 * Exports: getSession, signIn, signUp, signOut
 * Side effect: updates the nav Account dropdown on DOMContentLoaded.
 */

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------
const API_BASE     = 'https://loreuniverse-api.fly.dev';
const CACHE_KEY    = 'lr-session';
const CACHE_TTL_MS = 30_000; // 30 seconds

// ---------------------------------------------------------------------------
// Low-level fetch helper — always returns { data, error }, never throws
// ---------------------------------------------------------------------------

async function apiFetch(path, init = {}) {
  try {
    const res = await fetch(`${API_BASE}${path}`, {
      credentials: 'include',
      ...init,
    });

    // 401 = unauthenticated, 204 = no content — both mean "no session"
    if (res.status === 401 || res.status === 204) {
      return { data: null, error: null };
    }

    let body;
    try { body = await res.json(); } catch { body = null; }

    if (!res.ok) {
      const message = body?.message || body?.error || `Request failed (${res.status})`;
      return { data: null, error: { message, status: res.status } };
    }

    return { data: body ?? null, error: null };
  } catch {
    // Network error or CORS block
    return { data: null, error: { message: 'Network error — please try again.' } };
  }
}

// ---------------------------------------------------------------------------
// Session cache (sessionStorage, 30-second TTL)
// ---------------------------------------------------------------------------

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

function setCachedSession(session) {
  try {
    sessionStorage.setItem(CACHE_KEY, JSON.stringify({ session, ts: Date.now() }));
  } catch { /* storage quota exceeded — degrade silently */ }
}

function clearCachedSession() {
  try { sessionStorage.removeItem(CACHE_KEY); } catch { }
}

// ---------------------------------------------------------------------------
// Public API (exported for page scripts to import)
// ---------------------------------------------------------------------------

/**
 * Returns the current session object, or null if not signed in.
 * Caches the result in sessionStorage for 30 seconds.
 * @returns {Promise<{user: object, session: object}|null>}
 */
export async function getSession() {
  const cached = getCachedSession();
  if (cached !== null) return cached;

  const { data } = await apiFetch('/api/auth/get-session');
  // A valid session always has a user object
  const session = (data && data.user) ? data : null;
  setCachedSession(session);
  return session;
}

/**
 * Sign in with email + password.
 * Returns { data, error } — error.message is safe to show to the user.
 * @param {string} email
 * @param {string} password
 * @returns {Promise<{data: object|null, error: {message: string}|null}>}
 */
export async function signIn(email, password) {
  const result = await apiFetch('/api/auth/sign-in/email', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  if (!result.error) {
    // Cache the session from the sign-in response immediately so the nav
    // updates on the next page even if the cookie round-trip is slow.
    if (result.data?.user) {
      setCachedSession(result.data);
    } else {
      // 401 response from apiFetch arrives as { data: null, error: null }.
      // Surface it as a user-facing error rather than silently redirecting.
      clearCachedSession();
      return { data: null, error: { message: 'Invalid email or password.' } };
    }
  }
  return result;
}

/**
 * Register a new account.
 * callbackURL makes the verification link redirect back to the frontend.
 * Returns { data, error }.
 * @param {string} name
 * @param {string} email
 * @param {string} password
 * @returns {Promise<{data: object|null, error: {message: string}|null}>}
 */
export async function signUp(name, email, password) {
  return apiFetch('/api/auth/sign-up/email', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name,
      email,
      password,
      callbackURL: 'https://loreuniverse.github.io/',
    }),
  });
}

/**
 * Sign out and clear the local session cache.
 * @returns {Promise<void>}
 */
export async function signOut() {
  await apiFetch('/api/auth/sign-out', { method: 'POST' });
  clearCachedSession();
}

// ---------------------------------------------------------------------------
// Nav update
// ---------------------------------------------------------------------------

/**
 * Reveals the Account nav button and populates its dropdown
 * based on the current session. Always called — even on error.
 * @param {object|null} session
 */
function updateNav(session) {
  const accountItem = document.getElementById('nav-account');
  const accountBtn  = document.getElementById('nav-account-btn');
  const accountMenu = document.getElementById('nav-account-menu');
  if (!accountItem || !accountBtn || !accountMenu) return;

  if (session) {
    // Logged-in: show first name + Profile / Sign out
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
    // Logged-out: show Sign in / Register
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

}

// ---------------------------------------------------------------------------
// Boot: check session on every page load, then update nav
// ---------------------------------------------------------------------------
document.addEventListener('DOMContentLoaded', async () => {
  try {
    const session = await getSession();
    updateNav(session);
  } catch {
    // Last-resort fallback: always show the button in logged-out state
    updateNav(null);
  }
});
