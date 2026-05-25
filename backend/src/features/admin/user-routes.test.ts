import { describe, it, expect } from 'vitest';
import Fastify from 'fastify';
import { withRollbackDb } from '../../lib/test-db.js';
import { schema } from '../../db/schema.js';
import { createPermissionsService } from '../permissions/service.js';
import { createTokenService } from '../tokens/service.js';
import { createAuditService } from '../audit/service.js';
import { createRequireAuth, createRequireRole } from '../permissions/middleware.js';
import { registerAdminUserRoutes } from './user-routes.js';

async function setupApp(db: any) {
  const tokens = createTokenService(db);
  const perms  = createPermissionsService(db);
  const audit  = createAuditService(db);
  const app    = Fastify();
  app.decorate('db',     db);
  app.decorate('tokens', tokens);
  app.decorate('perms',  perms);
  app.decorate('audit',  audit);
  app.decorate('auth',   { api: { getSession: async () => null } } as any);
  app.decorate('requireAuth', createRequireAuth({ app, tokens }));
  app.decorate('requireRole', (min: any) => createRequireRole(perms, min));
  await registerAdminUserRoutes(app);
  await app.ready();
  return { app, tokens };
}

describe('admin user routes', () => {
  it('returns 401 without auth', async () => {
    await withRollbackDb(async (db) => {
      const { app } = await setupApp(db);
      const res = await app.inject({ method: 'GET', url: '/api/admin/users' });
      expect(res.statusCode).toBe(401);
    });
  });

  it('returns 403 for non-admin', async () => {
    await withRollbackDb(async (db) => {
      const id = 'regular-user-list';
      await db.insert(schema.users).values({ id, email: `${id}@x.com`, name: 'R', role: 'user' });
      const { app, tokens } = await setupApp(db);
      const { plaintext } = await tokens.create({ userId: id, userRole: 'user', name: 'tok' });
      const res = await app.inject({
        method: 'GET', url: '/api/admin/users',
        headers: { authorization: `Bearer ${plaintext}` },
      });
      expect(res.statusCode).toBe(403);
    });
  });

  it('returns paginated user list for admin', async () => {
    await withRollbackDb(async (db) => {
      const adminId = 'admin-user-list';
      await db.insert(schema.users).values([
        { id: adminId, email: `${adminId}@x.com`, name: 'Admin', role: 'admin' },
        { id: 'user-a', email: 'a@x.com', name: 'Alice', role: 'user' },
        { id: 'user-b', email: 'b@x.com', name: 'Bob',   role: 'user' },
      ]);
      const { app, tokens } = await setupApp(db);
      const { plaintext } = await tokens.create({ userId: adminId, userRole: 'admin', name: 'tok' });

      const res = await app.inject({
        method: 'GET', url: '/api/admin/users?page=1&limit=50',
        headers: { authorization: `Bearer ${plaintext}` },
      });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.total).toBe(3);
      expect(body.users).toHaveLength(3);
      expect(body.users[0]).toHaveProperty('email');
      expect(body.users[0]).not.toHaveProperty('password');
    });
  });

  it('respects pagination parameters', async () => {
    await withRollbackDb(async (db) => {
      const adminId = 'admin-paginate';
      await db.insert(schema.users).values([
        { id: adminId, email: `${adminId}@x.com`, name: 'Admin', role: 'admin' },
        { id: 'u1', email: 'u1@x.com', name: 'U1', role: 'user' },
        { id: 'u2', email: 'u2@x.com', name: 'U2', role: 'user' },
      ]);
      const { app, tokens } = await setupApp(db);
      const { plaintext } = await tokens.create({ userId: adminId, userRole: 'admin', name: 'tok' });

      const res = await app.inject({
        method: 'GET', url: '/api/admin/users?page=2&limit=2',
        headers: { authorization: `Bearer ${plaintext}` },
      });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.total).toBe(3);
      expect(body.users).toHaveLength(1);
      expect(body.page).toBe(2);
    });
  });
});
