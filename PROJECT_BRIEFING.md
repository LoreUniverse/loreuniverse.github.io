# Lore Universe — Project Briefing

> Paste this document at the start of any new Claude session to restore full project context.
> Update **Section 7 (Current State)** and **Section 8 (Next Plans)** regularly.

---

## 1. Project Identity

**Name:** Lore Universe  
**Website purpose:** A personal creative writing website hosting a serialized sci-fi/fantasy novel and an information wiki for the novel's universe.  
**Long-term vision:** Multiple novels set in the same universe, all supported by a shared wiki. The wiki serves both as a standalone reference and as a companion to the novels.  
**Owner background:** Software engineering background; no prior frontend/backend/full-stack experience; learning AI-assisted development as a primary goal of this project.

---

## 2. Tech Stack

| Component | Choice | Notes |
|---|---|---|
| Static site generator | Eleventy 3 (11ty) | Nunjucks templates, GitHub Pages hosting |
| Templating language | Nunjucks (.njk) | Layout chaining via `base.njk` |
| Content format | Markdown + YAML front matter | Compatible with Obsidian notes |
| Backend | Fastify + TypeScript | Docker container on Fly.io |
| ORM | Drizzle | Type-safe, migration-based |
| Database | Neon (managed Postgres) | Free tier during development |
| Auth | Better Auth v1.6.11 | Email+password, email verification, session cookies |
| Email | Resend | Free tier (3,000/mo), used for verification and password reset |
| Server-side AI | Anthropic SDK | Claude 3.7 Sonnet; admin endpoints only (autolink) |
| Frontend dynamic | Alpine.js (CDN) | Vanilla for simple interactions; React islands (Vite) reserved for complex UIs |
| Deployment — site | GitHub Actions → GitHub Pages | `deploy-site.yml`, triggers on push + `repository_dispatch` |
| Deployment — backend | GitHub Actions → Fly.io | `deploy-backend.yml`, tests then `flyctl deploy --remote-only` |
| Version control | Git / GitHub | Monorepo: `https://github.com/LoreUniverse/lorekeeper` |
| Node version | 24 | |
| Editor | Visual Studio Code | |
| Notes source | Obsidian | Uses `[[double bracket]]` internal link syntax |

**Live API:** `https://loreuniverse-api.fly.dev`  
**Live site:** `https://loreuniverse.github.io`

---

## 3. Architecture Overview

Three independent components communicating over HTTPS:

```
┌──────────────────────────────────────────────────────────────┐
│ Browser (visitor — anonymous or logged in)                    │
└──────────────┬───────────────────────────────┬───────────────┘
               │ static HTML/CSS/JS            │ fetch (CORS)
               ▼                               ▼
  ┌─────────────────────────┐    ┌────────────────────────────┐
  │ GitHub Pages            │    │ Fastify API on Fly.io      │
  │ (Eleventy build output) │    │ (Docker, scale-to-zero)    │
  │  • Wiki pages           │    │  • /api/auth/*             │
  │  • Chapter pages        │    │  • /api/wiki/*             │
  │  • Landing pages        │    │  • /api/books/*            │
  │  • Account/admin pages  │    │  • /api/chapters/*         │
  └─────────────────────────┘    │  • /api/user/*             │
               │                 │  • /api/admin/*            │
               │ build-time      │  • /health                 │
               │ fetch           └────────────────────────────┘
               └──────────────────────────────┘
                 _data/wiki.js fetches /api/wiki/all
                 at Eleventy build time (graceful degradation)
```

**Key integration point:** The static site fetches all published wiki entries from the API at build time (`frontend/src/_data/wiki.js`). The `repository_dispatch` event `wiki-content-changed` (fired by `POST /api/admin/site-rebuild`) triggers a GitHub Actions rebuild so the static site always reflects the latest wiki DB state.

**Cold start note:** The backend scales to zero on Fly.io. First request after ~5 min idle takes 2–4s. Acceptable during development; revisit when public traffic warrants always-warm.

---

## 4. Folder Structure

