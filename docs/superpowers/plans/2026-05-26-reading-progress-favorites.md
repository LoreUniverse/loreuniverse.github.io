# Reading Progress + Favorites — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let logged-in users auto-track chapter reads (IntersectionObserver on scroll-to-bottom) and star wiki entries, with a bulk-fetch progress cache in `sessionStorage` and a profile page summary.

**Architecture:** New `progress` Fastify plugin (service + routes) backed by two new Postgres tables. Frontend `progress.js` ES module mirrors the existing `auth.js` session-cache pattern — one `GET /api/user/progress` call on page load populates `sessionStorage`; all page scripts check the local cache. Rate limiting via `@fastify/rate-limit`.

**Tech Stack:** Fastify 5, Drizzle ORM, Neon Postgres, `@fastify/rate-limit`, Eleventy 3 Nunjucks templates, vanilla ES modules (no bundler).

---

## File Map

**Create:**
- `backend/src/features/progress/service.ts` — DB operations (markRead, unmarkRead, toggleFavorite, getProgress)
- `backend/src/features/progress/routes.ts` — Fastify route handlers + rate limits
- `backend/src/features/progress/index.ts` — Fastify plugin registration
- `backend/src/features/progress/routes.test.ts` — Vitest integration tests
- `backend/drizzle/0003_reading_progress_favorites.sql` — migration SQL
- `frontend/src/assets/js/progress.js` — client-side progress cache module

**Modify:**
- `backend/src/db/schema.ts` — add `chapterReads`, `wikiFavorites` tables + schema export
- `backend/src/server.ts` — register `progressPlugin`
- `backend/package.json` — add `@fastify/rate-limit`
- `frontend/src/_includes/chapter.njk` — read badge + scroll sentinel
- `frontend/src/_includes/reader-layout.njk` — load `progress.js`
- `frontend/src/lorekeeper/books/book1/chapters/index.njk` — read badges on chapter list items
- `frontend/src/_includes/character.njk` — star button
- `frontend/src/_includes/faction.njk` — star button
- `frontend/src/_includes/location.njk` — star button
- `frontend/src/_includes/lore-trait.njk` — star button
- `frontend/src/_includes/lore.njk` — star button
- `frontend/src/_includes/mechanic.njk` — star button
- `frontend/src/_includes/wiki-entry.njk` — star button
- `frontend/src/account/profile/index.njk` — progress + favorites sections
- `frontend/src/assets/css/site.css` — new badge + button + profile section styles
- `frontend/src/assets/css/reader.css` — chapter read badge styles

---

## Task 1: DB Schema + Migration

**Files:**
- Modify: `backend/src/db/schema.ts`
- Create: `backend/drizzle/0003_reading_progress_favorites.sql`

- [ ] **Step 1: Add tables to schema.ts**

Open `backend/src/db/schema.ts`. After the `wikiRevisions` table definition (line ~200) and before the `schema` export, add:

```typescript
// ---------- CHAPTER READS ----------
export const chapterReads = pgTable(
  'chapter_reads',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    chapterId: uuid('chapter_id').notNull().references(() => chapters.id, { onDelete: 'cascade' }),
    readAt: timestamp('read_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    uqUserChapter: uniqueIndex('chapter_reads_user_chapter_unique').on(t.userId, t.chapterId),
    userIdx: index('chapter_reads_user_idx').on(t.userId),
  }),
);

// ---------- WIKI FAVORITES ----------
export const wikiFavorites = pgTable(
  'wiki_favorites',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    wikiEntryId: uuid('wiki_entry_id').notNull().references(() => wikiEntries.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    uqUserEntry: uniqueIndex('wiki_favorites_user_entry_unique').on(t.userId, t.wikiEntryId),
    userIdx: index('wiki_favorites_user_idx').on(t.userId),
  }),
);
```

Then update the `schema` export at the bottom of the file:

```typescript
export const schema = {
  users, sessions, accounts, verifications,
  userPermissions, permissionApplications, apiTokens, auditLog,
  books, chapters, wikiEntries, wikiRevisions,
  chapterReads, wikiFavorites,
};
```

- [ ] **Step 2: Create the migration SQL file**

Create `backend/drizzle/0003_reading_progress_favorites.sql` with this exact content:

```sql
CREATE TABLE "chapter_reads" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" text NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "chapter_id" uuid NOT NULL REFERENCES "chapters"("id") ON DELETE CASCADE,
  "read_at" timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT "chapter_reads_user_chapter_unique" UNIQUE("user_id","chapter_id")
);

CREATE INDEX "chapter_reads_user_idx" ON "chapter_reads" ("user_id");

CREATE TABLE "wiki_favorites" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" text NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "wiki_entry_id" uuid NOT NULL REFERENCES "wiki_entries"("id") ON DELETE CASCADE,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT "wiki_favorites_user_entry_unique" UNIQUE("user_id","wiki_entry_id")
);

CREATE INDEX "wiki_favorites_user_idx" ON "wiki_favorites" ("user_id");
```

- [ ] **Step 3: Run typecheck to confirm schema compiles**

```
cd backend && npm run typecheck
```

Expected: no errors.

- [ ] **Step 4: Commit**

```
git add backend/src/db/schema.ts backend/drizzle/0003_reading_progress_favorites.sql
git commit -m "feat(progress): add chapter_reads and wiki_favorites schema + migration"
```

---

## Task 2: Install @fastify/rate-limit

**Files:**
- Modify: `backend/package.json`

- [ ] **Step 1: Install the package**

```
cd backend && npm install @fastify/rate-limit
```

- [ ] **Step 2: Confirm it appears in package.json dependencies**

The `dependencies` object in `backend/package.json` should now include `"@fastify/rate-limit": "^9.x.x"` (exact version may differ).

- [ ] **Step 3: Commit**

```
git add backend/package.json backend/package-lock.json
git commit -m "chore(deps): add @fastify/rate-limit"
```

---

## Task 3: Progress Service

**Files:**
- Create: `backend/src/features/progress/service.ts`

