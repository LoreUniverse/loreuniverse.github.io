import { describe, it, expect } from 'vitest';
import Fastify from 'fastify';
import { withRollbackDb } from '../../lib/test-db.js';
import { schema } from '../../db/schema.js';
import { createPermissionsService } from '../permissions/service.js';
import { createTokenService } from '../tokens/service.js';
import { createAuditService } from '../audit/service.js';
import { createRequireAuth, createRequireRole } from '../permissions/middleware.js';
import { registerSiteRebuildRoutes } from './site-rebuild-routes.js';
import { FakeGitHubDispatchClient } from '../../lib/external/github-dispatch.js';

async function setupApp(db: any, dispatch: any) {
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
  await registerSiteRebuildRoutes(app);
  await app.ready();
  return { app, tokens };
}

describe('site-rebuild route', () => {
  it('admin triggers a rebuild dispatch', async () => {
    await withRollbackDb(async (db) => {
      const adminId = 'admin-rebuild';
      await db.insert(schema.users).values({ id: adminId, email: `${adminId}@x.com`, name: 'A', role: 'admin' });
      const dispatch = new FakeGitHubDispatchClient();
      const { app, tokens } = await setupApp(db, dispatch);
      const { plaintext } = await tokens.create({ userId: adminId, userRole: 'admin', name: 'rebuild' });

      const response = await app.inject({
        method: 'POST',
        url: '/api/admin/site-rebuild',
        headers: { authorization: `Bearer ${plaintext}` },
      });
      expect(response.statusCode).toBe(204);
      expect(dispatch.events).toHaveLength(1);
      expect(dispatch.events[0].eventType).toBe('wiki-content-changed');
      expect((dispatch.events[0].clientPayload as any).reason).toBe('manual');
    });
  });
});
