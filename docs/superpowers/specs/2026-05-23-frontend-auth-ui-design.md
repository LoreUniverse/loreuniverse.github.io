# Frontend Auth UI — Design Spec

**Date:** 2026-05-23  
**Status:** Approved  
**Scope:** Login/register page, profile page, nav Account dropdown, client-side session management

---

## Goal

Add a basic auth UI to the Eleventy frontend that connects to the Better Auth backend at `loreuniverse-api.fly.dev`. Users can create an account, sign in, view their profile, and sign out — all from the static site with no changes to the build pipeline or SSR.

---

## Architecture

The frontend remains a pure Eleventy static site. Two new pages are added as static HTML shells. A single vanilla JS module (`auth.js`) runs on every page, checks the session, and updates the UI accordingly.

**Auth client:** The Better Auth browser client SDK (`better-auth/client`) handles all API calls. It wraps `fetch` with `credentials: 'include'`, correct CORS headers, and response parsing — eliminating the risk of subtly wrong wiring.

**Session state:** Lives entirely in the HttpOnly cookie Better Auth sets on sign-in. Never stored in `localStorage`. Checked once per page load via `authClient.getSession()` and cached in `sessionStorage` for 30 seconds to avoid redundant network calls on every navigation.

**FOUC prevention:** The nav Account button is hidden by default (`visibility: hidden`) and revealed after the session check resolves, so it never flickers between logged-out and logged-in states.

---

## Components

### `frontend/src/assets/js/auth.js`

The core auth module. Loaded on every page via `base.njk`.

**Responsibilities:**
- Initialises the Better Auth client pointing at `https://loreuniverse-api.fly.dev`
- On `DOMContentLoaded`: calls `getSession()`, updates the nav Account dropdown
- Exports (as module-level functions used by page scripts): `getSession()`, `signIn()`, `signUp()`, `signOut()`
- Handles global 401 responses by redirecting to `/account/?redirect=<current-path>`

**Session cache:** `sessionStorage.getItem('lr-session')` stores a JSON-serialised session + a timestamp. Cache is valid for 30 seconds. Cleared on sign-out.

### `frontend/src/account/index.njk` — `/account/`

The login/register page. Static HTML shell with two tabs.

**Sign-in tab:** Email + password fields, "Forgot password?" link (stub — links to `#` for now), Sign in button. On success: redirect to `?redirect` query param or `/`. On error: inline error message below the form.

**Register tab:** Name + email + password fields, Create account button. On success: form replaced with "Check your email to verify your account." On error: inline error message below the form.

**Redirect param:** The page reads `?redirect=` from the URL on load. After successful sign-in, the user is sent there. After successful register, the redirect param is ignored (user must verify email first).

### `frontend/src/account/profile/index.njk` — `/account/profile/`

The profile page. Static HTML shell populated by `auth.js`.

**Content:** Name, email, role badge (styled in purple for admin), tier badge, Sign out button.

**Auth guard:** If no session is found on load, redirect immediately to `/account/?redirect=/account/profile/`.

**Sign-out:** Calls `authClient.signOut()`, clears `sessionStorage`, redirects to `/`.

### Nav — `base.njk` + `navigation.js`

An "Account" entry is added to the nav as the rightmost item, visually separated (pushed right via `margin-left: auto`). It renders as a button with a dropdown — not a plain nav link.

**Logged-out dropdown:** Sign in → `/account/`, Register → `/account/?tab=register`

**Logged-in dropdown:** Shows the user's first name on the button. Dropdown: Profile → `/account/profile/`, divider, Sign out (triggers `authClient.signOut()` inline).

The button starts hidden and is revealed by `auth.js` after session check.

---

## Data Flow

1. **Every page load:** Check `sessionStorage` cache → cache miss → `authClient.getSession()` → cache result for 30s → update nav.
2. **Sign-in:** Form submit → `authClient.signIn.email()` → success: redirect to `?redirect` or `/` → error: inline message.
3. **Register:** Form submit → `authClient.signUp.email()` → success: show "Check your email" message → error: inline message.
4. **Sign-out:** Click → `authClient.signOut()` → clear `sessionStorage` cache → redirect to `/`.
5. **Email verification (current limitation):** No email is delivered in production (Resend not yet configured). The verification link appears in `flyctl logs --app loreuniverse-api`. Only the admin can complete verification manually by retrieving the link from the logs. When Resend is added later, this becomes fully self-service with no frontend code changes.
6. **Unauthenticated profile access:** No session → redirect to `/account/?redirect=/account/profile/`.

---

## Backend Change Required

The Better Auth session cookie must be set with `SameSite=None; Secure` for cross-origin requests (`loreuniverse.github.io` → `loreuniverse-api.fly.dev`) to work. Verify this is already the case or configure it explicitly in the Better Auth config.

The email verification success redirect must point to `https://loreuniverse.github.io/` instead of the current API base URL (which 404s). This is set via the `emailVerification.callbackURL` or equivalent option in `better-auth.ts`.

---

## File Changes Summary

| File | Change |
|------|--------|
| `frontend/src/assets/js/auth.js` | **New** — auth client, session cache, nav update |
| `frontend/src/_includes/base.njk` | **Modified** — load `auth.js`, add Account nav item |
| `frontend/src/_data/navigation.js` | **Modified** — add Account entry |
| `frontend/src/account/index.njk` | **New** — login/register page |
| `frontend/src/account/profile/index.njk` | **New** — profile page |
| `frontend/src/assets/css/reader.css` | **Modified** — styles for forms, tabs, badges, account button |
| `backend/src/features/auth/better-auth.ts` | **Modified** — fix verification redirect URL, confirm SameSite=None |

---

## Future Scope

- Change password flow on the profile page
- Reading history / stats section on the profile page
- Strict CSP header (when the site moves off GitHub Pages or Pages adds header support)
- Full Resend setup to make email verification self-service