- [ ] **Step 1: Create the service file**

Create `backend/src/features/progress/service.ts`:

```typescript
import { and, eq, isNotNull } from 'drizzle-orm';
import type { drizzle } from 'drizzle-orm/postgres-js';
import { schema } from '../../db/schema.js';

type Db = ReturnType<typeof drizzle<typeof schema>>;

export type ProgressService = {
  markRead(userId: string, bookSlug: string, chapterSlug: string): Promise<{ ok: true } | { ok: false; reason: 'not_found' }>;
  unmarkRead(userId: string, bookSlug: string, chapterSlug: string): Promise<void>;
  toggleFavorite(userId: string, category: string, slug: string): Promise<{ favorited: boolean }>;
  getProgress(userId: string): Promise<{ readChapters: string[]; favoriteWiki: string[] }>;
};

export function createProgressService(db: Db): ProgressService {
  return {
    async markRead(userId, bookSlug, chapterSlug) {
      // Resolve chapter UUID via join on books.slug + chapters.slug
      const [row] = await db
        .select({ chapterId: schema.chapters.id })
        .from(schema.chapters)
        .innerJoin(schema.books, eq(schema.chapters.bookId, schema.books.id))
        .where(and(eq(schema.books.slug, bookSlug), eq(schema.chapters.slug, chapterSlug)));

      if (!row) return { ok: false, reason: 'not_found' };

      await db
        .insert(schema.chapterReads)
        .values({ userId, chapterId: row.chapterId })
        .onConflictDoNothing();

      return { ok: true };
    },

    async unmarkRead(userId, bookSlug, chapterSlug) {
      const [row] = await db
        .select({ chapterId: schema.chapters.id })
        .from(schema.chapters)
        .innerJoin(schema.books, eq(schema.chapters.bookId, schema.books.id))
        .where(and(eq(schema.books.slug, bookSlug), eq(schema.chapters.slug, chapterSlug)));

      if (!row) return;

      await db
        .delete(schema.chapterReads)
        .where(and(
          eq(schema.chapterReads.userId, userId),
          eq(schema.chapterReads.chapterId, row.chapterId),
        ));
    },

    async toggleFavorite(userId, category, slug) {
      const [entry] = await db
        .select({ id: schema.wikiEntries.id })
        .from(schema.wikiEntries)
        .where(and(
          eq(schema.wikiEntries.category, category),
          eq(schema.wikiEntries.slug, slug),
          eq(schema.wikiEntries.isPublished, true),
        ));

      if (!entry) return { favorited: false };

      const [existing] = await db
        .select({ id: schema.wikiFavorites.id })
        .from(schema.wikiFavorites)
        .where(and(
          eq(schema.wikiFavorites.userId, userId),
          eq(schema.wikiFavorites.wikiEntryId, entry.id),
        ));

      if (existing) {
        await db.delete(schema.wikiFavorites).where(eq(schema.wikiFavorites.id, existing.id));
        return { favorited: false };
      }

      await db.insert(schema.wikiFavorites).values({ userId, wikiEntryId: entry.id });
      return { favorited: true };
    },

    async getProgress(userId) {
      // Read chapters — join to resolve bookSlug/chapterSlug, filter published
      const reads = await db
        .select({
          bookSlug: schema.books.slug,
          chapterSlug: schema.chapters.slug,
        })
        .from(schema.chapterReads)
        .innerJoin(schema.chapters, eq(schema.chapterReads.chapterId, schema.chapters.id))
        .innerJoin(schema.books, eq(schema.chapters.bookId, schema.books.id))
        .where(and(
          eq(schema.chapterReads.userId, userId),
          isNotNull(schema.chapters.publishedAt),
        ));

      // Favorited wiki entries — filter published
      const favs = await db
        .select({
          category: schema.wikiEntries.category,
          slug: schema.wikiEntries.slug,
        })
        .from(schema.wikiFavorites)
        .innerJoin(schema.wikiEntries, eq(schema.wikiFavorites.wikiEntryId, schema.wikiEntries.id))
        .where(and(
          eq(schema.wikiFavorites.userId, userId),
          eq(schema.wikiEntries.isPublished, true),
        ));

      return {
        readChapters: reads.map((r) => `${r.bookSlug}/${r.chapterSlug}`),
        favoriteWiki: favs.map((f) => `${f.category}/${f.slug}`),
      };
    },
  };
}
```

- [ ] **Step 2: Typecheck**

```
cd backend && npm run typecheck
```

Expected: no errors.

- [ ] **Step 3: Commit**

```
git add backend/src/features/progress/service.ts
git commit -m "feat(progress): add progress service (markRead, unmarkRead, toggleFavorite, getProgress)"
```

---

## Task 4: Progress Routes + Plugin

**Files:**
- Create: `backend/src/features/progress/routes.ts`
- Create: `backend/src/features/progress/index.ts`

- [ ] **Step 1: Create routes.ts**

Create `backend/src/features/progress/routes.ts`:

```typescript
import type { FastifyInstance } from 'fastify';

export async function registerProgressRoutes(app: FastifyInstance): Promise<void> {
  app.get(
    '/api/user/progress',
    {
      preHandler: [app.requireAuth],
      config: { rateLimit: { max: 20, timeWindow: '1 minute' } },
    },
    async (request) => {
      return app.progress.getProgress(request.user!.id);
    },
  );

  app.post(
    '/api/user/chapters/:bookSlug/:chapterSlug/read',
    {
      preHandler: [app.requireAuth],
      config: { rateLimit: { max: 30, timeWindow: '1 minute' } },
    },
    async (request, reply) => {
      const { bookSlug, chapterSlug } = request.params as { bookSlug: string; chapterSlug: string };
      const result = await app.progress.markRead(request.user!.id, bookSlug, chapterSlug);
      if (!result.ok) {
        return reply.code(404).send({ error: { code: 'NOT_FOUND', message: 'Chapter not found.' } });
      }
      return reply.code(200).send({ ok: true });
    },
  );

  app.delete(
    '/api/user/chapters/:bookSlug/:chapterSlug/read',
    {
      preHandler: [app.requireAuth],
      config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
    },
    async (request, reply) => {
      const { bookSlug, chapterSlug } = request.params as { bookSlug: string; chapterSlug: string };
      await app.progress.unmarkRead(request.user!.id, bookSlug, chapterSlug);
      return reply.code(200).send({ ok: true });
    },
  );

  app.post(
    '/api/user/wiki/:category/:slug/favorite',
    {
      preHandler: [app.requireAuth],
      config: { rateLimit: { max: 20, timeWindow: '1 minute' } },
    },
    async (request) => {
      const { category, slug } = request.params as { category: string; slug: string };
      return app.progress.toggleFavorite(request.user!.id, category, slug);
    },
  );
}
```

