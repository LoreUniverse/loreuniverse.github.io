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
import { registerApplicationRoutes } from './application-routes.js';

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
  await registerApplicationRoutes(app);
  await app.ready();
  return { app, tokens };
}

describe('application routes', () => {
  it('regular user submits an application', async () => {
    await withRollbackDb(async (db) => {
      const userId = 'applicant';
      await db.insert(schema.users).values({ id: userId, email: `${userId}@x.com`, name: 'U', role: 'user' });
      const { app } = await setupApp(db);
      (app as any).auth = { api: { getSession: async () => ({ user: { id: userId } }) } };

      const response = await app.inject({
        method: 'POST',
        url: '/api/account/permission-applications',
        payload: { permission: 'wiki_edit', justification: 'I have read all chapters and want to help cross-link.' },
        headers: { 'content-type': 'application/json' },
      });
      expect(response.statusCode).toBe(201);
      const body = response.json();
      expect(body.id).toBeTruthy();
      expect(body.status).toBe('pending');
    });
  });

  it('admin lists pending applications', async () => {
    await withRollbackDb(async (db) => {
      const adminId = 'admin-app-list';
      const userId = 'applicant-list';
      await db.insert(schema.users).values({ id: adminId, email: `${adminId}@x.com`, name: 'A', role: 'admin' });
      await db.insert(schema.users).values({ id: userId, email: `${userId}@x.com`, name: 'U', role: 'user' });
      await db.insert(schema.permissionApplications).values({ userId, permission: 'wiki_edit', justification: 'because' });

      const { app, tokens } = await setupApp(db);
      const { plaintext } = await tokens.create({ userId: adminId, userRole: 'admin', name: 'list' });
      const response = await app.inject({
        method: 'GET',
        url: '/api/admin/permission-applications',
        headers: { authorization: `Bearer ${plaintext}` },
      });
      expect(response.statusCode).toBe(200);
      const list = response.json();
      expect(list.length).toBeGreaterThanOrEqual(1);
      expect(list.every((a: any) => a.status === 'pending')).toBe(true);
    });
  });

  it('admin approves an application; permission gets granted automatically', async () => {
    await withRollbackDb(async (db) => {
      const adminId = 'admin-app-approve';
      const userId = 'applicant-approve';
      await db.insert(schema.users).values({ id: adminId, email: `${adminId}@x.com`, name: 'A', role: 'admin' });
      await db.insert(schema.users).values({ id: userId, email: `${userId}@x.com`, name: 'U', role: 'user' });
      const [app1] = await db.insert(schema.permissionApplications)
        .values({ userId, permission: 'wiki_edit', justification: 'because' })
        .returning();

      const { app, tokens } = await setupApp(db);
      const { plaintext } = await tokens.create({ userId: adminId, userRole: 'admin', name: 'approve' });
      const response = await app.inject({
        method: 'POST',
        url: `/api/admin/permission-applications/${app1.id}/approve`,
        headers: { authorization: `Bearer ${plaintext}`, 'content-type': 'application/json' },
        payload: { note: 'looks good' },
      });
      expect(response.statusCode).toBe(204);

      const perms = createPermissionsService(db);
      expect(await perms.hasPermission(userId, 'wiki_edit')).toBe(true);

      const [updated] = await db.select().from(schema.permissionApplications).where(eq(schema.permissionApplications.id, app1.id));
      expect(updated.status).toBe('approved');
      expect(updated.reviewedBy).toBe(adminId);
    });
  });

  it('admin rejects an application; no permission granted', async () => {
    await withRollbackDb(async (db) => {
      const adminId = 'admin-app-reject';
      const userId = 'applicant-reject';
      await db.insert(schema.users).values({ id: adminId, email: `${adminId}@x.com`, name: 'A', role: 'admin' });
      await db.insert(schema.users).values({ id: userId, email: `${userId}@x.com`, name: 'U', role: 'user' });
      const [app1] = await db.insert(schema.permissionApplications)
        .values({ userId, permission: 'wiki_edit', justification: 'because' })
        .returning();

      const { app, tokens } = await setupApp(db);
      const { plaintext } = await tokens.create({ userId: adminId, userRole: 'admin', name: 'reject' });
      const response = await app.inject({
        method: 'POST',
        url: `/api/admin/permission-applications/${app1.id}/reject`,
        headers: { authorization: `Bearer ${plaintext}`, 'content-type': 'application/json' },
        payload: { note: 'not yet' },
      });
      expect(response.statusCode).toBe(204);

      const perms = createPermissionsService(db);
      expect(await perms.hasPermission(userId, 'wiki_edit')).toBe(false);

      const [updated] = await db.select().from(schema.permissionApplications).where(eq(schema.permissionApplications.id, app1.id));
      expect(updated.status).toBe('rejected');
    });
  });
});
