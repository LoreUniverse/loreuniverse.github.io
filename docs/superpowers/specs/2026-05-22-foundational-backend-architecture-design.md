# Foundational Backend Architecture — Design Spec

**Date:** 2026-05-22
**Status:** Draft pending user review
**Project:** Lore Universe

---

## Scope

This spec defines the *foundational backend* for Lore Universe — the infrastructure, services, and patterns every future feature builds on. It is **not** a feature spec.

### In scope

- User authentication and session management
- Role-based authorization (`user` / `moderator` / `admin`) and granular permissions (`wiki_edit`, `art_upload`, etc.)
- The data model for users, sessions, permissions, applications, books, chapters, audit log, and API tokens
- The backend runtime (Fastify + Drizzle + Postgres) and deployment topology
- The static-site-plus-backend integration pattern (Eleventy build-time wiki fetch; GitHub Pages; `repository_dispatch` rebuild trigger)
- Server-side Claude API integration for admin tooling (autolinker today; future wiki-edit assistance)
- Module isolation and fault containment principles
- Testing posture

### Out of scope (separate specs)

- Wiki editing UI and revision workflow → wiki module spec
- Comments UI, threading, moderation, GIF support → comments spec
- Reading progress, bookmarks, favorites UI → accounts feature spec
- Book reviews and ratings UI → ratings spec
- Spoiler-aware wiki visibility logic → wiki module spec
- Visual design and theme → already deferred per `PROJECT_BRIEFING.md`
- Patreon link vs. custom membership decision → future spec; foundation reserves the seam (`users.tier`)

### Glossary

- **Module** — a user-facing top-level section of the website with its own URL namespace (e.g. Library module at `/library/`, future Art module at `/art/`).
- **Feature** — an internal backend code unit under `backend/src/features/<name>/`. Each feature is a Fastify plugin owning its tables and routes.
- A module is often powered by one or more features (the Wiki module is powered by the `wiki` feature; the `auth` feature is plumbing used by every module).
- **Lorekeeper / Library naming convention** — The first module of the website is named **Library** *externally* (URLs, navigation labels, page titles, body text visible to users) but retains the identifier `lorekeeper` *internally* (file paths like `src/lorekeeper/`, data keys like `site.modules.lorekeeper`, code variables, hardcoded module identifiers). This split preserves the legacy internal identifier — minimizing churn in code that's already working — without disturbing the user-facing rename. The same pattern can apply to future modules if their internal and external names ever diverge.

---

## Architecture Overview

Three independent components communicating over HTTPS:

```
┌────────────────────────────────────────────────────────────────────┐
│ Browser (visitor — anonymous or logged in)                          │
└─────────────────┬──────────────────────────────────┬───────────────┘
                  │ static HTML/CSS/JS               │ fetch (CORS)
                  ▼                                  ▼
   ┌──────────────────────────────┐    ┌─────────────────────────┐
   │ GitHub Pages                 │    │ Fastify API on Fly.io   │
   │ (Eleventy build output)      │    │ (Docker container)      │
   │  • Chapter pages             │    │  • /api/auth/*          │
   │  • Wiki pages (HTML shells   │    │  • /api/wiki/*          │
   │    + hydrated content)       │    │  • /api/comments/*      │
   │  • Module landings           │    │  • /api/progress/*      │
   │  • Alpine bundle             │    │  • /api/admin/*         │
   │  • React island bundles      │    └────┬───────────────┬────┘
   └──────┬───────────────────────┘         │ SQL           │ HTTPS
          │ build-time read of wiki         │               │
          │ (via API)                       ▼               ▼
          └──────────────────────────►┌──────────────┐  ┌─────────┐
                                      │ Postgres on  │  │ Claude  │
                                      │ Neon         │  │ API     │
                                      │  • users     │  │ (admin- │
                                      │  • wiki_*    │  │  only   │
                                      │  • comments  │  │  flows) │
                                      │  • audit_log │  └─────────┘
                                      └──────────────┘
```

