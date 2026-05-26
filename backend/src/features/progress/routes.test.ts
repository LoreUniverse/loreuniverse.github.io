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
      expect(progRes.json().readChapters).toContain(`${book.slug}/${chapter.slug}`);
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

      const [book] = await db.insert(schema.books).values({
        slug: 'book-unp', title: 'Unpub Book', isPublished: false,
      }).returning();
      const [chapter] = await db.insert(schema.chapters).values({
        bookId: book.id, chapterNumber: 1, slug: 'ch-unp', title: 'Unpub',
        // publishedAt intentionally omitted (null)
      }).returning();

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
