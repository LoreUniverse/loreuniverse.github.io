import { describe, it, expect } from 'vitest';
import Fastify from 'fastify';
import { withRollbackDb } from '../../lib/test-db.js';
import { schema } from '../../db/schema.js';
import { createPermissionsService } from '../permissions/service.js';
import { createTokenService } from '../tokens/service.js';
import { createAuditService } from '../audit/service.js';
import { createRequireAuth, createRequireRole } from '../permissions/middleware.js';
import { registerWikiRoutes } from './routes.js';

async function setupApp(db: any, dispatch: any = { triggerEvent: async () => {} }) {
  const tokens = createTokenService(db);
  const perms = createPermissionsService(db);
  const audit = createAuditService(db);
  const app = Fastify();
  app.decorate('db', db);
  app.decorate('tokens', tokens);
  app.decorate('perms', perms);
  app.decorate('audit', audit);
  app.decorate('dispatch', dispatch);
  app.decorate('auth', { api: { getSession: async () => null } } as any);
  app.decorate('requireAuth', createRequireAuth({ app, tokens }));
  app.decorate('requireRole', (m: any) => createRequireRole(perms, m));
  app.decorate('requirePermission', (p: string) => async (request: any, reply: any) => {});
  await registerWikiRoutes(app);
  await app.ready();
  return { app, tokens };
}

describe('wiki routes', () => {
  it('GET /api/wiki/all returns published wiki entries (empty initially)', async () => {
    await withRollbackDb(async (db) => {
      const { app } = await setupApp(db);
      const response = await app.inject({ method: 'GET', url: '/api/wiki/all' });
      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual([]);
    });
  });

  it('GET /api/wiki/all returns inserted entries', async () => {
    await withRollbackDb(async (db) => {
      await db.insert(schema.wikiEntries).values({
        category: 'characters', slug: 'aldren', name: 'Aldren',
        frontMatter: { status: 'alive', species: 'human' }, body: 'A character.',
      });
      const { app } = await setupApp(db);
      const response = await app.inject({ method: 'GET', url: '/api/wiki/all' });
      expect(response.statusCode).toBe(200);
      const list = response.json();
      expect(list).toHaveLength(1);
      expect(list[0].slug).toBe('aldren');
    });
  });

  it('GET /api/wiki/:category/:slug returns the entry', async () => {
    await withRollbackDb(async (db) => {
      await db.insert(schema.wikiEntries).values({
        category: 'characters', slug: 'aldren', name: 'Aldren',
        frontMatter: { status: 'alive' }, body: 'Body.',
      });
      const { app } = await setupApp(db);
      const response = await app.inject({ method: 'GET', url: '/api/wiki/characters/aldren' });
      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.name).toBe('Aldren');
      expect(body.body).toBe('Body.');
    });
  });

  it('admin upsert creates a new entry + writes revision + triggers dispatch', async () => {
    await withRollbackDb(async (db) => {
      const adminId = 'admin-wiki';
      await db.insert(schema.users).values({ id: adminId, email: `${adminId}@x.com`, name: 'A', role: 'admin' });
      const dispatches: any[] = [];
      const dispatch = { triggerEvent: async (e: any) => { dispatches.push(e); } };
      const { app, tokens } = await setupApp(db, dispatch);
      const { plaintext } = await tokens.create({ userId: adminId, userRole: 'admin', name: 'wiki' });

      const response = await app.inject({
        method: 'PUT',
        url: '/api/admin/wiki/characters/aldren',
        headers: { authorization: `Bearer ${plaintext}`, 'content-type': 'application/json' },
        payload: { name: 'Aldren', frontMatter: { status: 'alive' }, body: 'Body.', editSummary: 'initial' },
      });
      expect(response.statusCode).toBe(200);

      const [entry] = await db.select().from(schema.wikiEntries);
      expect(entry.slug).toBe('aldren');

      const revisions = await db.select().from(schema.wikiRevisions);
      expect(revisions).toHaveLength(1);

      expect(dispatches).toHaveLength(1);
      expect(dispatches[0].eventType).toBe('wiki-content-changed');
    });
  });
});