**Static site (`loreuniverse.github.io`).** Eleventy builds chapter pages, module landings, and wiki pages into pre-rendered HTML. At build time, the build pulls wiki content from the backend so wiki pages are fully rendered server-side at deploy. Chapter prose remains in markdown files (git-versioned, author-only — never user-edited). JavaScript bundles: Alpine.js global; React islands compiled by Vite for the comment overlay and future wiki editor.

**Backend API (`loreuniverse-api.fly.dev` → eventually `api.loreuniverse.com`).** Fastify TypeScript app in a Docker container on Fly.io. Owns: auth (Better Auth), all dynamic reads/writes, admin endpoints, outbound Claude API calls. Talks to Postgres via Drizzle. Authenticates by session cookie (browsers) or bearer token (scripts).

**Database (Postgres on Neon).** Source of truth for everything dynamic. Foundation tables defined below; feature tables added in their respective specs.

**Cross-origin posture.** Static site and API live at different origins until a custom domain is purchased. Cookies use `SameSite=None; Secure; HttpOnly` initially; switch to `SameSite=Lax; Domain=.loreuniverse.com` after custom domain.

**Wiki rebuild flow.** Backend writes wiki edit → fires `repository_dispatch` to GitHub → Actions runs Eleventy build → fetches latest wiki content → deploys. Edit-to-live: ~1–2 minutes. Acceptable while edit cadence is low.

---

## Tech Stack Summary

| Layer | Choice |
|---|---|
| Static site | Eleventy (existing) on GitHub Pages |
| Backend runtime | Fastify, TypeScript, Docker on Fly.io |
| Database | Postgres on Neon (managed) |
| ORM / DB access | Drizzle |
| Auth | Better Auth (email+password day one; social-ready) |
| Email delivery | Resend (free tier from launch) |
| Server-side AI | Anthropic SDK (admin endpoints only) |
| Frontend dynamic | Alpine.js + vanilla default; React islands (Vite-built) for complex UIs |
| File storage (future) | Cloudflare R2 |
| Repo | Monorepo (`frontend/`, `backend/`, `shared/`, `scripts/`) at root `loreuniverse/` |
| Hosting strategy | Fly.io with explicit portability constraints — see Deployment §Portability |

---

## Data Model

UUIDs for primary keys on all our tables. Better Auth uses text IDs on `users`; every column referencing a user is text and FKs to `users.id`. Other tables' own PKs are uuid.

All tables have `created_at`; mutable tables have `updated_at`. Timestamps are `timestamptz`.

### Tables built in this phase

#### `users`
Core account record. Better Auth manages id/email/password fields; we add the rest.

| Column | Type | Notes |
|---|---|---|
| `id` | text PK | Better Auth-generated |
| `email` | text unique | |
| `name` | text | display name |
| `image` | text nullable | avatar URL (storage location TBD) |
| `email_verified` | boolean default false | Better Auth managed |
| `role` | text default `'user'` | enum: `'user' \| 'moderator' \| 'admin'` |
| `tier` | text default `'free'` | placeholder for future membership; today only `'free'` exists |
| `is_banned` | boolean default false | |
| `banned_at` | timestamptz nullable | |
| `banned_reason` | text nullable | |
| `created_at` | timestamptz | |
| `updated_at` | timestamptz | |

#### `sessions`, `accounts`, `verifications`
Managed by Better Auth's standard schema. Sessions hold the cookie-token-to-user mapping. Accounts holds OAuth provider links (empty initially; populated when social logins enabled). Verifications holds short-lived email-verification / password-reset tokens.

#### `user_permissions`
Granular capabilities granted to specific users. Orthogonal to `role`; moderators and admins implicitly have all permissions.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `user_id` | text FK → users.id, ON DELETE CASCADE | |
| `permission` | text | e.g. `'wiki_edit'`, `'art_upload'` (extensible) |
| `granted_by` | text FK → users.id, ON DELETE SET NULL | the admin who granted it |
| `granted_at` | timestamptz | |
| UNIQUE | `(user_id, permission)` | |

