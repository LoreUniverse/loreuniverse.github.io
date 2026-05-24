# Admin Control Panel — Design Spec

**Date:** 2026-05-24
**Status:** Approved
**Scope:** Six admin pages at `/admin/` built as static Eleventy pages with Alpine.js for interactivity; four new backend endpoints; admin-only session guard

---

## Goal

Give the site owner a browser UI to interact with all existing backend functionality without writing raw curl commands. The admin panel lives at `/admin/` on the static site and talks directly to the deployed API at runtime.

---

## Architecture

The admin panel is a static Eleventy section. Every page is a plain `.njk` file that Eleventy renders to HTML at build time. All data fetching, state management, and interactivity is handled by Alpine.js (loaded from CDN) at page load time in the browser.

**Why Alpine.js over plain JS:**
- Declarative `x-data` / `x-for` / `x-bind` eliminates the boilerplate of manual DOM manipulation.
- No build step required — the CDN script tag is enough.
- Smaller scope than React/Vue; fits the "no new deployment infrastructure" constraint.

**Why static Eleventy (not a separate SPA):**
- Deploys alongside the existing site with no extra CI config.
- GitHub Pages already serves the frontend; admin pages ride the same deploy.

**Security model:**
- GitHub Pages has no server-side access control. Any URL is publicly reachable.
- Real access control is enforced entirely at the API level: every admin endpoint requires `role: 'admin'` via `app.requireRole('admin')`.
- The frontend guard (`x-init` session check) is a UX convenience only — it prevents the admin from staring at a broken UI if they are accidentally logged out. It is not a security boundary.

---

## Auth Flow

Every admin page follows this pattern:

1. On page load, the `x-init` attribute of the root `x-data` component fires.
2. It calls `GET https://loreuniverse-api.fly.dev/api/auth/get-session` with `credentials: 'include'`.
3. If the response body does not contain `user.role === 'admin'`, the page immediately redirects to `/account/?redirect=<current-path>`.
4. On success, the component sets `session = data` and proceeds to fetch page-specific data.

```js
// Pattern used in every admin x-init block
async function adminInit(component) {
  const res = await fetch('https://loreuniverse-api.fly.dev/api/auth/get-session', {
    credentials: 'include',
  });
  const data = await res.json();
  if (!data?.user || data.user.role !== 'admin') {
    location.href = '/account/?redirect=' + encodeURIComponent(location.pathname);
    return;
  }
  component.session = data;
  // page-specific fetches follow
}
```

The API `GET /api/auth/get-session` is the Better Auth session introspection endpoint already mounted by Better Auth. It returns the full session object (including `user.role`) when a valid cookie is present, or `null`/`{}` when there is none.

---

## Layout

A shared `admin.njk` layout extends `base.njk` and adds:
- An admin-specific sidebar nav with links to each admin page.
- Alpine.js CDN script tag (pinned to `3.14.x`).
- A loading state wrapper so pages do not flash content before the session check resolves.

A `.11tydata.js` file in `frontend/src/admin/` sets `layout: admin.njk` for the entire directory so each page does not need to declare it.

```
frontend/src/admin/
  admin.11tydata.js        ← sets layout: admin.njk for all admin pages
  index.njk                ← /admin/
  wiki/
    index.njk              ← /admin/wiki/
  users/
    index.njk              ← /admin/users/
  applications/
    index.njk              ← /admin/applications/
  tokens/
    index.njk              ← /admin/tokens/
  audit/
    index.njk              ← /admin/audit/

frontend/src/_includes/
  admin.njk                ← extends base.njk, adds Alpine CDN + sidebar
```

---

## Component Pattern

Alpine.js data components follow this structure throughout the admin panel:

```html
<div x-data="pageComponent()" x-init="init()">
  <!-- Loading state -->
  <p x-show="loading">Loading…</p>

  <!-- Error state -->
  <p x-show="error" x-text="error" class="admin-error"></p>

  <!-- Content (only shown when not loading and no error) -->
  <div x-show="!loading && !error">
    <!-- page-specific HTML using x-for, x-bind, x-text, @click -->
  </div>
</div>

<script>
function pageComponent() {
  return {
    loading: true,
    error: null,
    // page-specific state fields

    async init() {
      // 1. Session check (all pages)
      const sessionRes = await fetch('https://loreuniverse-api.fly.dev/api/auth/get-session', {
        credentials: 'include',
      });
      const sessionData = await sessionRes.json();
      if (!sessionData?.user || sessionData.user.role !== 'admin') {
        location.href = '/account/?redirect=' + encodeURIComponent(location.pathname);
        return;
      }

      // 2. Page-specific data fetch
      try {
        const res = await fetch('https://loreuniverse-api.fly.dev/api/...', {
          credentials: 'include',
        });
        if (!res.ok) throw new Error(`API error ${res.status}`);
        this.data = await res.json();
      } catch (err) {
        this.error = err.message;
      } finally {
        this.loading = false;
      }
    },

    async apiCall(method, path, body) {
      const res = await fetch('https://loreuniverse-api.fly.dev' + path, {
        method,
        credentials: 'include',
        headers: body ? { 'Content-Type': 'application/json' } : {},
        body: body ? JSON.stringify(body) : undefined,
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err?.error?.message ?? `HTTP ${res.status}`);
      }
      return res.status === 204 ? null : res.json();
    },
  };
}
</script>
```

All fetch calls use `credentials: 'include'` so the Better Auth session cookie is sent automatically. No Authorization header is needed for the browser-based admin panel.

---

## Pages

### `/admin/` — Dashboard

**Purpose:** Single-glance health check and quick-action buttons. The admin's first stop after logging in.

**API calls:**
- `GET /health` (no auth required) — full module status object
- `POST /api/admin/site-rebuild` — triggers GitHub `repository_dispatch` → Eleventy rebuild
- `GET /api/wiki/all` — count of published wiki entries (existing endpoint, no auth)
- `GET /api/admin/wiki` — count total entries including unpublished (new endpoint, see below)

**Behaviour:**
- Health display shows each of the 9 modules (`db`, `auth`, `audit`, `permissions`, `tokens`, `wiki`, `books`, `chapters`, `admin`) with a green/red indicator.
- The site rebuild button is disabled while the request is in flight and shows a brief confirmation message on 204 success.
- Wiki stats show "X published / Y total" entries.
- User count is not shown (requires new endpoint; dashboard keeps it simple).

**State fields:** `health`, `rebuilding`, `rebuildStatus`, `wikiPublished`, `wikiTotal`

---

### `/admin/wiki/` — Wiki Management

**Purpose:** View all wiki entries (published and unpublished), toggle publish state, identify entries with unresolved `[[double bracket]]` links.

**API calls:**
- `GET /api/admin/wiki` — all entries (new endpoint)
- `PATCH /api/admin/wiki/:category/:slug` — toggle `isPublished` (new endpoint)

**Behaviour:**
- Table lists every wiki entry: category, slug, name, published status, unresolved-links count.
- Unresolved links: detect any `[[...]]` pattern in the `body` field client-side using `/\[\[([^\]]+)\]\]/g`.
- "Publish / Unpublish" toggle button on each row; sends `PATCH` with `{ isPublished: !current }`.
- Row updates optimistically and reverts if the API call fails.
- Table sorted by category then slug.

**State fields:** `entries` (array), toggling state per entry (by id)

---

### `/admin/users/` — User Management

**Purpose:** List all registered users, view their role and permissions, ban or unban.

**API calls:**
- `GET /api/admin/users?page=1&limit=50` — paginated user list (new endpoint)
- `POST /api/admin/users/:id/ban` — ban user (existing endpoint in ban-routes.ts)
- `POST /api/admin/users/:id/unban` — unban user (existing endpoint in ban-routes.ts)

**Behaviour:**
- Table with columns: name, email, role badge, banned status, created date, actions.
- Ban button opens a reason input (inline prompt below the row, not a modal) before sending.
- Unban button sends immediately with no confirmation.
- Pagination controls if more than 50 users.

**State fields:** `users`, `page`, `total`, `banningId`, `banReason`

---

### `/admin/applications/` — Permission Applications

**Purpose:** Review pending applications for granular permissions (e.g., `wiki_edit`).

**API calls:**
- `GET /api/admin/permission-applications?status=pending` — pending list (existing endpoint)
- `POST /api/admin/permission-applications/:id/approve` — approve (existing endpoint)
- `POST /api/admin/permission-applications/:id/reject` — reject (existing endpoint)

**Behaviour:**
- Each application shows: user ID, requested permission, justification text, submitted date.
- Approve and Reject buttons both accept an optional review note via an inline text input.
- Approved/rejected applications are removed from the list immediately on success.

