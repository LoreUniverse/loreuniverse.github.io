import { describe, it, expect } from 'vitest';
import Fastify from 'fastify';
import { withRollbackDb } from '../../lib/test-db.js';
import { schema } from '../../db/schema.js';
import { createPermissionsService } from '../permissions/service.js';
import { createTokenService } from '../tokens/service.js';
import { createAuditService } from '../audit/service.js';
import { createRequireAuth, createRequireRole } from '../permissions/middleware.js';
import { registerAutolinkRoutes } from './autolink-routes.js';
import { FakeClaudeClient } from '../../lib/external/claude.js';

async function setupApp(db: any, claude: any) {
  const tokens = createTokenService(db);
  const perms = createPermissionsService(db);
  const audit = createAuditService(db);
  const app = Fastify();
  app.decorate('db', db);
  app.decorate('tokens', tokens);
  app.decorate('perms', perms);
  app.decorate('audit', audit);
  app.decorate('claude', claude);
  app.decorate('auth', { api: { getSession: async () => null } } as any);
  app.decorate('requireAuth', createRequireAuth({ app, tokens }));
  app.decorate('requireRole', (m: any) => createRequireRole(perms, m));
  await registerAutolinkRoutes(app);
  await app.ready();
  return { app, tokens };
}

describe('autolink route', () => {
  it('admin with token gets annotated text + Claude is called with wiki index', async () => {
    await withRollbackDb(async (db) => {
      const adminId = 'admin-autolink';
      await db.insert(schema.users).values({ id: adminId, email: `${adminId}@x.com`, name: 'A', role: 'admin' });
      await db.insert(schema.wikiEntries).values({
        category: 'characters', slug: 'aldren', name: 'Aldren',
        frontMatter: {}, body: '',
      });

      const claude = new FakeClaudeClient({ annotatedText: '{characters|aldren|Aldren} walked.' });
      const { app, tokens } = await setupApp(db, claude);
      const { plaintext } = await tokens.create({ userId: adminId, userRole: 'admin', name: 'autolink' });

      const response = await app.inject({
        method: 'POST',
        url: '/api/admin/autolink',
        headers: { authorization: `Bearer ${plaintext}`, 'content-type': 'application/json' },
        payload: { chapterText: 'Aldren walked.', policy: 'first-mention-per-chapter' },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.annotatedText).toBe('{characters|aldren|Aldren} walked.');
      expect(claude.calls).toHaveLength(1);
      expect(claude.calls[0].wikiIndex[0].slug).toBe('aldren');
    });
  });

  it('non-admin role is rejected', async () => {
    await withRollbackDb(async (db) => {
      const modId = 'mod-autolink';
      await db.insert(schema.users).values({ id: modId, email: `${modId}@x.com`, name: 'M', role: 'moderator' });
      const claude = new FakeClaudeClient({ annotatedText: 'x' });
      const { app, tokens } = await setupApp(db, claude);
      const { plaintext } = await tokens.create({ userId: modId, userRole: 'moderator', name: 'mod' });

      const response = await app.inject({
        method: 'POST',
        url: '/api/admin/autolink',
        headers: { authorization: `Bearer ${plaintext}`, 'content-type': 'application/json' },
        payload: { chapterText: 'x', policy: 'every-mention' },
      });
      expect(response.statusCode).toBe(403);
    });
  });
});