- [ ] **Step 2: Create index.ts**

Create `backend/src/features/progress/index.ts`:

```typescript
import fp from 'fastify-plugin';
import type { FastifyInstance } from 'fastify';
import { createProgressService } from './service.js';
import type { ProgressService } from './service.js';
import { registerProgressRoutes } from './routes.js';

declare module 'fastify' {
  interface FastifyInstance {
    progress: ProgressService;
  }
}

async function progressPlugin(app: FastifyInstance) {
  app.decorate('progress', createProgressService(app.db));
  await registerProgressRoutes(app);
}

export default fp(progressPlugin, { name: 'progress', dependencies: ['permissions', 'tokens'] });
```

- [ ] **Step 3: Register rateLimit and progressPlugin in server.ts**

Open `backend/src/server.ts`. Add imports after the existing plugin imports:

```typescript
import rateLimit from '@fastify/rate-limit';
import progressPlugin from './features/progress/index.js';
```

Register `@fastify/rate-limit` once at the server level (after `adminPlugin`, before the health route), then register `progressPlugin`:

```typescript
await app.register(rateLimit, {
  global: false, // only routes with config.rateLimit are rate-limited
  keyGenerator: (request) => (request as any).user?.id ?? request.ip,
});
await app.register(progressPlugin);
```

The `global: false` option means `@fastify/rate-limit` won't automatically apply to all routes — only those with a `config.rateLimit` block. Registering it at the server level (not inside the `fp()`-wrapped progress plugin) ensures it is registered exactly once on the root app instance.

- [ ] **Step 4: Typecheck**

```
cd backend && npm run typecheck
```

Expected: no errors.

- [ ] **Step 5: Commit**

```
git add backend/src/features/progress/routes.ts backend/src/features/progress/index.ts backend/src/server.ts
git commit -m "feat(progress): add progress routes plugin and register in server"
```

---

## Task 5: Backend Tests

**Files:**
- Create: `backend/src/features/progress/routes.test.ts`

- [ ] **Step 1: Write the test file**