```
lorekeeper/                          ← repo root (local name)
├── frontend/                        ← Eleventy static site
│   ├── .eleventy.js                 ← wiki link transform, passthrough copy
│   ├── package.json
│   └── src/
│       ├── _data/
│       │   ├── site.js              ← single source of truth for module URL paths
│       │   ├── navigation.js        ← navbar items (data-driven)
│       │   ├── config.js            ← site-wide settings (wikiLinksVisible, etc.)
│       │   └── wiki.js              ← build-time API fetch → wiki data for templates
│       ├── _includes/
│       │   ├── base.njk             ← root layout for all non-reader pages (loads site.css)
│       │   ├── reader-layout.njk    ← standalone layout for chapter pages only (loads reader.css, no nav/footer)
│       │   ├── redirect.njk         ← meta-refresh redirect template
│       │   ├── chapter.njk          ← chapter reading template (uses reader-layout.njk)
│       │   ├── wiki-category.njk    ← shared layout for all 6 wiki category listing pages
│       │   ├── wiki-entry.njk       ← fallback layout for wiki entry pages
│       │   ├── character.njk        ← wiki: character entry (structured meta)
│       │   ├── faction.njk          ← wiki: faction entry (structured meta)
│       │   ├── location.njk         ← wiki: location entry (structured meta)
│       │   ├── lore-trait.njk       ← wiki: lore trait entry (structured meta)
│       │   ├── lore.njk             ← wiki: lore entry (structured meta)
│       │   └── mechanic.njk         ← wiki: mechanic entry (structured meta)
│       ├── lorekeeper/              ← Library module (internal name kept)
│       │   ├── index.md             ← /library/
│       │   └── books/               ← /library/books/*
│       ├── wiki/                    ← Wiki module (top-level)
│       │   ├── index.njk            ← /wiki/ — V2 wiki hub (6 category cards with live counts)
│       │   ├── characters/index.md  ← uses wiki-category.njk + category_key: characters
│       │   ├── lore-traits/index.md ← uses wiki-category.njk + category_key: lore-traits
│       │   ├── mechanics/index.md   ← uses wiki-category.njk + category_key: mechanics
│       │   ├── locations/index.md   ← uses wiki-category.njk + category_key: locations
│       │   ├── factions/index.md    ← uses wiki-category.njk + category_key: factions
│       │   └── lore/index.md        ← uses wiki-category.njk + category_key: lore
│       ├── account/                 ← Auth UI
│       │   ├── index.njk            ← /account/ (sign in / sign up / reset)
│       │   └── profile/index.njk   ← /account/profile/
│       ├── assets/
│       │   ├── css/
│       │   │   ├── tokens.css       ← design tokens only (@imported by site.css and reader.css — never loaded directly)
│       │   │   ├── site.css         ← always-dark site shell; @imports tokens.css; loaded by base.njk
│       │   │   └── reader.css       ← reader-only styles; @imports tokens.css; loaded by reader-layout.njk
│       │   └── js/
│       │       ├── auth.js          ← client-side auth (session check, account button state)
│       │       └── reader.js        ← reader settings: font size, wiki links, dark/light theme
│       ├── redirects/               ← legacy /lorekeeper/* → new URLs
│       ├── about/
│       └── index.njk                ← V2 homepage (hero, explore cards, now reading, wiki preview)
├── backend/                         ← Fastify TypeScript API
│   ├── package.json
│   ├── tsconfig.json
│   ├── vitest.config.ts
│   ├── Dockerfile                   ← multi-stage build (deps → build → runtime)
│   ├── fly.toml                     ← scale-to-zero, release_command: drizzle-kit migrate
│   ├── drizzle/                     ← migration SQL files
│   │   ├── 0000_initial_better_auth.sql
│   │   ├── 0001_permissions_tokens_audit.sql
│   │   └── 0002_books_chapters_wiki.sql
│   ├── scripts/
│   │   ├── .env.example
│   │   └── autolink.js              ← CLI: POST /api/admin/autolink on a .md file
│   └── src/
│       ├── server.ts                ← registers all plugins, starts Fastify
│       ├── db/
│       │   ├── client.ts            ← createDb() / closeDb()
│       │   └── schema.ts            ← all 12 Drizzle table definitions
│       ├── routes/
│       │   └── health.ts            ← GET /health (reports all 9 modules)
│       ├── features/
│       │   ├── auth/                ← Better Auth plugin + CORS config
│       │   ├── audit/               ← audit log service + plugin
│       │   ├── permissions/         ← roles, grants, middleware, ban/unban, applications
│       │   ├── tokens/              ← API token CRUD (argon2 hashed, role-prefixed)
│       │   ├── wiki/                ← wiki entry routes, plugin, sync helper
│       │   ├── books/               ← book routes + plugin
│       │   ├── chapters/            ← chapter routes + plugin + sync helper
│       │   └── admin/               ← autolink + site-rebuild routes, Claude plugin
│       └── lib/
│           └── external/
│               ├── claude.ts        ← AnthropicClaudeClient + FakeClaudeClient
│               ├── github-dispatch.ts ← RealGitHubDispatchClient + FakeGitHubDispatchClient
│               ├── circuit-breaker.ts ← makeBreaker() (opossum wrapper)
│               └── retry.ts         ← withRetry() + withTimeout()
├── shared/                          ← shared TypeScript types placeholder
│   ├── package.json
│   └── src/index.ts
├── scripts/                         ← content management CLI tools
│   ├── migrate-obsidian.js          ← converts [[links]] → {category|slug|display}
│   ├── sync-wiki.js                 ← upserts src/wiki/**/*.md → production DB
│   ├── sync-chapters.js             ← upserts src/lorekeeper/books/**/*.md → production DB
│   └── staging/                     ← gitignored: Obsidian files awaiting migration
├── docs/
│   └── superpowers/
│       ├── specs/                   ← design documents
│       └── plans/                   ← implementation plans
├── .github/
│   └── workflows/
│       ├── deploy-site.yml          ← builds Eleventy → GitHub Pages; triggers on push + repository_dispatch
│       └── deploy-backend.yml       ← runs tests (with Postgres service) → flyctl deploy
└── PROJECT_BRIEFING.md
```

