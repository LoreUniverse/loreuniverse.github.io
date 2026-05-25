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
      const { app } = await setupApp(db);
      (app as any).auth = { api: { getSession: async () => ({ user: { id } }) } };

      const res = await app.inject({ method: 'GET', url: '/api/admin/users' });
      expect(res.statusCode).toBe(403);
    });
  });

  it('returns user list with correct shape for admin', async () => {
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
      // total reflects all committed users in DB (other test files may contribute rows);
      // verify our three specific users are present and shape is correct.
      expect(body.total).toBeGreaterThanOrEqual(3);
      expect(body.users.some((u: any) => u.id === adminId)).toBe(true);
      expect(body.users.some((u: any) => u.id === 'user-a')).toBe(true);
      expect(body.users[0]).toHaveProperty('email');
      expect(body.users[0]).not.toHaveProperty('password');
    });
  });

  it('enforces limit parameter', async () => {
    await withRollbackDb(async (db) => {
      const adminId = 'admin-paginate';
      await db.insert(schema.users).values([
        { id: adminId, email: `${adminId}@x.com`, name: 'Admin', role: 'admin' },
        { id: 'u1-pag', email: 'u1p@x.com', name: 'U1', role: 'user' },
        { id: 'u2-pag', email: 'u2p@x.com', name: 'U2', role: 'user' },
      ]);
      const { app, tokens } = await setupApp(db);
      const { plaintext } = await tokens.create({ userId: adminId, userRole: 'admin', name: 'tok' });

      const res = await app.inject({
        method: 'GET', url: '/api/admin/users?page=1&limit=1',
        headers: { authorization: `Bearer ${plaintext}` },
      });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      // limit=1 must return exactly 1 user regardless of total
      expect(body.users).toHaveLength(1);
      expect(body.limit).toBe(1);
      expect(body.page).toBe(1);
    });
  });
});