Create `backend/src/features/progress/routes.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import Fastify from 'fastify';
import { withRollbackDb } from '../../lib/test-db.js';
import { schema } from '../../db/schema.js';
import { createPermissionsService } from '../permissions/service.js';
import { createTokenService } from '../tokens/service.js';
import { createRequireAuth, createRequireRole } from '../permissions/middleware.js';
import { createProgressService } from './service.js';
import { registerProgressRoutes } from './routes.js';

async function setupApp(db: any) {
  const tokens   = createTokenService(db);
  const perms    = createPermissionsService(db);
  const progress = createProgressService(db);
  const app      = Fastify();
  app.decorate('db',          db);
  app.decorate('tokens',      tokens);
  app.decorate('perms',       perms);
  app.decorate('progress',    progress);
  app.decorate('auth',        { api: { getSession: async () => null } } as any);
  app.decorate('requireAuth', createRequireAuth({ app, tokens }));
  app.decorate('requireRole', (min: any) => createRequireRole(perms, min));
  await registerProgressRoutes(app);
  await app.ready();
  return { app, tokens };
}

// Helper: insert a published book + chapter, return their slugs and IDs
async function insertPublishedChapter(db: any, suffix: string) {
  const [book] = await db.insert(schema.books).values({
    slug: `book-${suffix}`, title: `Book ${suffix}`,
    isPublished: true, publishedAt: new Date(),
  }).returning();
  const [chapter] = await db.insert(schema.chapters).values({
    bookId: book.id, chapterNumber: 1, slug: `ch-${suffix}`,
    title: `Chapter ${suffix}`, publishedAt: new Date(),
  }).returning();
  return { book, chapter };
}

// Helper: insert a published wiki entry
async function insertPublishedWikiEntry(db: any, suffix: string) {
  const [entry] = await db.insert(schema.wikiEntries).values({
    category: 'characters', slug: `char-${suffix}`,
    name: `Char ${suffix}`, frontMatter: {}, body: '',
    isPublished: true,
  }).returning();
  return entry;
}

describe('progress routes', () => {
  it('GET /api/user/progress returns 401 without auth', async () => {
    await withRollbackDb(async (db) => {
      const { app } = await setupApp(db);
      const res = await app.inject({ method: 'GET', url: '/api/user/progress' });
      expect(res.statusCode).toBe(401);
    });
  });

  it('GET /api/user/progress returns empty progress for new user', async () => {
    await withRollbackDb(async (db) => {
      const userId = 'prog-empty';
      await db.insert(schema.users).values({ id: userId, email: `${userId}@x.com`, name: 'U', role: 'admin' });
      const { app, tokens } = await setupApp(db);
      const { plaintext } = await tokens.create({ userId, userRole: 'admin', name: 'tok' });

      const res = await app.inject({
        method: 'GET', url: '/api/user/progress',
        headers: { authorization: `Bearer ${plaintext}` },
      });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.readChapters).toEqual([]);
      expect(body.favoriteWiki).toEqual([]);
    });
  });

  it('POST .../read marks a chapter and appears in progress', async () => {
    await withRollbackDb(async (db) => {
      const userId = 'prog-read';
      await db.insert(schema.users).values({ id: userId, email: `${userId}@x.com`, name: 'U', role: 'admin' });
      const { book, chapter } = await insertPublishedChapter(db, 'read1');
      const { app, tokens } = await setupApp(db);
      const { plaintext } = await tokens.create({ userId, userRole: 'admin', name: 'tok' });

      const markRes = await app.inject({
        method: 'POST',
        url: `/api/user/chapters/${book.slug}/${chapter.slug}/read`,
        headers: { authorization: `Bearer ${plaintext}` },
      });
      expect(markRes.statusCode).toBe(200);

      const progRes = await app.inject({
        method: 'GET', url: '/api/user/progress',
        headers: { authorization: `Bearer ${plaintext}` },
      });
      const body = progRes.json();
      expect(body.readChapters).toContain(`${book.slug}/${chapter.slug}`);
    });
  });

  it('POST .../read is idempotent (upsert-ignore)', async () => {
    await withRollbackDb(async (db) => {
      const userId = 'prog-idem';
      await db.insert(schema.users).values({ id: userId, email: `${userId}@x.com`, name: 'U', role: 'admin' });
      const { book, chapter } = await insertPublishedChapter(db, 'idem1');
      const { app, tokens } = await setupApp(db);
      const { plaintext } = await tokens.create({ userId, userRole: 'admin', name: 'tok' });

      const url = `/api/user/chapters/${book.slug}/${chapter.slug}/read`;
      const headers = { authorization: `Bearer ${plaintext}` };
      await app.inject({ method: 'POST', url, headers });
      await app.inject({ method: 'POST', url, headers });

      const rows = await db.select().from(schema.chapterReads);
      expect(rows).toHaveLength(1);
    });
  });

  it('POST .../read returns 404 for unknown chapter slug', async () => {
    await withRollbackDb(async (db) => {
      const userId = 'prog-404';
      await db.insert(schema.users).values({ id: userId, email: `${userId}@x.com`, name: 'U', role: 'admin' });
      const { app, tokens } = await setupApp(db);
      const { plaintext } = await tokens.create({ userId, userRole: 'admin', name: 'tok' });

      const res = await app.inject({
        method: 'POST', url: '/api/user/chapters/no-book/no-chapter/read',
        headers: { authorization: `Bearer ${plaintext}` },
      });
      expect(res.statusCode).toBe(404);
    });
  });

  it('DELETE .../read unmarks a chapter', async () => {
    await withRollbackDb(async (db) => {
      const userId = 'prog-del';
      await db.insert(schema.users).values({ id: userId, email: `${userId}@x.com`, name: 'U', role: 'admin' });
      const { book, chapter } = await insertPublishedChapter(db, 'del1');
      const { app, tokens } = await setupApp(db);
      const { plaintext } = await tokens.create({ userId, userRole: 'admin', name: 'tok' });

      const headers = { authorization: `Bearer ${plaintext}` };
      await app.inject({ method: 'POST', url: `/api/user/chapters/${book.slug}/${chapter.slug}/read`, headers });
      await app.inject({ method: 'DELETE', url: `/api/user/chapters/${book.slug}/${chapter.slug}/read`, headers });

      const rows = await db.select().from(schema.chapterReads);
      expect(rows).toHaveLength(0);
    });
  });

  it('POST .../favorite toggles on then off', async () => {
    await withRollbackDb(async (db) => {
      const userId = 'prog-fav';
      await db.insert(schema.users).values({ id: userId, email: `${userId}@x.com`, name: 'U', role: 'admin' });
      const entry = await insertPublishedWikiEntry(db, 'fav1');
      const { app, tokens } = await setupApp(db);
      const { plaintext } = await tokens.create({ userId, userRole: 'admin', name: 'tok' });

      const url = `/api/user/wiki/${entry.category}/${entry.slug}/favorite`;
      const headers = { authorization: `Bearer ${plaintext}` };

      const r1 = await app.inject({ method: 'POST', url, headers });
      expect(r1.json().favorited).toBe(true);

      const r2 = await app.inject({ method: 'POST', url, headers });
      expect(r2.json().favorited).toBe(false);
    });
  });

  it('getProgress excludes unpublished chapters', async () => {
    await withRollbackDb(async (db) => {
      const userId = 'prog-unp';
      await db.insert(schema.users).values({ id: userId, email: `${userId}@x.com`, name: 'U', role: 'admin' });

      // Insert unpublished chapter (publishedAt: null)
      const [book] = await db.insert(schema.books).values({
        slug: 'book-unp', title: 'Unpub Book', isPublished: false,
      }).returning();
      const [chapter] = await db.insert(schema.chapters).values({
        bookId: book.id, chapterNumber: 1, slug: 'ch-unp', title: 'Unpub',
        // publishedAt intentionally omitted (null)
      }).returning();

      // Directly insert a read record bypassing the route
      await db.insert(schema.chapterReads).values({ userId, chapterId: chapter.id });

      const { app, tokens } = await setupApp(db);
      const { plaintext } = await tokens.create({ userId, userRole: 'admin', name: 'tok' });

      const res = await app.inject({
        method: 'GET', url: '/api/user/progress',
        headers: { authorization: `Bearer ${plaintext}` },
      });
      expect(res.json().readChapters).toHaveLength(0);
    });
  });
});
```

- [ ] **Step 2: Run tests — expect them to fail (routes not wired to rate-limit in test context)**

```
cd backend && npm test -- --reporter=verbose 2>&1 | grep -E "progress|PASS|FAIL"
```

**Note:** The tests call `registerProgressRoutes` directly without registering `@fastify/rate-limit`, so `config.rateLimit` will be ignored (Fastify ignores unknown config keys). Tests should pass. If you see errors about `rateLimit` being undefined, add a no-op mock: `app.decorate('rateLimit', () => {})`.

- [ ] **Step 3: Run full test suite — confirm no regressions**

```
cd backend && npm test
```

Expected: all pre-existing tests still pass; new progress tests pass.

- [ ] **Step 4: Commit**