#### `permission_applications`
Record of users applying for elevated permissions.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `user_id` | text FK → users.id | |
| `permission` | text | what they're applying for |
| `justification` | text | the applicant's pitch |
| `status` | text | `'pending' \| 'approved' \| 'rejected'` |
| `reviewed_by` | text FK → users.id nullable | |
| `reviewed_at` | timestamptz nullable | |
| `review_note` | text nullable | |
| `created_at` | timestamptz | |

#### `books`
Book-level metadata.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `slug` | text unique | e.g. `'book1'` |
| `title` | text | |
| `description` | text | |
| `cover_image_url` | text nullable | |
| `external_links` | jsonb | `{ amazon?, kindle?, patreon?, ... }` |
| `published_at` | timestamptz nullable | |
| `is_published` | boolean default false | |
| `created_at` / `updated_at` | timestamptz | |

#### `chapters`
Chapter metadata only — the prose lives in markdown files. This table exists so user data (comments, progress, bookmarks) can FK to a stable chapter id even when files move.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `book_id` | uuid FK → books.id | |
| `chapter_number` | integer | |
| `slug` | text | matches markdown filename |
| `title` | text | |
| `published_at` | timestamptz nullable | |
| UNIQUE | `(book_id, slug)` | |

The Eleventy build syncs chapters from markdown front matter into this table during the build job.

#### `audit_log`
Append-only record of consequential actions. Every admin endpoint and every state-changing user action writes a row.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `actor_user_id` | text FK → users.id nullable, ON DELETE SET NULL | null for system actions |
| `action` | text | e.g. `'wiki.edit'`, `'autolink.request'`, `'user.ban'` |
| `target_type` | text | e.g. `'wiki_entry'`, `'user'` |
| `target_id` | text | uuid or text id of affected entity |
| `metadata` | jsonb | action-specific details |
| `ip_address` | text nullable | |
| `user_agent` | text nullable | |
| `created_at` | timestamptz | |

#### `api_tokens`
Long-lived bearer tokens for admin tooling (autolinker; future Claude-as-editor workflows).

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `user_id` | text FK → users.id, ON DELETE CASCADE | |
| `name` | text | e.g. `'autolinker-laptop'` |
| `prefix` | text indexed | first 20 chars of plaintext (e.g. `lore_admin_xK7q1234`). Stored separately for two reasons: (a) shown in the token-list UI so users can identify their tokens, (b) lookup key during Bearer-token validation so we don't argon2-verify every row |
| `token_hash` | text unique | argon2 hash of the full plaintext; plaintext shown once at creation |
| `last_used_at` | timestamptz nullable | |
| `expires_at` | timestamptz nullable | optional |
| `revoked_at` | timestamptz nullable | |
| `created_at` | timestamptz | |

**Token format convention:** plaintext tokens use a role-encoded prefix — `lore_admin_<40 random chars>` or `lore_moderator_<40 random chars>`. The prefix is for identification only (helps leaked-secret scanners detect them) and for fast lookup during validation. Authorization is always evaluated against the user's *current* role at request time, not the prefix.

**Token creation gating:** at launch, only `admin` and `moderator` roles may create tokens. Regular users have no need (browser sessions cover all current use cases). If a public API or other regular-user tooling appears later, add a `lore_user_` prefix at that point.

### Tables designed in feature specs (mentioned for context)

- **`wiki_entries`, `wiki_revisions`** — wiki module spec. Current-state + history pattern; every edit preserved.
- **`comments`** — comments spec. Anchored to chapter + sentence position; threaded via `parent_comment_id`.
- **`reading_progress`, `bookmarks`, `favorites`** — accounts feature spec.
- **`book_ratings`** — ratings spec. UNIQUE `(user_id, book_id)`.

### Indexes (foundation)

- `users(email)` unique — login lookup
- `chapters(book_id, slug)` unique — URL resolution
- `audit_log(actor_user_id, created_at DESC)` — "this user's recent actions"
- `audit_log(action, created_at DESC)` — "all bans this month"
- `api_tokens(prefix)` — the actual lookup path during Bearer token validation (avoids argon2-verifying every row)
- `api_tokens(token_hash)` unique — uniqueness invariant on the stored hash
- `permission_applications(status, created_at)` — admin's pending-applications queue

### FK on-delete convention

