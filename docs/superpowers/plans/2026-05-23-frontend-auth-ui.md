# Frontend Auth UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a login/register page, profile page, and Account nav dropdown to the Eleventy frontend, connecting to the Better Auth backend at `loreuniverse-api.fly.dev`.

**Architecture:** The frontend stays a pure static Eleventy site — no bundler, no SSR. A single ES module `auth.js` (imported via `<script type="module">`) initialises the Better Auth browser client from esm.sh, maintains a 30-second `sessionStorage` cache, populates the nav Account dropdown, and exports `getSession / signIn / signUp / signOut` for page-level scripts to import directly. Account pages contain their own `<script type="module">` blocks that import from `auth.js`. The nav Account button is hidden by default (`visibility: hidden`) and revealed by `auth.js` after the first session check resolves.

**Tech Stack:** Eleventy 3 · Nunjucks · Vanilla ES modules (browser-native, no bundler) · `better-auth@1.6.11` client via `esm.sh` CDN · Plain CSS

---

## ⚠️ Prerequisite

**Foundation B (`worktree-foundation-b-database-auth-email`) must be merged to `main` before starting this plan.** All backend files (`backend/src/features/auth/better-auth.ts`, etc.) must exist on `main`. This plan's new worktree should be created from a `main` that already includes Foundation B.

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `backend/src/features/auth/better-auth.ts` | **Modify** | Add `SameSite=None; Secure` cookie config for cross-origin production use |
| `frontend/src/_includes/base.njk` | **Modify** | Add hidden Account nav `<li>` outside the data loop; load `auth.js` as `type="module"` |
| `frontend/src/assets/js/auth.js` | **Create** | Better Auth client init, session cache, nav update, exported auth functions |
| `frontend/src/assets/css/reader.css` | **Modify** | Account button, dropdown, form, tabs, badges, profile styles |
| `frontend/src/account/index.njk` | **Create** | Login / register tabs page |
| `frontend/src/account/profile/index.njk` | **Create** | Profile page with auth guard |

---

## Task C-1: Backend — Add SameSite=None cookie config

**Context:** The frontend is on `loreuniverse.github.io`; the backend is on `loreuniverse-api.fly.dev`. Cross-origin cookies require `SameSite=None; Secure`. Better Auth defaults to `SameSite=Lax`. We only apply this override in production (HTTPS), so local dev and tests (HTTP) are unaffected.

**Files:**
- Modify: `backend/src/features/auth/better-auth.ts`