```
git add backend/src/features/progress/routes.test.ts
git commit -m "test(progress): add integration tests for all progress routes"
```

---

## Task 6: Frontend — progress.js Module

**Files:**
- Create: `frontend/src/assets/js/progress.js`

- [ ] **Step 1: Create progress.js**

Create `frontend/src/assets/js/progress.js`:

```javascript
/**
 * progress.js — Reading progress + wiki favorites cache
 *
 * Mirrors the auth.js session-cache pattern.
 * Exports: isRead, isFavorited, markRead, unmarkRead, toggleFavorite
 * Side effect: fetches /api/user/progress on DOMContentLoaded if signed in.
 */

const API_BASE        = 'https://loreuniverse-api.fly.dev';
const CACHE_KEY       = 'lr-progress';
const CACHE_TTL_MS    = 5 * 60 * 1000; // 5 minutes

// ---------------------------------------------------------------------------
// Cache helpers
// ---------------------------------------------------------------------------

function getCache() {
  try {
    const raw = sessionStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const { data, ts } = JSON.parse(raw);
    if (Date.now() - ts > CACHE_TTL_MS) {
      sessionStorage.removeItem(CACHE_KEY);
      return null;
    }
    return data;
  } catch {
    return null;
  }
}

function setCache(data) {
  try {
    sessionStorage.setItem(CACHE_KEY, JSON.stringify({ data, ts: Date.now() }));
  } catch { /* quota exceeded — degrade silently */ }
}

function updateCache(fn) {
  const data = getCache() ?? { readChapters: [], favoriteWiki: [] };
  setCache(fn(data));
}

// ---------------------------------------------------------------------------
// Public read helpers (synchronous — check the local cache only)
// ---------------------------------------------------------------------------

export function isRead(bookSlug, chapterSlug) {
  const data = getCache();
  return data ? data.readChapters.includes(`${bookSlug}/${chapterSlug}`) : false;
}

export function isFavorited(category, slug) {
  const data = getCache();
  return data ? data.favoriteWiki.includes(`${category}/${slug}`) : false;
}

// ---------------------------------------------------------------------------
// Public write helpers (hit API, update cache in-place)
// ---------------------------------------------------------------------------

export async function markRead(bookSlug, chapterSlug) {
  try {
    const res = await fetch(
      `${API_BASE}/api/user/chapters/${bookSlug}/${chapterSlug}/read`,
      { method: 'POST', credentials: 'include' },
    );
    if (res.status === 401) return { ok: false, needsAuth: true };
    if (!res.ok) return { ok: false, needsAuth: false };
    updateCache((d) => {
      const key = `${bookSlug}/${chapterSlug}`;
      if (!d.readChapters.includes(key)) d.readChapters.push(key);
      return d;
    });
    return { ok: true, needsAuth: false };
  } catch {
    return { ok: false, needsAuth: false };
  }
}

export async function unmarkRead(bookSlug, chapterSlug) {
  try {
    await fetch(
      `${API_BASE}/api/user/chapters/${bookSlug}/${chapterSlug}/read`,
      { method: 'DELETE', credentials: 'include' },
    );
    updateCache((d) => {
      d.readChapters = d.readChapters.filter((k) => k !== `${bookSlug}/${chapterSlug}`);
      return d;
    });
  } catch { /* degrade silently */ }
}

export async function toggleFavorite(category, slug) {
  try {
    const res = await fetch(
      `${API_BASE}/api/user/wiki/${category}/${slug}/favorite`,
      { method: 'POST', credentials: 'include' },
    );
    if (!res.ok) return { favorited: isFavorited(category, slug) };
    const { favorited } = await res.json();
    updateCache((d) => {
      const key = `${category}/${slug}`;
      if (favorited) {
        if (!d.favoriteWiki.includes(key)) d.favoriteWiki.push(key);
      } else {
        d.favoriteWiki = d.favoriteWiki.filter((k) => k !== key);
      }
      return d;
    });
    return { favorited };
  } catch {
    return { favorited: isFavorited(category, slug) };
  }
}

// ---------------------------------------------------------------------------
// Boot: fetch progress on page load if signed in
// ---------------------------------------------------------------------------

async function loadProgress() {
  try {
    // Only fetch if auth.js already has a cached session
    const raw = sessionStorage.getItem('lr-session');
    if (!raw) return;
    const { session } = JSON.parse(raw);
    if (!session?.user) return;

    // Bail if progress cache is still fresh
    if (getCache()) return;

    const res = await fetch(`${API_BASE}/api/user/progress`, { credentials: 'include' });
    if (!res.ok) {
      setCache({ readChapters: [], favoriteWiki: [] });
      return;
    }
    setCache(await res.json());
  } catch {
    setCache({ readChapters: [], favoriteWiki: [] });
  } finally {
    // Notify other module scripts that the cache is now populated
    document.dispatchEvent(new CustomEvent('progress-ready'));
  }
}

document.addEventListener('DOMContentLoaded', loadProgress);
```

- [ ] **Step 2: Commit**

```
git add frontend/src/assets/js/progress.js
git commit -m "feat(progress): add progress.js client-side cache module"
```

---

## Task 7: Chapter Page — Read Badge + Scroll Sentinel

**Files:**
- Modify: `frontend/src/_includes/reader-layout.njk`
- Modify: `frontend/src/_includes/chapter.njk`
- Modify: `frontend/src/assets/css/reader.css`

- [ ] **Step 1: Load progress.js in reader-layout.njk**

Open `frontend/src/_includes/reader-layout.njk`. Find the line that loads `reader.js`:

```html
<script type="module" src="/assets/js/reader.js"></script>
```

Add `progress.js` immediately before it:

```html
<script type="module" src="/assets/js/auth.js"></script>
<script type="module" src="/assets/js/progress.js"></script>
<script type="module" src="/assets/js/reader.js"></script>
```

(If `auth.js` is already loaded there, just add the `progress.js` line after it.)

- [ ] **Step 2: Add read badge to chapter.njk header**