**State fields:** `applications`, `reviewNote` (per-application), `processingId`

---

### `/admin/tokens/` — API Token Management

**Purpose:** Manage the admin's own API tokens (used for scripted access to the API).

**API calls:**
- `GET /api/account/api-tokens` — list own tokens (existing endpoint)
- `POST /api/account/api-tokens` — create new token (existing endpoint)
- `DELETE /api/account/api-tokens/:id` — revoke token (existing endpoint)

**Behaviour:**
- Table lists tokens: name, prefix (`lore_admin_*` or `lore_moderator_*`), created date, last used, expiry, revoked status.
- Create form: name field and submit button. On 201, the plaintext token is shown once in a highlighted box with a "Copy" button; the user is warned it will not be shown again.
- Revoke button triggers DELETE; row is removed from the list on 204.

**State fields:** `tokens`, `newTokenName`, `creating`, `newPlaintext`

---

### `/admin/audit/` — Audit Log

**Purpose:** Browse the write-only audit log to review all admin actions.

**API calls:**
- `GET /api/admin/audit?page=1&limit=50` — paginated audit log (new endpoint)

**Behaviour:**
- Table with columns: timestamp, actor user ID, action, target type, target ID, metadata (collapsed by default, expandable inline).
- Newest entries first.
- Pagination controls.
- Simple text filter (client-side, no API refetch) for the action column.

**State fields:** `entries`, `page`, `total`, `filter`

---

## New Backend Endpoints

### `GET /api/admin/wiki`

Returns all wiki entries regardless of `isPublished`. Requires `role: admin`.

**Response:** Array of all `wikiEntries` rows (same fields as `GET /api/wiki/all` but without the `isPublished` filter, and including the `isPublished` field itself).

```
200 [
  {
    "id": "uuid",
    "category": "characters",
    "slug": "aldren",
    "name": "Aldren",
    "frontMatter": { ... },
    "body": "...",
    "isPublished": true,
    "createdAt": "...",
    "updatedAt": "..."
  },
  ...
]
```

**Implementation:** Add to `backend/src/features/wiki/routes.ts`, guarded by `[app.requireAuth, app.requireRole('admin')]`.

---

### `PATCH /api/admin/wiki/:category/:slug`

Toggles (or explicitly sets) `isPublished` on a single wiki entry. Requires `role: admin`.

**Request body:**
```json
{ "isPublished": true }
```

**Response:**
```
200 { ...updated entry fields... }
```

**Error:**
```
404 { "error": { "code": "NOT_FOUND", "message": "Entry not found." } }
```

**Implementation:** Add to `backend/src/features/wiki/routes.ts`. Updates only the `isPublished` field (does not require `name`, `body`, or `frontMatter`). Does not write a wiki revision (publish toggles are administrative, not content edits). Does write an audit log entry (`action: 'wiki.publish'` or `'wiki.unpublish'`).

---

### `GET /api/admin/users`

Paginated list of all registered users. Requires `role: admin`.

**Query params:** `page` (default 1), `limit` (default 50, max 100).

**Response:**
```json
{
  "users": [
    {
      "id": "...",
      "email": "...",
      "name": "...",
      "role": "user",
      "isBanned": false,
      "bannedAt": null,
      "bannedReason": null,
      "emailVerified": true,
      "createdAt": "..."
    }
  ],
  "total": 42,
  "page": 1,
  "limit": 50
}
```

**Implementation:** New file `backend/src/features/admin/user-routes.ts`. Query `schema.users`, ordered by `createdAt desc`. Use Drizzle `limit`/`offset`. A separate `COUNT(*)` subquery provides `total`. Register in `backend/src/features/admin/index.ts`.

---

### `GET /api/admin/audit`

Paginated audit log. Requires `role: admin`.

**Query params:** `page` (default 1), `limit` (default 50, max 100).

**Response:**
```json
{
  "entries": [
    {
      "id": "uuid",
      "actorUserId": "...",
      "action": "wiki.edit",
      "targetType": "wiki_entry",
      "targetId": "uuid",
      "metadata": "{ \"category\": \"characters\" }",
      "ipAddress": null,
      "userAgent": null,
      "createdAt": "..."
    }
  ],
  "total": 137,
  "page": 1,
  "limit": 50
}
```

**Implementation:** New file `backend/src/features/admin/audit-routes.ts`. Query `schema.auditLog`, ordered by `createdAt desc`. Register in `backend/src/features/admin/index.ts`.