---

## 5. Database Schema

All tables use UUID primary keys (except Better Auth tables which use text IDs). All timestamps are `timestamptz`. Mutable tables have `updated_at`.

### Better Auth tables (managed by Better Auth)
`user`, `session`, `account`, `verification`

User fields of note: `id` (text), `name`, `email`, `emailVerified`, `role` (text — `user` | `moderator` | `admin`), `banned`, `banReason`, `banExpires`, `image`, `createdAt`, `updatedAt`.

### Foundation C tables

**`user_permissions`** — granular permission grants  
`id` (uuid), `userId` (text FK→user), `permission` (text, e.g. `wiki_edit`), `grantedBy` (text FK→user nullable), `grantedAt`

**`permission_applications`** — user requests for permissions  
`id` (uuid), `userId` (text FK→user), `permission`, `reason`, `status` (`pending`|`approved`|`rejected`), `reviewedBy` (text FK→user nullable), `reviewNote` (nullable), `createdAt`, `updatedAt`

**`api_tokens`** — API tokens for programmatic access  
`id` (uuid), `userId` (text FK→user), `name`, `tokenHash` (argon2), `tokenPrefix` (first 20 chars for lookup), `role` (`admin`|`moderator`), `lastUsedAt` (nullable), `expiresAt` (nullable), `revokedAt` (nullable), `createdAt`

**`audit_log`** — best-effort write-only log  
`id` (uuid), `actorUserId` (text nullable), `action` (text), `targetType` (text nullable), `targetId` (text nullable), `metadata` (jsonb nullable), `createdAt`

### Foundation D tables

**`books`**  
`id` (uuid), `slug` (unique), `title`, `description` (nullable), `coverImageUrl` (nullable), `externalLinks` (jsonb nullable), `publishedAt` (nullable), `isPublished` (boolean, default false), `createdAt`, `updatedAt`

**`chapters`**  
`id` (uuid), `bookId` (uuid FK→books cascade), `chapterNumber` (integer), `slug`, `title`, `publishedAt` (nullable), unique on (`bookId`, `slug`), `createdAt`, `updatedAt`

**`wiki_entries`**  
`id` (uuid), `category`, `slug`, `name`, `frontMatter` (jsonb), `body`, `isPublished` (boolean, default true), unique on (`category`, `slug`), `createdAt`, `updatedAt`

**`wiki_revisions`**  
`id` (uuid), `wikiEntryId` (uuid FK→wiki_entries cascade), `editorUserId` (text FK→user set null, nullable), `frontMatter` (jsonb), `body`, `editSummary` (nullable), `createdAt`

### Wiki entry front matter schemas (by category)