- Default: `ON DELETE RESTRICT` (deletion fails if dependents exist)
- `ON DELETE CASCADE`: `sessions`, `api_tokens`, `user_permissions` (these have no value without their user)
- `ON DELETE SET NULL`: `audit_log.actor_user_id`, `permission_applications.reviewed_by`, `user_permissions.granted_by` (preserve history; show `[deleted]`)
- Comments / wiki revisions follow `SET NULL` pattern in their feature specs

---

## Request and Auth Flow

### Two authentication mechanisms

| | Browser (humans) | Scripts (automation) |
|---|---|---|
| Carries | `Cookie: session=...` (auto) | `Authorization: Bearer lore_admin_...` (you set) |
| Issued by | `POST /api/auth/sign-in/email` | `/account/api-tokens` page in browser |
| Lifetime | Session window, rolling refresh | Long-lived, manually revoked |
| CSRF protection | Better Auth's double-submit pattern | N/A (no implicit credential) |

Both resolve to the same `user_id`; from there, authorization is identical.

### Standard request lifecycle

Every API request flows through these Fastify `preHandler` hooks in order:

1. **CORS** — `@fastify/cors` validates origin against `ALLOWED_ORIGINS` env.
2. **Rate limit** — `@fastify/rate-limit` checks IP- and token-based limits.
3. **Authentication** — Resolves cookie or token to a user record. Token requests look up candidate rows by `api_tokens.prefix` then verify the argon2 hash; cookie requests delegate to Better Auth.
4. **Banned check** — If `user.is_banned`, response is `403 BANNED` regardless of endpoint.
5. **Role / permission check** — Per-endpoint. Reusable hooks: `requireRole('moderator')`, `requirePermission('wiki_edit')`. Admins implicitly satisfy any gate.
6. **Handler** — Route logic via Drizzle.
7. **Audit log write** — State-changing endpoints write a row after the handler succeeds.
8. **Response** — JSON with standard envelope.

### Authorization model

Three layers, checked in order, all required:

1. **Banned check.** `is_banned == false` or request rejected with `403 BANNED`.
2. **Role check.** Endpoints declare a minimum role. Hierarchy monotonic: `admin > moderator > user`.
3. **Permission check.** Endpoints requiring a granular capability declare it. User passes if either their role is `moderator`/`admin` OR they have a matching row in `user_permissions`.

### CORS, CSRF, cookies

- **CORS:** `@fastify/cors`, `origin: process.env.ALLOWED_ORIGINS.split(',')`, `credentials: true`, methods `GET POST PATCH DELETE`, headers `Content-Type Authorization`.
- **CSRF:** Better Auth's double-submit cookie pattern. Frontend reads a CSRF token from cookie and echoes in header on state-changing requests.
- **Cookies:** `SameSite=None; Secure; HttpOnly` while origins differ. Switch to `SameSite=Lax; Domain=.loreuniverse.com` after custom domain purchase.

### Standard response envelope

Success responses are flat. Errors share a consistent shape:

```json
{
  "error": {
    "code": "UNAUTHORIZED",
    "message": "Login required to comment.",
    "details": {}
  }
}
```

HTTP status codes: `200, 201, 204, 400, 401, 403, 404, 409, 422, 429, 500`. Each `error.code` is a stable string the frontend can switch on. Don't parse `message`.

### Rate limit defaults

In-memory store via `@fastify/rate-limit` (single Fly instance; no Redis required):

| Endpoint class | Limit |
|---|---|
| Auth (sign-up, sign-in, password reset) | 10/min per IP |
| General read (`GET /api/wiki/*`, etc.) | 120/min per IP |
| Authenticated write (comments, progress) | 60/min per user |
| Admin (autolink, wiki edit, permission grants) | 10/min per token |

Tunable via env vars without code changes.

---

## Deployment Topology

### Environments

One environment to start: **production**. No staging. Dogfooding happens on production. Staging is added later if/when a real audience appears.

| Context | Static site | Backend | DB |
|---|---|---|---|
| Local dev | `npm start` (Eleventy) on `:8080` | `npm run dev` (Fastify) on `:3000` | Postgres in Docker Compose on `:5432` |
| Production | GitHub Pages → `loreuniverse.github.io` | Fly.io → `loreuniverse-api.fly.dev` | Neon (managed) |