---

## Testing Approach

### Backend — Vitest (integration tests)

Every new route file gets a companion `*.test.ts` file using the existing `withRollbackDb` + injected Fastify pattern established by `wiki/routes.test.ts` and `tokens/routes.test.ts`.

**Test setup pattern:**
```ts
async function setupApp(db: any) {
  const tokens = createTokenService(db);
  const perms = createPermissionsService(db);
  const audit = createAuditService(db);
  const app = Fastify();
  app.decorate('db', db);
  app.decorate('tokens', tokens);
  app.decorate('perms', perms);
  app.decorate('audit', audit);
  app.decorate('auth', { api: { getSession: async () => null } } as any);
  app.decorate('requireAuth', createRequireAuth({ app, tokens }));
  app.decorate('requireRole', (min: any) => createRequireRole(perms, min));
  // register the route under test
  await app.ready();
  return { app, tokens };
}
```

**Tests required per new endpoint:**
- Returns 401 without auth.
- Returns 403 for a non-admin user.
- Returns correct data shape with a seeded admin user + Bearer token.
- Pagination: `page=2` returns the second slice when more than `limit` rows exist.

**For PATCH `/api/admin/wiki/:category/:slug`:**
- Returns 404 when the entry does not exist.
- Updates `isPublished` from `true` to `false` and back.
- Writes an audit log entry.

### Frontend — Manual browser checklist

Because the admin panel is Alpine.js with no build step, there is no JS unit test suite for the frontend. Manual browser verification covers:

| Check | Pass criteria |
|---|---|
| Visiting `/admin/` while logged out | Redirected to `/account/?redirect=/admin/` |
| Visiting `/admin/` as a non-admin user | Redirected to `/account/` |
| Visiting `/admin/` as admin | Dashboard loads; all 9 module indicators green |
| Site rebuild button | Button disables, shows "Rebuilding…", returns to idle after 204 |
| Wiki page — all entries visible | Both published and unpublished entries appear |
| Wiki page — unresolved link detection | Entries with `[[...]]` show a count badge |
| Wiki page — publish toggle | Toggle flips `isPublished`; row updates without page reload |
| Users page — list loads | Paginated table appears with correct columns |
| Users page — ban flow | Reason field appears; ban sends; row shows banned status |
| Applications page | Pending applications listed; approve/reject removes row |
| Tokens page — create | New token appears; plaintext shown once with copy button |
| Tokens page — revoke | Row removed after 204 |
| Audit page — entries | Table shows newest entries first; metadata expandable |

---

## File Changes Summary

| File | Action |
|---|---|
| `frontend/src/_includes/admin.njk` | **New** — admin layout extending `base.njk`, Alpine CDN, sidebar |
| `frontend/src/admin/admin.11tydata.js` | **New** — sets `layout: admin.njk` for all pages in directory |
| `frontend/src/admin/index.njk` | **New** — dashboard page |
| `frontend/src/admin/wiki/index.njk` | **New** — wiki management page |
| `frontend/src/admin/users/index.njk` | **New** — user management page |
| `frontend/src/admin/applications/index.njk` | **New** — applications page |
| `frontend/src/admin/tokens/index.njk` | **New** — token management page |
| `frontend/src/admin/audit/index.njk` | **New** — audit log page |
| `backend/src/features/wiki/routes.ts` | **Modify** — add `GET /api/admin/wiki` and `PATCH /api/admin/wiki/:category/:slug` |
| `backend/src/features/wiki/routes.test.ts` | **Modify** — add tests for the two new admin wiki endpoints |
| `backend/src/features/admin/user-routes.ts` | **New** — `GET /api/admin/users` |
| `backend/src/features/admin/user-routes.test.ts` | **New** — tests |
| `backend/src/features/admin/audit-routes.ts` | **New** — `GET /api/admin/audit` |
| `backend/src/features/admin/audit-routes.test.ts` | **New** — tests |
| `backend/src/features/admin/index.ts` | **Modify** — register new route files |

---

## Future Scope

- Inline wiki body editor (markdown textarea + save) on the wiki management page
- Per-user permission grant/revoke UI on the users page (endpoint already exists: `POST/DELETE /api/admin/users/:id/permissions`)
- Audit log server-side filter by action type (currently only client-side)
- A proper admin nav link in the main site nav, conditionally shown only when `session.user.role === 'admin'`