Open `frontend/src/_includes/chapter.njk`. Find the `<header class="reader-chapter-header">` block (around line 105). After the `{% if summary %}` block and before `</header>`, add:

```html
      <span class="chapter-read-badge" id="chapter-read-badge" hidden>✓ Read</span>
```

- [ ] **Step 3: Add scroll sentinel + inline script to chapter.njk**

At the very end of `chapter.njk`, after the closing `</div>` of `reader-prose-wrap` (the last line), add:

Add the sentinel div and inline script to the template:

```html
<div id="chapter-end-sentinel" style="height:1px"
  data-book-slug="book1"
  data-chapter-slug="{{ page.fileSlug }}"></div>

<script type="module">
import { isRead, markRead } from '/assets/js/progress.js';

const sentinel    = document.getElementById('chapter-end-sentinel');
const bookSlug    = sentinel.dataset.bookSlug;
const chapterSlug = sentinel.dataset.chapterSlug;
const badge       = document.getElementById('chapter-read-badge');

// Show badge from cache immediately (warm if returning visitor in same session)
if (isRead(bookSlug, chapterSlug)) badge.hidden = false;

// Re-check after progress.js finishes its initial fetch (handles first-visit-in-session)
document.addEventListener('progress-ready', () => {
  if (isRead(bookSlug, chapterSlug)) badge.hidden = false;
}, { once: true });

// Auto-mark on scroll to bottom
let marked = false;
const observer = new IntersectionObserver(async (entries) => {
  if (marked || !entries[0].isIntersecting) return;
  marked = true;
  observer.disconnect();
  const result = await markRead(bookSlug, chapterSlug);
  if (result.ok) {
    badge.hidden = false;
  } else if (result.needsAuth) {
    const p = document.createElement('p');
    p.style.cssText = 'text-align:center;font-size:0.8rem;color:var(--text-muted);margin-top:1rem';
    p.innerHTML = `<a href="/account/?redirect=${encodeURIComponent(location.pathname)}" style="color:var(--blue)">Sign in</a> to track your reading progress.`;
    sentinel.after(p);
  }
}, { threshold: 0.9 });

observer.observe(sentinel);
</script>
```

- [ ] **Step 4: Add base chapter read badge styles to site.css**

The `.chapter-read-badge` class is used both on the chapter reader page (via `reader.css`) AND on the chapter listing page (via `site.css`). Base styles must go in `site.css` so they load on both pages.

Open `frontend/src/assets/css/site.css`. Find the chapter list CSS section (search for `.chapter-list`). After the existing chapter-list rules, add:

```css
/* -----------------------------------------------------------------
   Chapter read badge (base — used on reader and chapter listing)
   ----------------------------------------------------------------- */
.chapter-read-badge {
  display: inline-flex; align-items: center; gap: 0.3rem;
  font-family: var(--font-ui); font-size: 0.68rem; font-weight: 700;
  letter-spacing: 0.1em; text-transform: uppercase;
  color: #34d399;
  background: rgba(52,211,153,0.12);
  border: 1px solid rgba(52,211,153,0.3);
  border-radius: 20px; padding: 0.2rem 0.65rem;
}
```

`reader.css` gets a small context-specific margin override appended instead:

```css
/* Chapter read badge — reader-context margin */
.chapter-read-badge { margin-top: 0.5rem; }
```

- [ ] **Step 5: Verify the chapter page builds without errors**

```
cd frontend && npm run build 2>&1 | tail -20
```

Expected: build completes with no errors.

- [ ] **Step 6: Commit**

```
git add frontend/src/_includes/reader-layout.njk frontend/src/_includes/chapter.njk frontend/src/assets/css/reader.css
git commit -m "feat(progress): add chapter read badge and scroll-to-bottom auto-mark"
```

---

## Task 8: Book Chapter Listing — Read Badges

**Files:**
- Modify: `frontend/src/lorekeeper/books/book1/chapters/index.njk`
- Modify: `frontend/src/assets/css/site.css`

- [ ] **Step 1: Add data attributes to chapter list items**

Open `frontend/src/lorekeeper/books/book1/chapters/index.njk`. Find the `<a class="chapter-list-item"` line (around line 34). Change it to:

```html
      <a class="chapter-list-item" href="{{ chapter.url }}"
        data-book-slug="book1"
        data-chapter-slug="{{ chapter.page.fileSlug }}">
```

- [ ] **Step 2: Add inline script to the chapter listing page**

At the very end of `frontend/src/lorekeeper/books/book1/chapters/index.njk`, before the closing `</div>` of `chapters-page`, add:

```html
<script type="module">
import { isRead } from '/assets/js/progress.js';

document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('.chapter-list-item[data-chapter-slug]').forEach((item) => {
    const bookSlug    = item.dataset.bookSlug;
    const chapterSlug = item.dataset.chapterSlug;
    if (isRead(bookSlug, chapterSlug)) {
      const badge = document.createElement('span');
      badge.className = 'chapter-read-badge chapter-read-badge--list';
      badge.textContent = '✓ Read';
      item.querySelector('.chapter-list-body').prepend(badge);
    }
  });
});
</script>
```

- [ ] **Step 3: Add listing-context badge modifier to site.css**

The base `.chapter-read-badge` styles were already added to `site.css` in Task 7 Step 4. Add only the listing-context modifier after those rules:

```css
.chapter-read-badge--list {
  font-size: 0.62rem;
  padding: 0.15rem 0.5rem;
  margin-bottom: 0.3rem;
}
```

- [ ] **Step 4: Build and verify**

```
cd frontend && npm run build 2>&1 | tail -10
```

Expected: no errors.

- [ ] **Step 5: Commit**

```
git add frontend/src/lorekeeper/books/book1/chapters/index.njk frontend/src/assets/css/site.css
git commit -m "feat(progress): show read badges on chapter listing page"
```

---

## Task 9: Wiki Entry Templates — Star Button

