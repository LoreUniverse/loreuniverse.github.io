import 'dotenv/config';
import { describe, it, expect, afterAll } from 'vitest';
import Fastify from 'fastify';
import { withRollbackDb, closeTestDb } from '../../lib/test-db.js';
import { schema } from '../../db/schema.js';
import { createPermissionsService } from '../permissions/service.js';
import { createTokenService } from './service.js';
import { createAuditService } from '../audit/service.js';
import { createRequireAuth, createRequireRole } from '../permissions/middleware.js';
import { registerTokenRoutes } from './routes.js';

afterAll(async () => { await closeTestDb(); });

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

  await registerTokenRoutes(app);
  await app.ready();
  return app;
}

describe('token routes', () => {
  it('admin user can create a token; plaintext shown once', async () => {
    await withRollbackDb(async (db) => {
      const id = 'admin-routes';
      await db.insert(schema.users).values({ id, email: `${id}@example.com`, name: 'A', role: 'admin' });
      const app = await setupApp(db);
      const bootstrapToken = await createTokenService(db).create({ userId: id, userRole: 'admin', name: 'bootstrap' });

      const response = await app.inject({
        method: 'POST',
        url: '/api/account/api-tokens',
        headers: { authorization: `Bearer ${bootstrapToken.plaintext}`, 'content-type': 'application/json' },
        payload: { name: 'second-token' },
      });
      expect(response.statusCode).toBe(201);
      const body = response.json();
      expect(body.plaintext.startsWith('lore_admin_')).toBe(true);
      expect(body.token.name).toBe('second-token');
    });
  });

  it('regular user cannot create a token', async () => {
    await withRollbackDb(async (db) => {
      const id = 'regular-routes';
      await db.insert(schema.users).values({ id, email: `${id}@example.com`, name: 'R', role: 'user' });
      const app = await setupApp(db);
      (app as any).auth = { api: { getSession: async () => ({ user: { id } }) } };

      const response = await app.inject({
        method: 'POST',
        url: '/api/account/api-tokens',
        payload: { name: 'no-no' },
        headers: { 'content-type': 'application/json' },
      });
      expect(response.statusCode).toBe(403);
    });
  });

  it('admin can list their tokens', async () => {
    await withRollbackDb(async (db) => {
      const id = 'list-test';
      await db.insert(schema.users).values({ id, email: `${id}@example.com`, name: 'L', role: 'admin' });
      const svc = createTokenService(db);
      const { plaintext } = await svc.create({ userId: id, userRole: 'admin', name: 't1' });
      await svc.create({ userId: id, userRole: 'admin', name: 't2' });

      const app = await setupApp(db);
      const response = await app.inject({
        method: 'GET',
        url: '/api/account/api-tokens',
        headers: { authorization: `Bearer ${plaintext}` },
      });
      expect(response.statusCode).toBe(200);
      const list = response.json();
      expect(list.length).toBe(2);
      for (const t of list) {
        expect(t).not.toHaveProperty('plaintext');
        expect(typeof t.tokenPreview).toBe('string');
      }
    });
  });

  it('admin can revoke their own token', async () => {
    await withRollbackDb(async (db) => {
      const id = 'revoke-test';
      await db.insert(schema.users).values({ id, email: `${id}@example.com`, name: 'V', role: 'admin' });
      const svc = createTokenService(db);
      const { plaintext, record } = await svc.create({ userId: id, userRole: 'admin', name: 'r1' });

      const app = await setupApp(db);
      const response = await app.inject({
        method: 'DELETE',
        url: `/api/account/api-tokens/${record.id}`,
        headers: { authorization: `Bearer ${plaintext}` },
      });
      expect(response.statusCode).toBe(204);

      const stillValid = await svc.validate(plaintext);
      expect(stillValid).toBeNull();
    });
  });
});
