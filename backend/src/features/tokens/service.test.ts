import 'dotenv/config';
import { describe, it, expect, afterAll } from 'vitest';
import { withRollbackDb, closeTestDb } from '../../lib/test-db.js';
import { schema } from '../../db/schema.js';
import { createTokenService } from './service.js';

afterAll(async () => { await closeTestDb(); });

async function seedUser(db: any, role = 'admin') {
  const id = 'u-' + Math.random().toString(36).slice(2, 8);
  await db.insert(schema.users).values({
    id,
    email: `t${Date.now()}-${Math.random().toString(36).slice(2,6)}@example.com`,
    name: 'T',
    role,
  });
  return id;
}

describe('tokenService', () => {
  it('create returns plaintext with role prefix; stores only hash', async () => {
    await withRollbackDb(async (db) => {
      const userId = await seedUser(db, 'admin');
      const svc = createTokenService(db);
      const { plaintext, record } = await svc.create({
        userId,
        userRole: 'admin',
        name: 'laptop',
      });
      expect(plaintext.startsWith('lore_admin_')).toBe(true);
      expect(plaintext.length).toBeGreaterThan(20);
      expect(record.tokenHash).not.toEqual(plaintext);
      expect(record.tokenHash.length).toBeGreaterThan(20);
    });
  });

  it('validate returns user id for a valid token', async () => {
    await withRollbackDb(async (db) => {
      const userId = await seedUser(db, 'admin');
      const svc = createTokenService(db);
      const { plaintext } = await svc.create({ userId, userRole: 'admin', name: 'laptop' });
      const result = await svc.validate(plaintext);
      expect(result?.userId).toBe(userId);
    });
  });

  it('validate returns null for a revoked token', async () => {
    await withRollbackDb(async (db) => {
      const userId = await seedUser(db, 'admin');
      const svc = createTokenService(db);
      const { plaintext, record } = await svc.create({ userId, userRole: 'admin', name: 'laptop' });
      await svc.revoke(record.id, userId);
      const result = await svc.validate(plaintext);
      expect(result).toBeNull();
    });
  });

  it('list returns tokens with human-readable prefix preview, no plaintext', async () => {
    await withRollbackDb(async (db) => {
      const userId = await seedUser(db, 'admin');
      const svc = createTokenService(db);
      await svc.create({ userId, userRole: 'admin', name: 'one' });
      await svc.create({ userId, userRole: 'admin', name: 'two' });
      const tokens = await svc.list(userId);
      expect(tokens.length).toBe(2);
      for (const t of tokens) {
        expect(t).not.toHaveProperty('plaintext');
        expect(typeof t.id).toBe('string');
        expect(t.tokenPreview.startsWith('lore_admin_')).toBe(true);
        expect(t.tokenPreview.length).toBe(20);
      }
    });
  });

  it('rejects token creation for non-admin/non-moderator roles', async () => {
    await withRollbackDb(async (db) => {
      const userId = await seedUser(db, 'user');
      const svc = createTokenService(db);
      await expect(
        svc.create({ userId, userRole: 'user', name: 'x' })
      ).rejects.toThrow(/role/i);
    });
  });
});
