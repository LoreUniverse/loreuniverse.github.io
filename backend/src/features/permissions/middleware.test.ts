import 'dotenv/config';
import { describe, it, expect, afterAll } from 'vitest';
import Fastify from 'fastify';
import argon2 from 'argon2';
import { withRollbackDb, closeTestDb } from '../../lib/test-db.js';
import { schema } from '../../db/schema.js';
import { createPermissionsService } from './service.js';
import { createTokenService } from '../tokens/service.js';
import { createRequireAuth, createRequireRole } from './middleware.js';

afterAll(async () => { await closeTestDb(); });

describe('middleware integration', () => {
  it('Bearer token resolves to user and passes requireRole(admin)', async () => {
    await withRollbackDb(async (db) => {
      const userId = 'admin-mw-test';
      await db.insert(schema.users).values({
        id: userId, email: `${userId}@example.com`, name: 'A', role: 'admin',
      });
      const tokens = createTokenService(db);
      const { plaintext } = await tokens.create({ userId, userRole: 'admin', name: 'mw-test' });

      const perms = createPermissionsService(db);
      const app = Fastify();
      app.decorate('db', db as any);
      app.decorate('auth', { api: { getSession: async () => null } } as any);
      app.get(
        '/admin-only',
        { preHandler: [createRequireAuth({ app, tokens }), createRequireRole(perms, 'admin')] },
        async (req) => ({ user: req.user })
      );
      await app.ready();

      const response = await app.inject({
        method: 'GET',
        url: '/admin-only',
        headers: { authorization: `Bearer ${plaintext}` },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.user.id).toBe(userId);
      expect(body.user.role).toBe('admin');
      expect(body.user.authVia).toBe('token');
    });
  });

  it('rejects requireRole(admin) for a regular user', async () => {
    await withRollbackDb(async (db) => {
      const userId = 'user-mw-test';
      await db.insert(schema.users).values({
        id: userId, email: `${userId}@example.com`, name: 'U', role: 'user',
      });
      const perms = createPermissionsService(db);
      const tokens = createTokenService(db);
      const app = Fastify();
      app.decorate('db', db as any);
      app.decorate('auth', { api: { getSession: async () => ({ user: { id: userId } }) } } as any);
      app.get('/admin-only', { preHandler: [createRequireAuth({ app, tokens }), createRequireRole(perms, 'admin')] }, async () => ({ ok: true }));
      await app.ready();

      const response = await app.inject({ method: 'GET', url: '/admin-only' });
      expect(response.statusCode).toBe(403);
    });
  });

  it('rejects a banned user even with a valid token', async () => {
    await withRollbackDb(async (db) => {
      const userId = 'banned-mw';
      await db.insert(schema.users).values({
        id: userId, email: `${userId}@example.com`, name: 'B', role: 'admin',
        isBanned: true, bannedAt: new Date(), bannedReason: 'test',
      });
      const plaintext = 'lore_admin_directly-inserted-for-test-aaaa';
      const tokenHash = await argon2.hash(plaintext);
      const prefix = plaintext.slice(0, 20);
      await db.insert(schema.apiTokens).values({ userId, name: 'stale', prefix, tokenHash });

      const tokens = createTokenService(db);
      const app = Fastify();
      app.decorate('db', db as any);
      app.decorate('auth', { api: { getSession: async () => null } } as any);
      app.get('/anything', { preHandler: [createRequireAuth({ app, tokens })] }, async () => ({ ok: true }));
      await app.ready();

      const response = await app.inject({
        method: 'GET', url: '/anything',
        headers: { authorization: `Bearer ${plaintext}` },
      });
      expect(response.statusCode).toBe(403);
      expect(response.json().error.code).toBe('BANNED');
    });
  });
});