**characters:** `name`, `status` (alive|deceased|unknown), `species`, `factions` (slug list), `home_location` (slug), `lore_traits` (slug list), `skills` (list), `equipment` (list), `notes`  
**lore-traits:** `name`, `subtype`, `abilities` (list), `characters` (slug list)  
**mechanics:** `name`, `category` (universal law|system|both), `related_mechanics` (slug list), `related_entries` (slug list)  
**locations:** `name`, `type`, `factions` (slug list), `notable_characters` (slug list), `lore` (slug list)  
**factions:** `name`, `type`, `alignment`, `notable_characters` (slug list), `base_location` (slug), `lore` (slug list)  
**lore:** `name`, `category`, `related_characters` (slug list), `related_locations` (slug list), `related_factions` (slug list)  
**chapters:** `title`, `chapter_number`, `arc`, `publication_date`, `summary`, `wiki_links` (true|false)

---

## 6. API Reference

Base URL: `https://loreuniverse-api.fly.dev`

### Auth (`/api/auth/*` — Better Auth)
| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/api/auth/sign-up/email` | none | Register with email+password |
| POST | `/api/auth/sign-in/email` | none | Sign in, sets session cookie |
| POST | `/api/auth/sign-out` | session | Sign out |
| POST | `/api/auth/forget-password` | none | Send password reset email |
| POST | `/api/auth/reset-password` | token | Reset password |
| GET | `/api/auth/get-session` | session | Returns current session + user (role, banned, etc.) |

### Wiki
| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/api/wiki/all` | none | All published wiki entries |
| GET | `/api/wiki/:category/:slug` | none | Single published wiki entry |
| PUT | `/api/admin/wiki/:category/:slug` | session + `wiki_edit` permission | Upsert entry + create revision + trigger rebuild |

### Books & Chapters
| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/api/books` | none | All published books |
| GET | `/api/books/:slug` | none | Single published book |
| PUT | `/api/admin/books/:slug` | session + admin role | Upsert book |
| GET | `/api/chapters/:bookSlug` | none | All chapters for a book |

### Tokens
| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/api/user/tokens` | session | List own tokens |
| POST | `/api/user/tokens` | session | Create token (returns plaintext once) |
| DELETE | `/api/user/tokens/:id` | session | Revoke own token |

### Permissions & Users
| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/api/user/permissions/apply` | session | Submit permission application |
| GET | `/api/admin/users` | admin | *(planned — not yet implemented)* |
| POST | `/api/admin/users/:id/ban` | admin | Ban user |
| POST | `/api/admin/users/:id/unban` | admin | Unban user |
| POST | `/api/admin/permissions/grant` | admin | Grant permission to user |
| POST | `/api/admin/permissions/revoke` | admin | Revoke permission from user |
| GET | `/api/admin/permissions/applications` | admin | List pending applications |
| POST | `/api/admin/permissions/applications/:id/approve` | admin | Approve application |
| POST | `/api/admin/permissions/applications/:id/reject` | admin | Reject application |

### Admin Tools
| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/api/admin/autolink` | admin | Claude autolink on chapter prose (body: `{chapterText, policy?}`) |
| POST | `/api/admin/site-rebuild` | admin | Fire `wiki-content-changed` repository_dispatch → triggers Eleventy rebuild |
| GET | `/health` | none | All 9 module health checks |

**Authentication options:**
- Session cookie (set by sign-in, sent automatically by browser)
- Bearer token: `Authorization: Bearer lore_admin_<token>` or `lore_moderator_<token>`

---

## 7. Established Conventions

### Inline Wiki Links in Chapters
Chapter prose uses a custom link syntax processed by the Eleventy wiki link transform in `.eleventy.js`:

```
{category|slug|display text}
```

Examples: `{characters|pinelopi|Pinelopi}`, `{mechanics|lore-essence-mythos|Mythos}`

Category names are **plural** and match folder names exactly. The transform renders these as `<a href="/wiki/{category}/{slug}/">{display}</a>` (or unstyled if `wikiLinksVisible: false` in `config.js`).

### Obsidian Migration Workflow
1. Copy `.md` files into `scripts/staging/{category}/`
2. `node scripts/migrate-obsidian.js` → converts `[[links]]` to `{category|slug|display}`, outputs to `scripts/converted/`
3. Review and add extra front matter fields, copy to `frontend/src/wiki/{category}/`
4. `node --env-file=.env scripts/sync-wiki.js` → upserts to production DB
5. `POST /api/admin/site-rebuild` → triggers Eleventy rebuild

