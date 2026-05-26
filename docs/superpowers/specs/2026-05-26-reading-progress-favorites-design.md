# Reading Progress + Favorites — Design Spec

**Date:** 2026-05-26  
**Status:** Approved

---

## Goal

Let logged-in users passively track which chapters they've read (auto-marked on scroll-to-bottom) and explicitly star wiki entries they want to save. Progress and favorites persist server-side, survive device changes, and surface inline on content pages and on the profile page.

---

## Scope

- **In:** Chapter read progress (auto-mark), wiki entry favorites (star toggle), profile summary page, chapter listing badges, sign-in prompt for logged-out users.
- **Out:** Chapter bookmarks at a specific paragraph, spoiler-aware wiki, per-book completion percentages, social/sharing features.

---

## Data Model

Two new tables added in migration `0003_reading_progress_favorites.sql`.

### `chapter_reads`
| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | `defaultRandom()` |
| `userId` | text FK → users(id) | cascade delete |
| `chapterId` | uuid FK → chapters(id) | cascade delete |
| `readAt` | timestamptz | `defaultNow()`, not updated on re-read (upsert-ignore) |

Constraints: `UNIQUE(userId, chapterId)`, `INDEX(userId)`.

### `wiki_favorites`
| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | `defaultRandom()` |
| `userId` | text FK → users(id) | cascade delete |
| `wikiEntryId` | uuid FK → wiki_entries(id) | cascade delete |
| `createdAt` | timestamptz | `defaultNow()` |

Constraints: `UNIQUE(userId, wikiEntryId)`, `INDEX(userId)`.

**Key decision — slug keys:** Eleventy static pages know their own slugs but not their DB UUIDs. The `GET /api/user/progress` response uses slug-based keys (`"bookSlug/chapterSlug"` and `"category/slug"`) so pages can match without UUID knowledge. The backend resolves slugs → UUIDs internally on writes.

**Published-status filter:** Progress and favorites responses always join against `chapters.publishedAt IS NOT NULL` and `wiki_entries.isPublished = true` to prevent unpublished content leaking into user-facing displays.

**Slug rename caveat:** If a slug is ever corrected, clients mid-session will briefly use the old slug until the page reloads. No code fix needed; treat a slug rename as a data event requiring a cache flush.

**Deferred:** Reverse-direction indexes (`chapterId`, `wikiEntryId`) should be added when admin analytics queries appear.

---

## Backend

### New module: `backend/src/features/progress/`

**`service.ts`** — DB operations only, no HTTP concerns:
- `markRead(userId, bookSlug, chapterSlug)` — resolves chapter by `(bookSlug, chapterSlug)` join, upsert-ignore on `chapter_reads`. Returns `{ ok: true }` or `{ ok: false, reason: 'not_found' }`.
- `unmarkRead(userId, bookSlug, chapterSlug)` — deletes the read record if present.
- `toggleFavorite(userId, category, slug)` — resolves wiki entry by `(category, slug)`, inserts if absent or deletes if present. Returns `{ favorited: boolean }`.
- `getProgress(userId)` — returns `{ readChapters: string[], favoriteWiki: string[] }` filtered to published content only.

**`routes.ts`** — Fastify routes with per-route rate limits:

| Method | Path | Rate limit | Description |
|---|---|---|---|
| GET | `/api/user/progress` | 20/min | Bulk fetch all progress + favorites |
| POST | `/api/user/chapters/:bookSlug/:chapterSlug/read` | 30/min | Mark chapter read |
| DELETE | `/api/user/chapters/:bookSlug/:chapterSlug/read` | 10/min | Unmark chapter read |
| POST | `/api/user/wiki/:category/:slug/favorite` | 20/min | Toggle wiki favorite |

Rate limit key: `userId` from session. Exceeds → `429` with `Retry-After` header.  
All routes require session auth (`requireAuth`). Logged-out → `401`.  
Write failures (DB error) are caught and logged; the route returns `200` anyway (best-effort). `not_found` → `404`.

**`index.ts`** — Fastify plugin (`fastify-plugin`), decorated as `progress`. Registered in `server.ts` after `tokensPlugin`.

**New dependency:** `@fastify/rate-limit` added to `backend/package.json`.

---

## Frontend

### `frontend/src/assets/js/progress.js`

New ES module, mirrors the `auth.js` session-cache pattern.

**Cache:** `sessionStorage` key `lr-progress`, TTL 5 minutes. Entry: `{ data: { readChapters: string[], favoriteWiki: string[] }, ts: number }`.

**On DOMContentLoaded:** If `getSession()` returns a non-null session, fetch `GET /api/user/progress` and populate the cache. If the fetch fails, sets an empty cache so pages degrade gracefully (no indicators shown rather than errors).