- [ ] **Step 1: Open `better-auth.ts` and add the `advanced` cookie override**

  Replace the `return betterAuth({` block. The full updated file (`better-auth.ts`) should be:

  ```typescript
  import { betterAuth } from 'better-auth';
  import { drizzleAdapter } from 'better-auth/adapters/drizzle';
  import type { drizzle } from 'drizzle-orm/postgres-js';
  import { schema } from '../../db/schema.js';
  import { createEmailSender, type EmailSender } from '../email/sender.js';

  type Db = ReturnType<typeof drizzle<typeof schema>>;

  export type AuthConfig = {
    db: Db;
    baseUrl: string;
    secret: string;
    emailSender?: EmailSender;
  };

  export function createAuth(config: AuthConfig) {
    const sender = config.emailSender ?? createEmailSender();
    const isSecure = config.baseUrl.startsWith('https://');

    return betterAuth({
      database: drizzleAdapter(config.db, {
        provider: 'pg',
        schema: {
          user: schema.users as any,
          session: schema.sessions as any,
          account: schema.accounts as any,
          verification: schema.verifications as any,
        },
      }),
      baseURL: config.baseUrl,
      secret: config.secret,
      emailAndPassword: {
        enabled: true,
        requireEmailVerification: true,
        autoSignIn: false,
        sendResetPassword: async ({ user, url }) => {
          await sender.send({
            to: user.email,
            subject: 'Reset your Lore Universe password',
            html: `<p>Hi ${user.name ?? ''},</p>
              <p>Click <a href="${url}">this link</a> to reset your password.</p>
              <p>If you didn't request this, you can ignore this email.</p>`,
            text: `Hi ${user.name ?? ''},\n\nClick the following link to reset your password:\n${url}\n\nIf you didn't request this, you can ignore this email.`,
          });
        },
      },
      emailVerification: {
        sendOnSignUp: true,
        autoSignInAfterVerification: true,
        sendVerificationEmail: async ({ user, url }) => {
          await sender.send({
            to: user.email,
            subject: 'Verify your Lore Universe account',
            html: `<p>Welcome to Lore Universe, ${user.name ?? ''}!</p>
              <p>Verify your email by clicking <a href="${url}">this link</a>.</p>`,
            text: `Welcome to Lore Universe, ${user.name ?? ''}!\n\nVerify your email by visiting this link:\n${url}`,
          });
        },
      },
      user: {
        additionalFields: {
          role: { type: 'string', defaultValue: 'user', input: false },
          tier: { type: 'string', defaultValue: 'free', input: false },
          isBanned: { type: 'boolean', defaultValue: false, input: false, fieldName: 'isBanned' },
          bannedAt: { type: 'date', required: false, input: false, fieldName: 'bannedAt' },
          bannedReason: { type: 'string', required: false, input: false, fieldName: 'bannedReason' },
        },
      },
      session: {
        expiresIn: 60 * 60 * 24 * 7,
        updateAge: 60 * 60 * 24,
      },
      ...(isSecure
        ? {
            advanced: {
              defaultCookieAttributes: {
                sameSite: 'none' as 'none',
                secure: true,
              },
            },
          }
        : {}),
      trustedOrigins: (process.env.ALLOWED_ORIGINS ?? '').split(',').filter(Boolean),
    });
  }

  export type AuthInstance = ReturnType<typeof createAuth>;
  ```

- [ ] **Step 2: Run backend tests to confirm nothing broke**

  From `backend/`:
  ```
  npm test
  ```
  Expected: all tests pass (the `isSecure` guard is `false` in tests since the base URL is `http://localhost:*`, so cookie attributes are unchanged).

- [ ] **Step 3: Commit**

  ```bash
  git add backend/src/features/auth/better-auth.ts
  git commit -m "fix(auth): set SameSite=None; Secure on session cookies for cross-origin prod use"
  ```

---

## Task C-2: Frontend — Add Account nav item + load auth.js in base.njk

**Context:** The Account button must live outside the `{% for item in navigation %}` loop because its content is JS-driven (logged-in vs logged-out states). It starts with `visibility: hidden` and gets revealed by `auth.js` after the session check. We also add the `<script type="module">` tag that loads `auth.js`.

**Files:**
- Modify: `frontend/src/_includes/base.njk`

- [ ] **Step 1: Add the Account `<li>` after the nav loop and the module script tag**

  In `base.njk`, find:

  ```njk
        {% for item in navigation %}
  ```

  The closing part of the nav looks like:

  ```njk
          </li>
          {% endfor %}
        </ul>
      </nav>
    </header>
  ```

  Replace from `{% endfor %}` through `</header>` with:

  ```njk
          </li>
          {% endfor %}

          {#
            Account button — outside the data loop because its content is JS-driven.
            Starts hidden (visibility:hidden preserves layout space) and is revealed
            by auth.js after the session check resolves, preventing any flicker.
          #}
          <li class="nav__item nav__item--account" id="nav-account" style="visibility:hidden">
            <button
              class="nav__account-btn"
              id="nav-account-btn"
              type="button"
              aria-expanded="false"
              aria-controls="nav-account-menu"
              data-nav-toggle
            >Account</button>
            <ul
              class="nav__submenu"
              id="nav-account-menu"
              hidden
            >
              <li class="nav__subitem"><a class="nav__sublink" href="/account/">Sign in</a></li>
              <li class="nav__subitem"><a class="nav__sublink" href="/account/?tab=register">Register</a></li>
            </ul>
          </li>
        </ul>
      </nav>
    </header>
  ```