Both `scripts/staging/` and `scripts/converted/` are gitignored.

### Naming Conventions
- Entry filenames: lowercase, hyphen-separated (`aldren-voss.md`)
- Slugs in cross-references match filenames without `.md`
- Template files: hyphen-separated `.njk` in `_includes/`
- Eleventy collection names in `.eleventy.js`: camelCase (`loreTraits`, `characters`)

### Lorekeeper / Library Naming
The first module is named **Library** externally (URLs, nav labels, page titles) but uses `lorekeeper` internally (file paths `src/lorekeeper/`, data keys `site.modules.lorekeeper`, code variables). Never use `library` in code paths or identifiers.

### Global Data Files (`src/_data/`)
- **`site.js`** — single source of truth for module URL paths. All templates and transforms reference `site.modules.wiki.root` etc. Do not hardcode paths.
- **`navigation.js`** — single source of truth for the navbar array. `base.njk` renders from this.
- **`wiki.js`** — fetches `/api/wiki/all` at build time. Gracefully degrades to empty on timeout/error.

### V2 CSS Architecture (three-file system)
- **`tokens.css`** — design tokens only (palette, fonts, motion, z-index, Google Fonts `@import`). Never loaded directly by a page. Only ever `@import`ed.
- **`site.css`** — always-dark site shell. `@import 'tokens.css'`. Covers nav, footer, buttons, homepage sections, wiki hub/category/entry pages, responsive breakpoints. Loaded by `base.njk`.
- **`reader.css`** — reader-only. `@import 'tokens.css'`. Scoped to `.reader-wrap`. Light mode overrides via `.reader-wrap[data-reader-theme="light"]` and `:root[data-reader-theme="light"] .reader-wrap`. Loaded only by `reader-layout.njk`. Defines `btn-secondary` locally (site.css also defines it, but reader pages don't load site.css).

### Reader Layout Isolation
Chapter pages use `reader-layout.njk` — a complete standalone HTML document with no site nav or footer. It loads only `reader.css` and `reader.js`. The anti-FOUC script in `<head>` reads `localStorage.getItem('lr-reader-theme')` and sets `document.documentElement.dataset.readerTheme` before paint. Runtime JS also sets `WRAP.dataset.readerTheme`. CSS covers both selectors to prevent flash.

Reader `localStorage` keys: `lr-font-size` (sm/md/lg), `lr-wiki-links` (show/hidden), `lr-reader-theme` (dark/light). Old key `lr-theme` is retired.

### V2 Design Tokens
- Fonts: **Cinzel Decorative** (display/headings), **Rajdhani** (UI labels), **Inter** (body prose)
- Palette: `--void: #07080e`, `--gold: #f59e0b`, `--blue: #38bdf8`, `--violet: #c084fc`
- CSS variables: `--font-display`, `--font-ui`, `--font-body`, `--dur-fast/base/slow`, `--z-nav`, `--z-reader-bar`, `--z-settings`

### Navbar Behavior (V2)
- Nav is hardcoded HTML in `base.njk` (not data-driven from `navigation.js`).
- Glass pill style: `position: fixed; top: 1rem; left/right: 1rem; border-radius: 12px; backdrop-filter: blur`.
- Desktop: brand sigil + wordmark left, nav links center, gold Account button right.
- Mobile (≤900px): hamburger toggles `.nav-mobile--open` dropdown. Nav links and Account button hidden.

### Layout Chaining
Front matter `---` must appear **before** any Nunjucks comments in template files — Eleventy's front matter parser doesn't detect it otherwise and the `base.njk` layout chain silently breaks.

### Wiki Category Layout
All six wiki category listing pages (`/wiki/characters/`, etc.) share `wiki-category.njk`. Their `index.md` files specify `layout: wiki-category.njk` and `category_key: <slug>` in front matter. The layout reads `wiki.byCategory[category_key]` for entry data. The `wiki.byCategory` object is keyed by category slug; each value is an array of `{ name, slug, description }`.

### Chapter Pagination Filter
`getPrevNext(collection, url)` is registered in `.eleventy.js`. Returns `{ prev, next }` — each is a full Eleventy page object or `null`. Used in `chapter.njk` as `{% set chapNav = collections.chapters | getPrevNext(page.url) %}`.

### Directory Data Files
Each wiki category entry folder has a `.11tydata.json` assigning the correct per-entry layout (e.g. `character.njk`), so individual entry `.md` files don't need a `layout:` field. Note: the category `index.md` files do have `layout: wiki-category.njk` in their own front matter (they need `category_key` too, which `.11tydata.json` can't supply per-page).

