import { describe, it, expect } from 'vitest';
import Fastify from 'fastify';
import { withRollbackDb } from '../../lib/test-db.js';
import { schema } from '../../db/schema.js';
import { createPermissionsService } from '../permissions/service.js';
import { createTokenService } from '../tokens/service.js';
import { createAuditService } from '../audit/service.js';
import { createRequireAuth, createRequireRole } from '../permissions/middleware.js';
import { registerAdminAuditRoutes } from './audit-routes.js';

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
  await registerAdminAuditRoutes(app);
  await app.ready();
  return { app, tokens };
}

describe('admin audit routes', () => {
  it('returns 401 without auth', async () => {
    await withRollbackDb(async (db) => {
      const { app } = await setupApp(db);
      const res = await app.inject({ method: 'GET', url: '/api/admin/audit' });
      expect(res.statusCode).toBe(401);
    });
  });

  it('returns 403 for non-admin', async () => {
    await withRollbackDb(async (db) => {
      const id = 'regular-audit';
      await db.insert(schema.users).values({ id, email: `${id}@x.com`, name: 'R', role: 'user' });
      const { app, tokens } = await setupApp(db);
      const { plaintext } = await tokens.create({ userId: id, userRole: 'user', name: 'tok' });
      const res = await app.inject({
        method: 'GET', url: '/api/admin/audit',
        headers: { authorization: `Bearer ${plaintext}` },
      });
      expect(res.statusCode).toBe(403);
    });
  });

  it('returns paginated audit entries newest-first', async () => {
    await withRollbackDb(async (db) => {
      const adminId = 'admin-audit-read';
      await db.insert(schema.users).values({ id: adminId, email: `${adminId}@x.com`, name: 'A', role: 'admin' });
      await db.insert(schema.auditLog).values([
        { actorUserId: adminId, action: 'wiki.edit',    targetType: 'wiki_entry', targetId: 'e1' },
        { actorUserId: adminId, action: 'site.rebuild.manual' },
      ]);
      const { app, tokens } = await setupApp(db);
      const { plaintext } = await tokens.create({ userId: adminId, userRole: 'admin', name: 'tok' });

      const res = await app.inject({
        method: 'GET', url: '/api/admin/audit',
        headers: { authorization: `Bearer ${plaintext}` },
      });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.total).toBe(2);
      expect(body.entries).toHaveLength(2);
      expect(body.entries[0]).toHaveProperty('action');
    });
  });

  it('respects pagination parameters', async () => {
    await withRollbackDb(async (db) => {
      const adminId = 'admin-audit-page';
      await db.insert(schema.users).values({ id: adminId, email: `${adminId}@x.com`, name: 'A', role: 'admin' });
      await db.insert(schema.auditLog).values([
        { actorUserId: adminId, action: 'action.one' },
        { actorUserId: adminId, action: 'action.two' },
        { actorUserId: adminId, action: 'action.three' },
      ]);
      const { app, tokens } = await setupApp(db);
      const { plaintext } = await tokens.create({ userId: adminId, userRole: 'admin', name: 'tok' });

      const res = await app.inject({
        method: 'GET', url: '/api/admin/audit?page=2&limit=2',
        headers: { authorization: `Bearer ${plaintext}` },
      });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.total).toBe(3);
      expect(body.entries).toHaveLength(1);
    });
  });
});
