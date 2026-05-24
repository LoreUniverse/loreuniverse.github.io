import 'dotenv/config';
import { describe, it, expect, afterAll } from 'vitest';
import Fastify from 'fastify';
import { eq } from 'drizzle-orm';
import { withRollbackDb, closeTestDb } from '../../lib/test-db.js';
import { schema } from '../../db/schema.js';
import { createPermissionsService } from './service.js';
import { createTokenService } from '../tokens/service.js';
import { createAuditService } from '../audit/service.js';
import { createRequireAuth, createRequireRole } from './middleware.js';
import { registerBanRoutes } from './ban-routes.js';

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
  await registerBanRoutes(app);
  await app.ready();
  return { app, tokens };
}

describe('ban routes', () => {
  it('admin bans a user; banned user gets isBanned=true with reason', async () => {
    await withRollbackDb(async (db) => {
      const adminId = 'admin-ban';
      const targetId = 'target-ban';
      await db.insert(schema.users).values({ id: adminId, email: `${adminId}@x.com`, name: 'A', role: 'admin' });
      await db.insert(schema.users).values({ id: targetId, email: `${targetId}@x.com`, name: 'T', role: 'user' });

      const { app, tokens } = await setupApp(db);
      const { plaintext } = await tokens.create({ userId: adminId, userRole: 'admin', name: 'ban-test' });

      const response = await app.inject({
        method: 'POST',
        url: `/api/admin/users/${targetId}/ban`,
        headers: { authorization: `Bearer ${plaintext}`, 'content-type': 'application/json' },
        payload: { reason: 'spam' },
      });
      expect(response.statusCode).toBe(204);

      const [target] = await db.select().from(schema.users).where(eq(schema.users.id, targetId));
      expect(target.isBanned).toBe(true);
      expect(target.bannedReason).toBe('spam');
      expect(target.bannedAt).toBeTruthy();
    });
  });

  it('moderator cannot ban (only admin)', async () => {
    await withRollbackDb(async (db) => {
      const modId = 'mod-ban-test';
      const targetId = 'target-mod-test';
      await db.insert(schema.users).values({ id: modId, email: `${modId}@x.com`, name: 'M', role: 'moderator' });
      await db.insert(schema.users).values({ id: targetId, email: `${targetId}@x.com`, name: 'T', role: 'user' });
      const { app, tokens } = await setupApp(db);
      const { plaintext } = await tokens.create({ userId: modId, userRole: 'moderator', name: 'mod-token' });

      const response = await app.inject({
        method: 'POST',
        url: `/api/admin/users/${targetId}/ban`,
        headers: { authorization: `Bearer ${plaintext}`, 'content-type': 'application/json' },
        payload: { reason: 'no' },
      });
      expect(response.statusCode).toBe(403);
    });
  });

  it('admin unbans a previously banned user', async () => {
    await withRollbackDb(async (db) => {
      const adminId = 'admin-unban';
      const targetId = 'target-unban';
      await db.insert(schema.users).values({ id: adminId, email: `${adminId}@x.com`, name: 'A', role: 'admin' });
      await db.insert(schema.users).values({
        id: targetId, email: `${targetId}@x.com`, name: 'T', role: 'user',
        isBanned: true, bannedAt: new Date(), bannedReason: 'old',
      });

      const { app, tokens } = await setupApp(db);
      const { plaintext } = await tokens.create({ userId: adminId, userRole: 'admin', name: 'unban-test' });

      const response = await app.inject({
        method: 'POST',
        url: `/api/admin/users/${targetId}/unban`,
        headers: { authorization: `Bearer ${plaintext}` },
      });
      expect(response.statusCode).toBe(204);

      const [target] = await db.select().from(schema.users).where(eq(schema.users.id, targetId));
      expect(target.isBanned).toBe(false);
      expect(target.bannedReason).toBeNull();
    });
  });
});