**Files:**
- Modify: `frontend/src/_includes/character.njk`
- Modify: `frontend/src/_includes/faction.njk`
- Modify: `frontend/src/_includes/location.njk`
- Modify: `frontend/src/_includes/lore-trait.njk`
- Modify: `frontend/src/_includes/lore.njk`
- Modify: `frontend/src/_includes/mechanic.njk`
- Modify: `frontend/src/_includes/wiki-entry.njk`
- Modify: `frontend/src/assets/css/site.css`

The same change applies to all 7 templates. Instructions below use `character.njk` as the example — apply identically to the other six, substituting the correct category string.

- [ ] **Step 1: Add star button to character.njk**

Open `frontend/src/_includes/character.njk`. Find the `<header class="wiki-entry__header">` block:

```html
  <header class="wiki-entry__header">
    <h1>{{ name }}</h1>
    <p class="wiki-entry__category">Character</p>
  </header>
```

Replace with:

```html
  <header class="wiki-entry__header">
    <h1>{{ name }}</h1>
    <p class="wiki-entry__category">Character</p>
    <button class="wiki-favorite-btn" id="wiki-favorite-btn"
      data-category="characters" data-slug="{{ page.fileSlug }}"
      aria-label="Favorite this entry" aria-pressed="false" type="button">★</button>
  </header>
```

At the very end of `character.njk`, after the closing `</article>`, add:

```html
<script type="module">
import { isFavorited, toggleFavorite } from '/assets/js/progress.js';

const btn      = document.getElementById('wiki-favorite-btn');
const category = btn.dataset.category;
const slug     = btn.dataset.slug;

if (isFavorited(category, slug)) {
  btn.classList.add('wiki-favorite-btn--active');
  btn.setAttribute('aria-pressed', 'true');
}

btn.addEventListener('click', async () => {
  // Logged-out check: try to get session from cache
  const raw = sessionStorage.getItem('lr-session');
  const session = raw ? JSON.parse(raw).session : null;
  if (!session?.user) {
    location.href = `/account/?redirect=${encodeURIComponent(location.pathname)}`;
    return;
  }
  const { favorited } = await toggleFavorite(category, slug);
  btn.classList.toggle('wiki-favorite-btn--active', favorited);
  btn.setAttribute('aria-pressed', favorited ? 'true' : 'false');
});
</script>
```

- [ ] **Step 2: Apply the same changes to faction.njk**

In `faction.njk`, find the header and add the star button with `data-category="factions"`.

```html
  <header class="wiki-entry__header">
    <h1>{{ name }}</h1>
    <p class="wiki-entry__category">Faction</p>
    <button class="wiki-favorite-btn" id="wiki-favorite-btn"
      data-category="factions" data-slug="{{ page.fileSlug }}"
      aria-label="Favorite this entry" aria-pressed="false" type="button">★</button>
  </header>
```

Add the same `<script type="module">` block at the end.

- [ ] **Step 3: Apply to location.njk** — `data-category="locations"`

- [ ] **Step 4: Apply to lore-trait.njk** — `data-category="lore-traits"`

- [ ] **Step 5: Apply to lore.njk** — `data-category="lore"`

- [ ] **Step 6: Apply to mechanic.njk** — `data-category="mechanics"`

- [ ] **Step 7: Apply to wiki-entry.njk (fallback)**

`wiki-entry.njk` doesn't know its category statically. Use `page.url` to derive it. In `wiki-entry.njk`, find the header and add:

```html
    <div class="wiki-entry-page-badge">Entry</div>
    <button class="wiki-favorite-btn" id="wiki-favorite-btn"
      data-category="{{ page.url | wikiCategory }}"
      data-slug="{{ page.fileSlug }}"
      aria-label="Favorite this entry" aria-pressed="false" type="button">★</button>
    <h1 class="wiki-entry-page-title">{{ name }}</h1>
```