- [ ] **Step 2: Add the module script tag before the closing `</body>`**

  Find in `base.njk`:

  ```html
    <script src="/assets/js/reader.js" defer></script>

  </body>
  </html>
  ```

  Replace with:

  ```html
    <script src="/assets/js/reader.js" defer></script>
    <script type="module" src="/assets/js/auth.js"></script>

  </body>
  </html>
  ```

- [ ] **Step 3: Start the dev server and verify the nav renders without errors**

  From `frontend/`:
  ```
  npm start
  ```
  Open `http://localhost:8080`. Open DevTools Console. You should see a 404 for `/assets/js/auth.js` (expected — file doesn't exist yet) but no Nunjucks errors. The nav should render with a hidden Account button slot at the right end of the nav bar (the `visibility:hidden` keeps the layout space, so you may see a gap).

- [ ] **Step 4: Commit**

  ```bash
  git add frontend/src/_includes/base.njk
  git commit -m "feat(frontend): add hidden Account nav slot and load auth.js module"
  ```

---

## Task C-3: Frontend — Add auth-related styles to reader.css

**Context:** Styles for: (1) the Account nav button that sits at the right side of the nav bar, (2) the sign-out button inside the dropdown, (3) the login/register form page, (4) the profile page, and (5) shared form inputs, badges, and buttons.

**Files:**
- Modify: `frontend/src/assets/css/reader.css`

- [ ] **Step 1: Append the auth styles block to the end of `reader.css`**

  Add the following at the very end of the file:

  ```css
  /* -----------------------------------------------------------------
     Account nav button (rightmost, JS-driven)
     ----------------------------------------------------------------- */
  .nav__item--account {
    margin-left: auto;
  }

  .nav__account-btn {
    background: none;
    border: 1px solid var(--clr-border);
    border-radius: 0.375rem;
    cursor: pointer;
    padding: 0.25rem 0.75rem;
    font-family: var(--font-ui);
    font-size: 0.875rem;
    color: var(--clr-text);
    transition: border-color 0.15s, color 0.15s;
    white-space: nowrap;
  }

  .nav__account-btn:hover {
    border-color: var(--clr-accent);
    color: var(--clr-accent);
  }

  /* Divider row inside account dropdown */
  .nav__subitem--divider {
    border-top: 1px solid var(--clr-border);
    margin: 0.25rem 0;
    padding: 0;
  }

  /* Sign-out button styled to look like a nav link */
  .nav__sublink--btn {
    display: block;
    width: 100%;
    background: none;
    border: none;
    cursor: pointer;
    padding: 0.4rem 1rem;
    text-align: left;
    font-family: var(--font-ui);
    font-size: 0.875rem;
    color: var(--clr-text);
    transition: background-color 0.1s, color 0.1s;
  }

  .nav__sublink--btn:hover {
    background-color: var(--clr-border);
    color: var(--clr-accent);
  }

  /* -----------------------------------------------------------------
     Shared form primitives (used on /account/ and future pages)
     ----------------------------------------------------------------- */
  .form-card {
    background: var(--clr-surface);
    border: 1px solid var(--clr-border);
    border-radius: 0.5rem;
    padding: 1.5rem;
  }

  .form-group {
    margin-bottom: 1rem;
  }

  .form-group label {
    display: block;
    font-family: var(--font-ui);
    font-size: 0.75rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--clr-text-muted);
    margin-bottom: 0.375rem;
  }

  .form-group input[type="text"],
  .form-group input[type="email"],
  .form-group input[type="password"] {
    width: 100%;
    padding: 0.5rem 0.75rem;
    border: 1px solid var(--clr-border);
    border-radius: 0.375rem;
    background: var(--clr-bg);
    color: var(--clr-text);
    font-family: var(--font-ui);
    font-size: 0.9rem;
    transition: border-color 0.15s;
  }

  .form-group input:focus {
    outline: none;
    border-color: var(--clr-accent);
  }

  .form-error {
    font-family: var(--font-ui);
    font-size: 0.8rem;
    color: #c0392b;
    margin-top: 0.5rem;
    min-height: 1.2em;
  }

  .form-success {
    font-family: var(--font-ui);
    font-size: 0.9rem;
    text-align: center;
    padding: 1.25rem 0 0.5rem;
    color: var(--clr-text);
  }

  /* Primary action button (full-width, accent fill) */
  .btn-primary {
    display: block;
    width: 100%;
    margin-top: 1.25rem;
    padding: 0.6rem 1rem;
    background: var(--clr-accent);
    color: #fff;
    border: none;
    border-radius: 0.375rem;
    font-family: var(--font-ui);
    font-size: 0.9rem;
    cursor: pointer;
    transition: background-color 0.15s;
  }

  .btn-primary:hover  { background: var(--clr-accent-hover); }
  .btn-primary:disabled { opacity: 0.6; cursor: not-allowed; }

  /* Secondary action button (outline) */
  .btn-secondary {
    padding: 0.5rem 1.25rem;
    background: none;
    color: var(--clr-text);
    border: 1px solid var(--clr-border);
    border-radius: 0.375rem;
    font-family: var(--font-ui);
    font-size: 0.875rem;
    cursor: pointer;
    transition: border-color 0.15s, color 0.15s;
  }

  .btn-secondary:hover {
    border-color: var(--clr-accent);
    color: var(--clr-accent);
  }

  /* -----------------------------------------------------------------
     Tab strip (login/register page)
     ----------------------------------------------------------------- */
  .tab-strip {
    display: flex;
    border-bottom: 2px solid var(--clr-border);
    margin-bottom: 1.5rem;
  }

  .tab-btn {
    background: none;
    border: none;
    border-bottom: 2px solid transparent;
    margin-bottom: -2px;
    cursor: pointer;
    padding: 0.5rem 1.25rem;
    font-family: var(--font-ui);
    font-size: 0.875rem;
    color: var(--clr-text-muted);
    transition: color 0.15s, border-color 0.15s;
  }

  .tab-btn[aria-selected="true"] {
    color: var(--clr-accent);
    border-bottom-color: var(--clr-accent);
  }

  .tab-panel[hidden] { display: none; }

  /* -----------------------------------------------------------------
     Auth page layout (/account/)
     ----------------------------------------------------------------- */
  .auth-page {
    max-width: 28rem;
    margin: 3rem auto;
  }

  .auth-page h1 {
    font-family: var(--font-ui);
    font-size: 1.5rem;
    margin-bottom: 1.5rem;
    text-align: center;
  }

  /* -----------------------------------------------------------------
     Profile page layout (/account/profile/)
     ----------------------------------------------------------------- */
  .profile-page {
    max-width: 32rem;
    margin: 3rem auto;
  }

  .profile-page h1 {
    font-family: var(--font-ui);
    font-size: 1.5rem;
    margin-bottom: 1.5rem;
  }

  .profile-card {
    background: var(--clr-surface);
    border: 1px solid var(--clr-border);
    border-radius: 0.5rem;
    padding: 1.5rem;
    margin-bottom: 1.25rem;
  }

  .profile-field {
    display: flex;
    gap: 1rem;
    align-items: baseline;
    padding: 0.65rem 0;
    border-bottom: 1px solid var(--clr-border);
  }

  .profile-field:last-of-type { border-bottom: none; }

  .profile-label {
    min-width: 4rem;
    font-family: var(--font-ui);
    font-size: 0.75rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--clr-text-muted);
  }

  .profile-value {
    font-family: var(--font-ui);
    font-size: 0.9rem;
    color: var(--clr-text);
  }

  /* -----------------------------------------------------------------
     Badges (role / tier)
     ----------------------------------------------------------------- */
  .badge {
    display: inline-block;
    padding: 0.15rem 0.5rem;
    border-radius: 999px;
    font-family: var(--font-ui);
    font-size: 0.7rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  /* admin badge: purple tint (matches accent) */
  .badge--admin {
    background: #ede8f7;
    color: #4e3888;
  }

  [data-theme="dark"] .badge--admin {
    background: #2e2848;
    color: #c0a0e0;
  }

  /* user / free badges: muted neutral */
  .badge--user,
  .badge--free {
    background: var(--clr-ctrl-bg);
    border: 1px solid var(--clr-border);
    color: var(--clr-text-muted);
  }
  ```

- [ ] **Step 2: Verify the styles load without errors**

  The dev server from C-2 should hot-reload. Open `http://localhost:8080`. The Account button area (invisible, but space reserved) should appear at the right side of the nav bar. No console errors.

- [ ] **Step 3: Commit**

  ```bash
  git add frontend/src/assets/css/reader.css
  git commit -m "feat(frontend): add auth styles — account nav, forms, tabs, badges, profile"
  ```

---

## Task C-4: Frontend — Create auth.js (core auth module)

**Context:** This ES module is the single source of truth for auth state. It imports the Better Auth browser client from the esm.sh CDN (pinned to `better-auth@1.6.11`). It caches the session in `sessionStorage` for 30 seconds, updates the nav Account button/dropdown, and exports four functions that page scripts import directly.

**Files:**
- Create: `frontend/src/assets/js/auth.js`

- [ ] **Step 1: Create `auth.js`**

  ```js
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
  const API_BASE       = 'https://loreuniverse-api.fly.dev';
  const CACHE_KEY      = 'lr-session';
  const CACHE_TTL_MS   = 30_000; // 30 seconds

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
  ```

- [ ] **Step 2: Open `http://localhost:8080` and verify auth.js loads without errors**

  Open DevTools → Console. You should see no errors. The Account button should appear in the nav after ~0.5s (the `getSession()` call). Since you're not signed in, it should show "Account" with Sign in / Register links in the dropdown.

  If you see `Failed to resolve module specifier`, make sure the `<script type="module">` tag was added in C-2.

- [ ] **Step 3: Commit**

  ```bash
  git add frontend/src/assets/js/auth.js
  git commit -m "feat(frontend): add auth.js — session cache, nav update, auth client exports"
  ```

---

## Task C-5: Frontend — Create /account/index.njk (login/register page)

**Context:** Two tabs: "Sign in" (email + password) and "Create account" (name + email + password). The active tab is driven by the `?tab=register` query param on page load. After successful sign-in, the user is redirected to `?redirect=` or `/`. After successful register, the form is replaced with a "Check your email" confirmation. Both forms use `signIn`/`signUp` exported from `auth.js`.

**Files:**
- Create: `frontend/src/account/index.njk`

- [ ] **Step 1: Create the directory and file**

  ```bash
  mkdir -p frontend/src/account
  ```

  Create `frontend/src/account/index.njk`:

  ```njk
  ---
  layout: base.njk
  title: Account
  ---

  <div class="auth-page">
    <h1>Account</h1>

    <div class="tab-strip" role="tablist">
      <button
        class="tab-btn"
        id="tab-signin"
        role="tab"
        aria-selected="true"
        aria-controls="panel-signin"
        type="button"
      >Sign in</button>
      <button
        class="tab-btn"
        id="tab-register"
        role="tab"
        aria-selected="false"
        aria-controls="panel-register"
        type="button"
      >Create account</button>
    </div>

    {# Sign-in panel #}
    <div id="panel-signin" class="tab-panel" role="tabpanel" aria-labelledby="tab-signin">
      <div class="form-card">
        <form id="signin-form" novalidate>
          <div class="form-group">
            <label for="signin-email">Email</label>
            <input id="signin-email" type="email" autocomplete="email" required>
          </div>
          <div class="form-group">
            <label for="signin-password">Password</label>
            <input id="signin-password" type="password" autocomplete="current-password" required>
          </div>
          <p class="form-error" id="signin-error" role="alert"></p>
          <button class="btn-primary" type="submit">Sign in</button>
        </form>
      </div>
    </div>

    {# Register panel #}
    <div id="panel-register" class="tab-panel" role="tabpanel" aria-labelledby="tab-register" hidden>
      <div class="form-card">
        <form id="register-form" novalidate>
          <div class="form-group">
            <label for="reg-name">Name</label>
            <input id="reg-name" type="text" autocomplete="name" required>
          </div>
          <div class="form-group">
            <label for="reg-email">Email</label>
            <input id="reg-email" type="email" autocomplete="email" required>
          </div>
          <div class="form-group">
            <label for="reg-password">Password</label>
            <input id="reg-password" type="password" autocomplete="new-password" required>
          </div>
          <p class="form-error" id="register-error" role="alert"></p>
          <button class="btn-primary" type="submit">Create account</button>
        </form>
        <p class="form-success" id="register-success" hidden></p>
      </div>
    </div>
  </div>

  <script type="module">
  import { signIn, signUp } from '/assets/js/auth.js';

  // ---------------------------------------------------------------------------
  // Tab switching
  // ---------------------------------------------------------------------------
  const tabs   = document.querySelectorAll('[role="tab"]');
  const panels = document.querySelectorAll('[role="tabpanel"]');

  function activateTab(tabId) {
    tabs.forEach(t => t.setAttribute('aria-selected', String(t.id === tabId)));
    panels.forEach(p => { p.hidden = p.getAttribute('aria-labelledby') !== tabId; });
  }

  tabs.forEach(tab => tab.addEventListener('click', () => activateTab(tab.id)));

  // Pre-select tab from ?tab= query param
  const params = new URLSearchParams(location.search);
  if (params.get('tab') === 'register') activateTab('tab-register');

  // Where to send the user after successful sign-in
  const redirectTo = params.get('redirect') || '/';

  // ---------------------------------------------------------------------------
  // Sign-in form
  // ---------------------------------------------------------------------------
  document.getElementById('signin-form').addEventListener('submit', async e => {
    e.preventDefault();
    const errEl = document.getElementById('signin-error');
    errEl.textContent = '';
    const btn = e.target.querySelector('button[type="submit"]');
    btn.disabled = true;

    const email    = document.getElementById('signin-email').value.trim();
    const password = document.getElementById('signin-password').value;

    const { error } = await signIn(email, password);
    if (error) {
      errEl.textContent = error.message || 'Sign-in failed. Check your email and password.';
      btn.disabled = false;
    } else {
      location.href = redirectTo;
    }
  });

  // ---------------------------------------------------------------------------
  // Register form
  // ---------------------------------------------------------------------------
  document.getElementById('register-form').addEventListener('submit', async e => {
    e.preventDefault();
    const errEl = document.getElementById('register-error');
    errEl.textContent = '';
    const btn = e.target.querySelector('button[type="submit"]');
    btn.disabled = true;

    const name     = document.getElementById('reg-name').value.trim();
    const email    = document.getElementById('reg-email').value.trim();
    const password = document.getElementById('reg-password').value;

    const { error } = await signUp(name, email, password);
    if (error) {
      errEl.textContent = error.message || 'Registration failed. Please try again.';
      btn.disabled = false;
    } else {
      document.getElementById('register-form').hidden = true;
      const successEl = document.getElementById('register-success');
      successEl.hidden = false;
      successEl.textContent = 'Check your email to verify your account.';
    }
  });
  </script>
  ```

- [ ] **Step 2: Verify the page renders in the dev server**

  Navigate to `http://localhost:8080/account/`. You should see:
  - An "Account" heading
  - "Sign in" and "Create account" tabs (Sign in active by default)
  - A form with Email and Password fields and a "Sign in" button
  - Navigating to `http://localhost:8080/account/?tab=register` should show the Create account tab pre-selected with Name, Email, Password fields

- [ ] **Step 3: Commit**

  ```bash
  git add frontend/src/account/index.njk
  git commit -m "feat(frontend): add /account/ login/register page"
  ```

---

## Task C-6: Frontend — Create /account/profile/index.njk (profile page)

**Context:** Profile page shows name, email, role badge (admin: purple), tier badge, and a Sign out button. The page has an auth guard: if no session is found on load, it immediately redirects to `/account/?redirect=/account/profile/`. The profile card is hidden until the session resolves, preventing any flash of empty content.

**Files:**
- Create: `frontend/src/account/profile/index.njk`

- [ ] **Step 1: Create the directory and file**

  ```bash
  mkdir -p frontend/src/account/profile
  ```

  Create `frontend/src/account/profile/index.njk`:

  ```njk
  ---
  layout: base.njk
  title: Profile
  ---

  <div class="profile-page">
    <h1>Profile</h1>

    <div class="profile-card" id="profile-card" hidden>
      <div class="profile-field">
        <span class="profile-label">Name</span>
        <span class="profile-value" id="profile-name"></span>
      </div>
      <div class="profile-field">
        <span class="profile-label">Email</span>
        <span class="profile-value" id="profile-email"></span>
      </div>
      <div class="profile-field">
        <span class="profile-label">Role</span>
        <span class="profile-value" id="profile-role"></span>
      </div>
      <div class="profile-field">
        <span class="profile-label">Tier</span>
        <span class="profile-value" id="profile-tier"></span>
      </div>
    </div>

    <button class="btn-secondary" id="profile-sign-out-btn" type="button" hidden>Sign out</button>
  </div>

  <script type="module">
  import { getSession, signOut } from '/assets/js/auth.js';

  (async () => {
    const session = await getSession();

    // Auth guard — redirect unauthenticated visitors to the sign-in page
    if (!session) {
      location.href = '/account/?redirect=/account/profile/';
      return;
    }

    const { user } = session;

    // Populate fields
    document.getElementById('profile-name').textContent  = user.name  || '—';
    document.getElementById('profile-email').textContent = user.email || '—';

    const role = user.role || 'user';
    document.getElementById('profile-role').innerHTML =
      `<span class="badge badge--${role}">${role}</span>`;

    const tier = user.tier || 'free';
    document.getElementById('profile-tier').innerHTML =
      `<span class="badge badge--${tier}">${tier}</span>`;

    // Reveal the card and sign-out button once data is ready
    document.getElementById('profile-card').hidden = false;

    const signOutBtn = document.getElementById('profile-sign-out-btn');
    signOutBtn.hidden = false;
    signOutBtn.addEventListener('click', async () => {
      await signOut();
      location.href = '/';
    });
  })();
  </script>
  ```

- [ ] **Step 2: Verify the auth guard works in the dev server**

  Navigate to `http://localhost:8080/account/profile/`. Since you're not signed in against the real API in the dev environment, you should be immediately redirected to `/account/?redirect=/account/profile/`. That confirms the auth guard is working.

- [ ] **Step 3: Commit**

  ```bash
  git add frontend/src/account/profile/index.njk
  git commit -m "feat(frontend): add /account/profile/ page with auth guard"
  ```

---

## Task C-7: Production smoke test + update PROJECT_BRIEFING + open PR

**Context:** Verify the full auth flow works end-to-end against the production API before opening the PR.

**Note on email verification:** Resend is not yet configured in production. After registering, the verification link will appear in `flyctl logs --app loreuniverse-api`. Retrieve it from there to complete verification. Once Resend is configured, this becomes fully self-service.

**Files:**
- Modify: `PROJECT_BRIEFING.md`

- [ ] **Step 1: Build the frontend and deploy (or let CI handle it)**

  If the GitHub Pages deployment is triggered by a PR merge, just push the branch and confirm CI picks it up. If you need to test the built output locally first:

  From `frontend/`:
  ```
  npm run build
  ```

  Expected: Eleventy outputs to `_site/` without errors. Check that `_site/account/index.html` and `_site/account/profile/index.html` both exist.

- [ ] **Step 2: Manual smoke test against production**

  Open `https://loreuniverse.github.io/` (after deploying) and verify:

  a. The Account button appears in the nav after ~0.5 seconds (session check resolves).
  b. Clicking the Account dropdown shows "Sign in" and "Register" links while logged out.
  c. Navigate to `/account/`. The Sign in and Create account tabs both render.
  d. Navigate to `/account/?tab=register`. The Create account tab is pre-selected.
  e. Navigate directly to `/account/profile/`. You should be redirected to `/account/?redirect=/account/profile/`.
  f. Sign in with your existing account (email + password). You should be redirected to `/` after success.
  g. The Account button should now show your first name. Clicking it shows "Profile" and "Sign out".
  h. Click "Profile" — the profile page loads and shows your name, email, role badge, and tier badge.
  i. Click "Sign out" — you should be redirected to `/` and the nav reverts to "Account" / "Sign in" / "Register".

- [ ] **Step 3: Update `PROJECT_BRIEFING.md` to mark Foundation C as done**

  In the Current State table, add:

  ```markdown
  | Foundation C — Frontend auth UI | ✅ Done | Login/register page, profile page, nav Account dropdown |
  ```

  And in the sub-project roadmap section, update the Foundation C row from "Planned" to "✅ Done".

- [ ] **Step 4: Commit PROJECT_BRIEFING**

  ```bash
  git add PROJECT_BRIEFING.md
  git commit -m "docs: mark Foundation C (frontend auth UI) as done in PROJECT_BRIEFING"
  ```

- [ ] **Step 5: Open the PR**

  Push the branch and open a PR targeting `main`:

  ```bash
  git push -u origin <branch-name>
  gh pr create \
    --title "feat: Foundation C — frontend auth UI" \
    --body "Adds login/register page, profile page, and Account nav dropdown connecting to the Better Auth backend.

  ## Changes
  - \`backend/src/features/auth/better-auth.ts\`: SameSite=None; Secure on session cookies for cross-origin production use
  - \`frontend/src/assets/js/auth.js\`: Better Auth browser client, 30s session cache, nav update, exported auth functions
  - \`frontend/src/_includes/base.njk\`: Hidden Account nav slot + module script load
  - \`frontend/src/assets/css/reader.css\`: Account button, form, tabs, badges, profile styles
  - \`frontend/src/account/index.njk\`: Login/register tabs page
  - \`frontend/src/account/profile/index.njk\`: Profile page with auth guard

  ## Test plan
  - [ ] Eleventy build completes without errors
  - [ ] Account nav button appears after page load (no FOUC)
  - [ ] Logged-out dropdown shows Sign in / Register
  - [ ] Sign in flow redirects to \`?redirect\` or \`/\`
  - [ ] Register flow shows email confirmation message
  - [ ] Profile page redirects to sign-in when unauthenticated
  - [ ] Profile page shows name, email, role badge, tier badge when authenticated
  - [ ] Sign out clears session and returns to home

  🤖 Generated with [Claude Code](https://claude.com/claude-code)"
  ```

  If `gh` CLI is not installed, push the branch and create the PR manually on GitHub at `https://github.com/LoreUniverse/loreuniverse.github.io/compare`.