### GitHub Actions workflows

**`deploy-site.yml`** — Eleventy build + GitHub Pages deploy.
- Triggers: push to `main` outside `backend/`; `repository_dispatch: wiki-content-changed`.
- Steps: checkout → install Node → `npm ci` → `npm run build` (fetches wiki content from API at build time) → deploy to Pages.
- Concurrency: `group: deploy-site, cancel-in-progress: true`.

**`deploy-backend.yml`** — Docker image build + Fly deploy.
- Triggers: push to `main` with changes in `backend/` or `shared/`.
- Steps: run test job → install `flyctl` → `flyctl deploy` (builds image, runs `release_command` for migrations, promotes new image).
- Concurrency: `group: deploy-backend, cancel-in-progress: false`.

### Fly app configuration

Backend runs in **scale-to-zero mode**: the machine stops after Fly's idle window (~5 minutes of no traffic) and wakes on the next request. Cost is ~$0.20/month for rootfs storage. First request after idle pays a ~2-4s cold start (Fly machine wake + Node + Fastify boot + DB pool init). This is the right setting while the system is being dogfooded by a single user; flip `min_machines_running` to `1` for always-warm (~$2-4/month) when public traffic warrants it.

```toml
# backend/fly.toml
app = "loreuniverse-api"
primary_region = "iad"

[build]
  dockerfile = "Dockerfile"

[deploy]
  release_command = "node dist/migrate.js"

[env]
  PORT = "3000"
  HOST = "0.0.0.0"
  LOG_LEVEL = "info"

[http_service]
  internal_port = 3000
  force_https = true
  auto_stop_machines = "stop"
  auto_start_machines = true
  min_machines_running = 0

  [http_service.checks]
    grace_period = "10s"
    interval = "30s"
    method = "GET"
    timeout = "5s"
    path = "/health"

[[vm]]
  size = "shared-cpu-1x"
  memory = "256mb"
  cpus = 1
```

### Secrets inventory

**GitHub Actions repository secrets** (CI-time):

| Name | Purpose |
|---|---|
| `FLY_API_TOKEN` | Authenticates `flyctl deploy` |
| `LORE_API_URL_BUILD` | Public API URL for Eleventy build-time wiki fetch |

**Fly app secrets** (runtime, set via `fly secrets set`):

| Name | Purpose |
|---|---|
| `DATABASE_URL` | Neon Postgres connection string |
| `BETTER_AUTH_SECRET` | 32+ byte random; session encryption |
| `BETTER_AUTH_URL` | Public API URL (OAuth callbacks) |
| `RESEND_API_KEY` | Resend transactional email |
| `ANTHROPIC_API_KEY` | Claude API for admin endpoints |
| `GITHUB_DISPATCH_TOKEN` | Fine-grained PAT scoped to `repository_dispatch` write on site repo |
| `ALLOWED_ORIGINS` | Comma-separated CORS allowlist |

Local dev uses `.env` files (gitignored) with the same variable names.

### Wiki rebuild trigger flow

```
1. Authorized user saves wiki edit
       │ POST /api/wiki/:slug  (session cookie)
       ▼
2. Backend writes wiki_revisions + updates wiki_entries
       │
       ▼
3. Backend writes audit_log
       │
       ▼
4. Backend fires GitHub repository_dispatch
       │ POST https://api.github.com/repos/LoreUniverse/.../dispatches
       │ { "event_type": "wiki-content-changed" }
       ▼
5. GitHub Actions runs deploy-site.yml
       │ (concurrent runs cancelled; only newest survives)
       ▼
6. Eleventy build calls GET /api/wiki/all → renders pages → deploys
       │
       ▼
7. Edit visible. Total: ~1–2 min.
```

Fallback: a scheduled GitHub Action runs `deploy-site.yml` hourly to catch missed rebuilds (e.g., if `repository_dispatch` failed at step 4).

### Local dev environment

`docker-compose.yml` at repo root runs Postgres:

```yaml
services:
  postgres:
    image: postgres:17
    ports: ["5432:5432"]
    environment:
      POSTGRES_USER: lore
      POSTGRES_PASSWORD: lore
      POSTGRES_DB: lore_dev
    volumes: [postgres-data:/var/lib/postgresql/data]
volumes:
  postgres-data:
```

Three terminals during a session:
```
docker compose up -d           # Postgres
cd backend && npm run dev       # Fastify on :3000
cd frontend && npm start         # Eleventy on :8080
```

### Rollback strategy

- **Static site:** `git revert <bad-commit>` and push; Actions redeploys. GitHub Pages also retains recent deployments in its UI.
- **Backend:** `fly releases list` → `fly deploy --image <prev-hash>` to roll back in seconds.
- **Database:** Drizzle migrations are version-controlled; reversible where feasible. Neon free tier keeps daily snapshots. Discipline: test migrations against a copy of prod data before deploying; never destructive-DROP without backup verification.

### First admin bootstrap

Documented in `backend/README.md`:

1. Deploy backend and run normal sign-up flow against the live API to create your account.
2. Click the verification link from the Resend-delivered email.
3. Connect to Neon (psql, Drizzle Studio, or Neon web console).
4. Run: `UPDATE users SET role = 'admin' WHERE email = 'you@whatever';`
5. Optionally insert a corresponding `audit_log` row for cleanliness.

No bootstrap script needed.

### Portability constraints

Fly.io is the chosen host, with discipline to keep migration cheap:

- Never use Fly-specific features that don't exist elsewhere (Fly Volumes for state, Fly Machines orchestration API, Fly Postgres). We're already not.
- The `Dockerfile` is vendor-agnostic. No `FROM flyio/...` base images.
- Health checks via standard `GET /health`.
- All config via env vars; `fly.toml` holds only deployment metadata (region, VM size, ports).

If we ever migrate, expected effort: 2–4 hours (push image to new platform, set env vars there, point DNS, update `LORE_API_URL` in autolinker, update `ALLOWED_ORIGINS`, decommission Fly). No code changes.

---

## Feature Isolation and Fault Containment

### Backend code structure

```
backend/src/
├── features/
│   ├── auth/         # Better Auth integration; user lookups
│   ├── wiki/         # wiki_entries, wiki_revisions; wiki CRUD
│   ├── comments/     # comments; threading; moderation
│   ├── progress/     # reading_progress, bookmarks, favorites
│   ├── ratings/      # book_ratings; reviews
│   ├── admin/        # autolinker; wiki publish; permission grants
│   ├── audit/        # audit_log writes; admin queries
│   └── permissions/  # role checks, user_permissions, applications
├── lib/              # shared infrastructure (db client, logger, errors, fetch wrappers)
└── server.ts         # registers each feature as a Fastify plugin
```

Each feature is a self-contained Fastify plugin. **Features own their tables exclusively** — only the `wiki` feature's code reads/writes `wiki_entries`. Cross-feature data access goes through the owning feature's service methods (e.g., `wikiService.getEntry(slug)`), never via raw SQL into another feature's tables.

### Fault containment principles

A non-critical failure in feature A must never break feature B's core function.

**Audit logging is best-effort.** Primary operation commits to DB; audit logging is wrapped:
```ts
try { await auditService.log({...}) }
catch (err) { logger.error({ err }, 'audit_log_failed') }
```
Audit failure never propagates to the caller.

**Email is best-effort.** Verification email failures don't block signup. UI surfaces a "verification email failed; resend" affordance.

**Site rebuild is best-effort.** Wiki edit persists in DB even if `repository_dispatch` fails. Response indicates `{ saved: true, rebuildTriggered: false }`. Hourly fallback rebuild catches misses.

**Pattern:** primary actions commit atomically; secondary side-effects (audit, email, webhooks) are try/catch + logged. Never poison the primary operation.

### External dependency failure matrix

| External | Down behavior | System effect |
|---|---|---|
| Neon Postgres | All authenticated routes return 503; `/health` reports `down` | True outage |
| Resend | New verification/reset emails fail | Signups complete but flagged; existing users unaffected |
| Claude API | `/api/admin/autolink` returns 503 | Autolinker script fails; nothing else affected |
| GitHub dispatch | Wiki rebuild not triggered | Edit saved; live site shows previous content until next rebuild |