The `wikiCategory` filter is already registered in `.eleventy.js` (it's used on the homepage fallback path). Add the same script block at the end.

- [ ] **Step 8: Add star button styles to site.css**

In `frontend/src/assets/css/site.css`, find the wiki entry styles section (search for `.wiki-entry__header`). After those rules, add:

```css
.wiki-favorite-btn {
  background: none; border: none; cursor: pointer;
  font-size: 1.4rem; line-height: 1;
  color: var(--text-muted);
  padding: 0.2rem 0.4rem; border-radius: 6px;
  transition: color var(--dur-fast), transform var(--dur-fast);
}
.wiki-favorite-btn:hover { color: var(--gold); transform: scale(1.15); }
.wiki-favorite-btn--active { color: var(--gold); }
```

- [ ] **Step 9: Build and verify**

```
cd frontend && npm run build 2>&1 | tail -10
```

Expected: no errors.

- [ ] **Step 10: Commit**

```
git add frontend/src/_includes/character.njk frontend/src/_includes/faction.njk \
  frontend/src/_includes/location.njk frontend/src/_includes/lore-trait.njk \
  frontend/src/_includes/lore.njk frontend/src/_includes/mechanic.njk \
  frontend/src/_includes/wiki-entry.njk frontend/src/assets/css/site.css
git commit -m "feat(progress): add star favorite button to all wiki entry templates"
```

---

## Task 10: Profile Page — Progress + Favorites Sections

**Files:**
- Modify: `frontend/src/account/profile/index.njk`
- Modify: `frontend/src/assets/css/site.css`

- [ ] **Step 1: Add progress and favorites sections to profile/index.njk**

Open `frontend/src/account/profile/index.njk`. The existing `<script type="module">` block ends with `})();`. After the closing `</script>` tag, add new HTML sections and a second module script:

```html
<div class="profile-progress-section" id="profile-progress-section" hidden>
  <h2 class="profile-section-heading">Reading Progress</h2>
  <p class="profile-section-sub" id="profile-progress-count"></p>
  <ul class="profile-chapter-list" id="profile-chapter-list"></ul>
  <p class="profile-empty" id="profile-progress-empty" hidden>
    Start reading to track your progress.
  </p>
</div>

<div class="profile-favorites-section" id="profile-favorites-section" hidden>
  <h2 class="profile-section-heading">Favorites</h2>
  <div class="profile-favorites-grid" id="profile-favorites-grid"></div>
  <p class="profile-empty" id="profile-favorites-empty" hidden>
    Star a wiki entry to save it here.
  </p>
</div>

<script type="module">
import { getSession } from '/assets/js/auth.js';
import { isRead, isFavorited } from '/assets/js/progress.js';

const API_BASE = 'https://loreuniverse-api.fly.dev';

(async () => {
  const session = await getSession();
  if (!session) return; // auth guard already handled by the first script

  // Fetch fresh progress (don't rely on cache — profile should be authoritative)
  let progress = { readChapters: [], favoriteWiki: [] };
  try {
    const res = await fetch(`${API_BASE}/api/user/progress`, { credentials: 'include' });
    if (res.ok) progress = await res.json();
  } catch { /* degrade silently */ }

  // Reading progress section
  const progressSection = document.getElementById('profile-progress-section');
  const chapterList     = document.getElementById('profile-chapter-list');
  const progressCount   = document.getElementById('profile-progress-count');
  const progressEmpty   = document.getElementById('profile-progress-empty');

  progressSection.hidden = false;

  if (progress.readChapters.length === 0) {
    progressEmpty.hidden = false;
  } else {
    progressCount.textContent = `${progress.readChapters.length} chapter${progress.readChapters.length !== 1 ? 's' : ''} read`;
    progress.readChapters.forEach((key) => {
      const [bookSlug, chapterSlug] = key.split('/');
      const li = document.createElement('li');
      li.className = 'profile-chapter-item';
      li.innerHTML = `<a href="/library/books/${bookSlug}/chapters/${chapterSlug}/" class="profile-chapter-link">${chapterSlug.replace(/-/g, ' ')}</a>`;
      chapterList.appendChild(li);
    });
  }

  // Favorites section
  const favSection  = document.getElementById('profile-favorites-section');
  const favGrid     = document.getElementById('profile-favorites-grid');
  const favEmpty    = document.getElementById('profile-favorites-empty');

  favSection.hidden = false;

  if (progress.favoriteWiki.length === 0) {
    favEmpty.hidden = false;
  } else {
    progress.favoriteWiki.forEach((key) => {
      const [category, slug] = key.split('/');
      const card = document.createElement('a');
      card.className = 'profile-fav-card';
      card.href = `/wiki/${category}/${slug}/`;
      card.innerHTML = `
        <span class="profile-fav-cat">${category.replace(/-/g, ' ')}</span>
        <span class="profile-fav-name">${slug.replace(/-/g, ' ')}</span>
      `;
      favGrid.appendChild(card);
    });
  }
})();
</script>
```

- [ ] **Step 2: Add profile section styles to site.css**

In `frontend/src/assets/css/site.css`, after the existing `.profile-card` styles, add:

```css
.profile-section-heading {
  font-family: var(--font-display); font-size: 1rem; font-weight: 700;
  color: var(--text-bright); letter-spacing: 0.04em;
  margin: 2.5rem 0 0.25rem;
}
.profile-section-sub {
  font-family: var(--font-ui); font-size: 0.72rem; font-weight: 600;
  letter-spacing: 0.1em; text-transform: uppercase;
  color: var(--text-muted); margin-bottom: 0.75rem;
}
.profile-chapter-list { list-style: none; padding: 0; margin: 0; }
.profile-chapter-item { margin-bottom: 0.35rem; }
.profile-chapter-link {
  font-family: var(--font-body); font-size: 0.875rem;
  color: var(--blue); text-decoration: none; text-transform: capitalize;
}
.profile-chapter-link:hover { text-decoration: underline; }
.profile-favorites-grid {
  display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
  gap: 0.75rem; margin-top: 0.5rem;
}
.profile-fav-card {
  background: var(--surface-2); border: 1px solid var(--border);
  border-radius: 8px; padding: 0.75rem 1rem;
  display: flex; flex-direction: column; gap: 0.25rem;
  text-decoration: none;
  transition: border-color var(--dur-fast), transform var(--dur-fast);
}
.profile-fav-card:hover { border-color: rgba(245,158,11,0.4); transform: translateY(-2px); }
.profile-fav-cat {
  font-family: var(--font-ui); font-size: 0.58rem; font-weight: 700;
  letter-spacing: 0.2em; text-transform: uppercase; color: var(--gold);
}
.profile-fav-name {
  font-family: var(--font-body); font-size: 0.825rem;
  color: var(--text-bright); text-transform: capitalize;
}
.profile-empty {
  font-family: var(--font-body); font-size: 0.825rem;
  color: var(--text-muted); font-style: italic;
}
```

- [ ] **Step 3: Build and verify**

```
cd frontend && npm run build 2>&1 | tail -10
```

Expected: no errors.

- [ ] **Step 4: Commit**

```
git add frontend/src/account/profile/index.njk frontend/src/assets/css/site.css
git commit -m "feat(progress): add reading progress and favorites sections to profile page"
```

---

## Task 11: Apply Migration to Production

**Files:** None (runtime operation)

- [ ] **Step 1: Confirm migration file exists**

```
ls backend/drizzle/
```

Expected: `0003_reading_progress_favorites.sql` is present alongside `0000_`, `0001_`, `0002_` files.

- [ ] **Step 2: Run migration against production**

The Fly.io `release_command` in `fly.toml` runs `drizzle-kit migrate` on every deploy. Push to `main` and the migration applies automatically. No manual step needed.

If you want to apply it manually first (before deploying):

```
cd backend && npx drizzle-kit migrate
```

This requires `DATABASE_URL` in the environment.

- [ ] **Step 3: Full test suite one final time**

```
cd backend && npm test
```

Expected: all tests pass.

- [ ] **Step 4: Final commit and push**

```
git add -A
git commit -m "feat(progress): reading progress + wiki favorites — complete implementation"
git push origin main
```