**Exports:**
- `isRead(bookSlug, chapterSlug) → boolean` — checks `readChapters` array for `"bookSlug/chapterSlug"`
- `isFavorited(category, slug) → boolean` — checks `favoriteWiki` array for `"category/slug"`
- `markRead(bookSlug, chapterSlug) → Promise<void>` — calls `POST .../read`, updates cache in-place
- `unmarkRead(bookSlug, chapterSlug) → Promise<void>` — calls `DELETE .../read`, updates cache
- `toggleFavorite(category, slug) → Promise<{ favorited: boolean }>` — calls `POST .../favorite`, updates cache

Logged-out: all read/write helpers no-op or show sign-in prompt; `isRead`/`isFavorited` return `false`.

---

### Chapter pages (`frontend/src/_includes/chapter.njk`)

Two additions to the existing layout:

1. **Read badge** — a `<span id="chapter-read-badge">` in the `reader-chapter-header` section. Hidden initially; `progress.js` shows it if `isRead(bookSlug, chapterSlug)` is true on page load.

2. **Scroll sentinel + auto-mark** — a `<div id="chapter-end-sentinel">` placed immediately after the closing `</article>`. An `IntersectionObserver` (threshold `0.9`) fires once when the sentinel becomes visible, calls `markRead()`, then shows the read badge. Guarded with a `let marked = false` flag so it only fires once per page load.

The chapter `fileSlug` (e.g. `chapter-2`) is already available as `page.fileSlug` in Nunjucks; book slug is hardcoded as `book1` (the only book currently). Both are emitted as `data-book-slug` and `data-chapter-slug` on the sentinel div so the inline script can read them.

Logged-out behaviour: sentinel observer fires, calls `markRead()`, which shows a non-blocking toast/inline prompt: *"Sign in to track your progress"* with a link to `/account/?redirect=<current-path>`.

---

### Book chapter listing (`frontend/src/lorekeeper/books/book1/chapters/index.njk`)

Each `.chapter-list-item` gets `data-book-slug="book1"` and `data-chapter-slug="{{ page.fileSlug }}"`. On DOMContentLoaded, `progress.js` iterates all `.chapter-list-item` elements, calls `isRead()` for each, and injects a `<span class="chapter-read-badge">✓ Read</span>` into items that are read.

---

### Wiki entry templates

All six category templates (`character.njk`, `faction.njk`, `location.njk`, `lore-trait.njk`, `lore.njk`, `mechanic.njk`) and the fallback `wiki-entry.njk` get a star button added to their `<header>` section:

```html
<button class="wiki-favorite-btn" id="wiki-favorite-btn"
  data-category="{{ category }}" data-slug="{{ page.fileSlug }}"
  aria-label="Favorite this entry" aria-pressed="false">
  ★
</button>
```

On DOMContentLoaded (via an inline `<script type="module">` at the bottom of each template):
- If `isFavorited(category, slug)` → set `aria-pressed="true"` and add `.wiki-favorite-btn--active` class.
- On click: if logged out, navigate to `/account/?redirect=<current-path>`. If logged in, call `toggleFavorite()`, flip the button state optimistically.

The `category` value is available from each template's known category (e.g. `character.njk` always renders characters). The slug is `page.fileSlug`.

---

### Profile page (`frontend/src/account/profile/index.njk`)

Two new sections appended after the existing sign-out button:

**Reading Progress section** — on load, reads the progress cache (or fetches fresh if expired). Shows chapters grouped by book with chapter number, title, and a link. Shows "X of Y chapters read" count. Empty state: *"Start reading to track your progress."*

**Favorites section** — shows favorited wiki entries as a grid of small cards (category badge + name + link). Empty state: *"Star a wiki entry to save it here."*

Both sections are hidden until `getSession()` resolves (same auth guard as the existing profile card).

---

## CSS additions (`frontend/src/assets/css/site.css`)

- `.chapter-read-badge` — small green/teal pill badge (✓ Read) on chapter header and listing items
- `.wiki-favorite-btn` — unstyled star button; gold fill when `.wiki-favorite-btn--active`
- `.profile-progress-section`, `.profile-favorites-section` — section headings + grid layout
- `.profile-chapter-list` — compact list for read chapters on profile
- `.profile-favorites-grid` — small card grid for favorited wiki entries

Reader-specific badge styles go in `reader.css` (used on the chapter page which loads only `reader.css`).

---

## Testing

**Backend (Vitest, `withRollbackDb`):**
- `markRead` — upsert-ignore is idempotent (call twice, one row)
- `unmarkRead` — removes the record
- `toggleFavorite` — insert on first call, delete on second, returns correct `favorited` boolean each time
- `getProgress` — returns slug keys; excludes unpublished chapters and wiki entries
- Routes: `GET /api/user/progress` → 401 without auth; `POST .../read` → 404 for unknown slug; rate limit test deferred (mock strategy TBD)

**Frontend:** Manual — read a chapter to bottom, confirm ✓ on chapter page and listing; star a wiki entry, confirm persistence on reload and on profile page; verify sign-in prompt appears for logged-out users.