### Architectural Principles (non-negotiable in all future features)
1. No feature reads or writes another feature's tables directly — cross-feature access goes through service methods.
2. Secondary side-effects (audit, email, webhooks, rebuild triggers) wrap in try/catch + logging; never propagate failure to the primary operation.
3. Every external dependency call uses timeout + retry + circuit breaker (`withRetry`, `withTimeout`, `makeBreaker`).
4. Frontend React islands (when used) wrap in error boundaries.
5. UUIDs for primary keys; text IDs for `users` (Better Auth-generated). Every FK to users is text.
6. All tables have `created_at`; mutable tables have `updated_at`. Timestamps are `timestamptz`.
7. Secrets never enter the repo. All config via environment variables.
8. Migrations are reversible where feasible.
9. Eleventy stays the static site builder; wiki content is fetched at build time, user-specific data is hydrated client-side.
10. Authorization always evaluates against the user's current role; token prefixes are identification only.

### Testing Posture
- Backend: Vitest integration tests; `withRollbackDb` wraps each test in a transaction that rolls back — no test data persists.
- External dependencies: `FakeClaudeClient`, `FakeGitHubDispatchClient` injected directly in tests. Factory functions throw in `NODE_ENV=test` to enforce injection.
- Frontend: manual browser testing + visual review. No automated frontend tests currently.

---

## 8. Current State

### Plans — Status

| Plan | Description | Status |
|---|---|---|
| Foundation A | Monorepo restructure, Library rename, Wiki top-level, Fastify skeleton on Fly | ✅ Merged |
| Foundation B | Postgres (Neon), Drizzle, Better Auth, Resend, email-verified auth flows | ✅ Merged |
| Foundation C | Role/permission middleware, API tokens, audit log, ban/grant/application endpoints | ✅ Merged |
| Foundation D | Books/chapters/wiki tables, Claude autolink, GitHub dispatch rebuild, Eleventy build-time wiki fetch | ✅ Merged |
| Plan F (V2 Design) | Dark techno-arcane design system, V2 CSS, reader isolation, all page templates | ✅ Complete — 15 commits on main, **push pending** (see auth issue below) |

### Infrastructure
| Component | State |
|---|---|
| Backend (loreuniverse-api.fly.dev) | ✅ Live — all 9 modules healthy |
| Static site (loreuniverse.github.io) | ✅ Live — currently showing pre-V2 build; V2 deploys once push issue resolved |
| CI/CD (deploy-backend.yml) | ✅ Tests + deploy on push to main |
| CI/CD (deploy-site.yml) | ✅ Builds + deploys on push + repository_dispatch |
| Neon database | ✅ Live — 3 migrations applied |
| Fly secrets | ✅ Set: DATABASE_URL, BETTER_AUTH_URL, BETTER_AUTH_SECRET, GITHUB_DISPATCH_TOKEN, GITHUB_DISPATCH_REPO, ANTHROPIC_API_KEY |
| GitHub secret (lorekeeper repo) | ⚠️ **LORE_API_URL_BUILD not yet set** — wiki data not fetched at build time |
| GitHub push auth | ⚠️ **403 on push** — credential for `timyih` may have expired. Fix: `cmdkey /delete:LegacyGeneric:target=git:https://github.com` then `git push`, or switch to SSH remote |

### Content
| Area | State |
|---|---|
| Wiki entries in DB | 11 entries (characters: pinelopi, test-character; lore-traits: librarian, test-lore-trait; mechanics: lore-essence-mythos, lore-traits, loreworlds, test-mechanic; locations: test-location; factions: test-faction; lore: test-lore) |
| Test entries | ⚠️ 7 test-* entries need removal or `isPublished: false` before public launch |
| Unresolved [[links]] | ⚠️ Several wiki entries still contain `[[double bracket]]` links not yet converted (e.g. Pinelopi mentions `[[Mythos Corp]]`, Lore Traits mentions `[[Lore Power]]`, `[[Loreseekers]]`) |
| Book 1 chapters | ⬜ No real prose added yet |
| Visual design | ✅ V2 complete — dark techno-arcane design, full CSS system, reader isolation |
| Admin control panel | ⬜ No admin UI — Plan E |

