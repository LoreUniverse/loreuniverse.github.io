import 'dotenv/config';
import { describe, it, expect, afterAll } from 'vitest';
import Fastify from 'fastify';
import { withRollbackDb, closeTestDb } from '../../lib/test-db.js';
import { schema } from '../../db/schema.js';
import { createPermissionsService } from './service.js';
import { createTokenService } from '../tokens/service.js';
import { createAuditService } from '../audit/service.js';
import { createRequireAuth, createRequireRole } from './middleware.js';
import { registerGrantRoutes } from './grant-routes.js';

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
  await registerGrantRoutes(app);
  await app.ready();
  return { app, tokens };
}

describe('grant routes', () => {
  it('admin grants wiki_edit; target user now hasPermission', async () => {
    await withRollbackDb(async (db) => {
      const adminId = 'admin-grant';
      const targetId = 'target-grant';
      await db.insert(schema.users).values({ id: adminId, email: `${adminId}@x.com`, name: 'A', role: 'admin' });
      await db.insert(schema.users).values({ id: targetId, email: `${targetId}@x.com`, name: 'T', role: 'user' });
      const { app, tokens } = await setupApp(db);
      const { plaintext } = await tokens.create({ userId: adminId, userRole: 'admin', name: 'grant' });

      const response = await app.inject({
        method: 'POST',
        url: `/api/admin/users/${targetId}/permissions`,
        headers: { authorization: `Bearer ${plaintext}`, 'content-type': 'application/json' },
        payload: { permission: 'wiki_edit' },
      });
      expect(response.statusCode).toBe(204);

      const perms = createPermissionsService(db);
      expect(await perms.hasPermission(targetId, 'wiki_edit')).toBe(true);
    });
  });

  it('admin revokes wiki_edit; permission removed', async () => {
    await withRollbackDb(async (db) => {
      const adminId = 'admin-revoke';
      const targetId = 'target-revoke';
      await db.insert(schema.users).values({ id: adminId, email: `${adminId}@x.com`, name: 'A', role: 'admin' });
      await db.insert(schema.users).values({ id: targetId, email: `${targetId}@x.com`, name: 'T', role: 'user' });
      await db.insert(schema.userPermissions).values({ userId: targetId, permission: 'wiki_edit', grantedBy: adminId });

      const { app, tokens } = await setupApp(db);
      const { plaintext } = await tokens.create({ userId: adminId, userRole: 'admin', name: 'revoke' });

      const response = await app.inject({
        method: 'DELETE',
        url: `/api/admin/users/${targetId}/permissions/wiki_edit`,
        headers: { authorization: `Bearer ${plaintext}` },
      });
      expect(response.statusCode).toBe(204);

      const perms = createPermissionsService(db);
      expect(await perms.hasPermission(targetId, 'wiki_edit')).toBe(false);
    });
  });

  it('moderator cannot grant permissions', async () => {
    await withRollbackDb(async (db) => {
      const modId = 'mod-grant';
      const targetId = 'target-mod-grant';
      await db.insert(schema.users).values({ id: modId, email: `${modId}@x.com`, name: 'M', role: 'moderator' });
      await db.insert(schema.users).values({ id: targetId, email: `${targetId}@x.com`, name: 'T', role: 'user' });

      const { app, tokens } = await setupApp(db);
      const { plaintext } = await tokens.create({ userId: modId, userRole: 'moderator', name: 'mod' });

      const response = await app.inject({
        method: 'POST',
        url: `/api/admin/users/${targetId}/permissions`,
        headers: { authorization: `Bearer ${plaintext}`, 'content-type': 'application/json' },
        payload: { permission: 'wiki_edit' },
      });
      expect(response.statusCode).toBe(403);
    });
  });
});