Each outbound call uses **timeout + retry + circuit breaker**. Wrapper in `backend/src/lib/external.ts`. Bare `fetch` calls to external services fail code review.

### Frontend isolation

- **Alpine.js components** are independent. Thrown exception in one `x-data` doesn't affect others.
- **React islands** wrap their root in an error boundary. Broken comment overlay shows graceful "Something went wrong; reload to retry" without breaking chapter prose, nav, or login state.
- **Script loading is async.** Each island bundle loads via `<script type="module" async>`. Network failure for one bundle doesn't block others.

### Health endpoint

`GET /health` returns feature-level health:

```json
{
  "status": "ok",
  "modules": {
    "db": { "status": "ok", "latency_ms": 4 },
    "auth": { "status": "ok" },
    "claude": { "status": "ok", "circuit": "closed" },
    "resend": { "status": "degraded", "circuit": "half-open", "lastError": "..." },
    "github": { "status": "ok" }
  }
}
```

Each feature exposes a `health()` method. Overall status is the worst submodule's. Fly's HTTP check uses this.

### Observability

- **Structured logs** via `pino` (Fastify default). JSON with `request_id`, `user_id`, `feature`, `action`, `duration_ms`, `status`.
- **Log access** via `fly logs`. Free, ~24h retention.
- **Long-term log retention** deferred. Ship to Logtail/Axiom when needed.
- **Error aggregation** deferred. Wire up Sentry's free tier when raw logs become hard to navigate.
- **Audit log** (DB) is distinct from application logs (Fly streams). Audit = "who did what business action", queryable forever via Drizzle. App logs = developer debugging, ephemeral.

---

## Testing Approach

### Testing layers and tools

| Layer | What it covers | Tool |
|---|---|---|
| Unit | Pure functions, business logic in feature services | Vitest |
| Integration | Features tested against real Postgres via Fastify `app.inject()` | Vitest + Fastify inject + Drizzle |
| End-to-end | Critical user flows through real HTTP | Playwright (selective) |
| Frontend component | React island logic | Vitest + React Testing Library |

Vitest (not Jest): TypeScript-first, faster, modern API, ESM-friendly.

### Test database strategy

Postgres container runs as a GitHub Actions service. Locally, same Docker Compose Postgres serves dev and tests via a separate `lore_test` database.

**Isolation per test via transactions.** Each test starts a transaction at setup, runs inside it, rolls back at teardown. Drizzle supports this via a transaction-scoped client passed into the feature. Schema is set up once at run start via `drizzle-kit push`.

### External dependency strategy

External services behind interfaces; tests inject fakes.

| Service | Test mode | Dev/prod mode |
|---|---|---|
| Resend | `FakeEmailSender` records calls; assert content | Real Resend client |
| Claude API | `FakeClaudeClient` returns fixture, records prompt | Real Anthropic SDK |
| GitHub dispatch | `FakeGitHubDispatch` records payload | Real `fetch` to GitHub API |
| Better Auth | Real, against test DB | Real, against prod DB |

Wrappers are tiny: a TypeScript interface plus a factory that returns fake or real based on `NODE_ENV`. No mocking framework.

### Foundation test coverage

The implementation plan will include test tasks for each item below, written TDD-style (failing test → minimum impl → commit):

**Auth feature** — sign-up creates user with correct defaults; sign-in returns cookie; sign-out invalidates; email verification flow; password reset flow.

**Permissions feature** — `requireRole` matrix; `requirePermission` matrix; banned user fails every authenticated check; permission grant/revoke writes audit log.

**API token system** — creation returns plaintext once, stores only hash; valid token resolves correctly; revoked/expired tokens rejected; raw token cannot bypass hash comparison.

**Audit log** — successful state-changing operations write a row; audit failure doesn't break primary operation.

**Rate limiting** — excess requests on auth endpoints return 429; per-IP limits don't leak.

**CORS** — allowed origins pass; disallowed rejected; credentials handled.