### Immediate One-Time Actions Needed
1. **Fix GitHub push auth** — credential expired for `timyih`. Run in PowerShell: `cmdkey /delete:LegacyGeneric:target=git:https://github.com` then `git push`. Or switch to SSH: `git remote set-url origin git@github.com:LoreUniverse/lorekeeper.git`
2. **Set `LORE_API_URL_BUILD` secret** in GitHub: repo `LoreUniverse/lorekeeper` → Settings → Secrets → Actions → New secret: `LORE_API_URL_BUILD` = `https://loreuniverse-api.fly.dev`
3. **Remove or unpublish test entries** — delete `test-*.md` files from `frontend/src/wiki/*/` and re-run `sync-wiki.js`, or add `isPublished: false` to their front matter

---

## 9. Next Plans

### Plan E — Admin Control Panel
**Status:** Spec written — `docs/superpowers/specs/2026-05-24-admin-control-panel-design.md`. No implementation plan written yet.  
**What it builds:** A `/admin/` section of the static site (Eleventy pages + Alpine.js CDN) with a GUI for all the backend admin features: site rebuild, wiki management, user management, permission applications, API tokens, and audit log.  
**Why it's next:** All the backend infrastructure exists but there is no UI to interact with it — currently requires raw API calls. This plan makes the backend testable and usable in a browser.  
**New backend needed:** `GET /api/admin/wiki` (all entries incl. unpublished), `PATCH /api/admin/wiki/:category/:slug` (toggle isPublished), `GET /api/admin/users` (list users), `GET /api/admin/audit` (paginated log).  
**V2 design note:** The admin panel should use the V2 design system (`base.njk` + `site.css`) — the dark techno-arcane aesthetic works well for an admin interface.

---

## 10. Future Feature Roadmap

After Plans E and F, these are the natural next feature areas. Each needs its own brainstorm → spec → plan cycle.

| Feature | Description |
|---|---|
| Reading progress + bookmarks | Track which chapters a logged-in user has read; bookmark chapters/wiki entries |
| Spoiler-aware wiki | Wiki entries reveal only information the reader's current progress entitles them to see |
| Comments | Sentence-level, threaded, moderated, with GIF support (per chapter and per wiki entry) |
| Wiki editor UI | Browser-based editor for wiki entries with live preview and revision history |
| Book reviews + ratings | Star ratings, text reviews, per-book landing pages |
| Reader accounts (full) | Richer profile page, reading stats, favorites |
| Membership / Patreon | `users.tier` column reserved; final decision deferred |
| Discussion forum | Separate `/discussion/` module |
| Art module | `/art/` module |

---

## 11. Working Preferences

- Always explain what generated code does, even briefly — the owner is learning, not just copy-pasting.
- Ask before making structural changes to the schema or folder layout.
- When multiple approaches exist, briefly describe the tradeoff before recommending one.
- Prefer generating complete, ready-to-use files over code snippets where possible.
- Flag anything that will need to be manually updated after generation (placeholder values, version numbers, etc.).
- **Do not provide input on any creative aspects of this project** (story content, character design, visual aesthetics, color choices) unless specifically prompted. Ask if something needs immediate attention.

---

## 12. Working Directory

All work for this project is done in the repo root at:  
`C:\Users\timmy\Desktop\LoreUniverse\lorekeeper\`

The monorepo contains `frontend/`, `backend/`, `shared/`, `scripts/`, `docs/`.

---

## 13. Cost Snapshot

| Layer | Service | Current cost |
|---|---|---|
| Static hosting | GitHub Pages | $0 |
| Backend hosting | Fly.io scale-to-zero | ~$0.20/mo (rootfs only) |
| Database | Neon free tier | $0 |
| Email | Resend free tier (3,000/mo) | $0 |
| Claude API | Pay-per-use (admin autolink only) | ~$1–5/mo depending on usage |
| Domain | Not yet purchased | $0 (then ~$10/yr at launch) |

First meaningful dollar: flipping backend to always-warm (~$2–4/mo), purchasing a domain, or outgrowing Resend/Neon free tiers.