**Health endpoint** — `ok` when healthy; `degraded` when optional external unhealthy; `down` when DB unreachable.

### Frontend testing posture

- **Alpine.js components:** manual QA via dev server. Logic is simple enough that exhaustive tests aren't worth their maintenance cost.
- **React islands** (initially the future comment overlay): component-level Vitest + RTL for state machines and event handlers. Visual tests deferred until visual design phase.
- **E2E with Playwright:** two flows at foundation launch — "sign up, verify, log in, sign out" and "admin creates API token and calls autolink endpoint." Grows feature by feature.

### Coverage philosophy

Not chasing 100%. Targets:

- Critical paths near auth, authz, audit: >90% coverage
- Pure business logic in services: full coverage
- External boundary code (DB, fetch wrappers): integration-tested, not unit-tested
- Glue (route registration, config loading): smoke-tested via health check and one happy-path test per feature

Stated negatively: never write tests for the sake of coverage numbers; never skip tests for security-relevant logic.

### CI integration

The backend deploy workflow includes a preceding test job (Postgres service container, run all backend + frontend tests, then Playwright). Deploy only runs if tests pass. PRs run tests but don't deploy.

---

## Architectural Principles (Non-Negotiables)

These flow into every future feature spec automatically.

1. **No feature reads or writes another feature's tables directly.** Cross-feature data access goes through service methods on the owning feature.
2. **Secondary side-effects (audit, email, webhooks, cache invalidations, rebuild triggers) are wrapped with try/catch + logging.** They never propagate failure to the primary operation.
3. **Every external dependency call uses timeout + retry + circuit breaker.** Bare `fetch` calls to external services are a code-review reject.
4. **Frontend React islands wrap in error boundaries.**
5. **UUIDs for primary keys on our tables; text IDs (Better Auth-generated) for `users`.** Every column referencing a user is text, FKing to `users.id`.
6. **All tables have `created_at`; mutable tables have `updated_at`. Timestamps are `timestamptz`.**
7. **Sensitive secrets never enter the repo.** All config is env vars; `.env` is gitignored.
8. **Migrations are reversible where feasible.** Destructive migrations require backup verification.
9. **Eleventy stays the static site builder.** Wiki content is fetched at build time; user-specific data is hydrated client-side. No SSR backend for site pages.
10. **Authorization always evaluates against the user's current role.** Token prefixes are identification only.

---

## Open TBDs (non-blocking)

These do not block the foundation; they're surfaced so feature specs know what's deferred.

1. **Account deletion policy.** Treatment of comments, ratings, wiki revisions when a user deletes their account. Foundation supports both retention and removal via nullable FKs and `ON DELETE SET NULL`. Final policy decided in the relevant feature specs.
2. **Avatar storage.** `users.image` is a URL column; source (Gravatar / R2 upload / user-provided URL) decided in the first feature spec that wants avatars.
3. **Patreon vs. custom membership.** `users.tier` reserved as the seam. Decision deferred.
4. **Long-term log retention and error aggregation.** Deferred until raw Fly logs become inadequate.
5. **Spam / abuse moderation for comments.** Decided in the comments spec; foundation has audit log and banning mechanism in place.

---

## Future Sub-Project Roadmap (context only)

This foundation enables the following specs to be written and built independently. Each is a separate brainstorm → spec → plan → execution cycle.

1. **Foundational backend** ← THIS SPEC
2. Accounts + reading progress + bookmarks + favorites
3. Spoiler-aware wiki
4. Comments (sentence-level, threaded, moderated, GIFs)
5. Editable wiki module (Wiki module powered by the `wiki` feature)
6. Book reviews + ratings + per-book landing pages + external commerce links
7. Patreon link vs. custom membership decision and implementation
8. Future modules: Discussion forum, Art module, Games module

---

## References

- `PROJECT_BRIEFING.md` — project identity, current state, conventions
- `memory/feedback_creative_boundary.md` — content-creation boundary (no new creative content for the Lore Universe without user direction/approval)
- `memory/project_autolinker.md` — auto-linker feature concept (consumes the admin/autolink endpoint defined here)
