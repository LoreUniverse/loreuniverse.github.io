import 'dotenv/config';
import { describe, it, expect, afterAll } from 'vitest';
import { withRollbackDb, closeTestDb } from '../../lib/test-db.js';
import { schema } from '../../db/schema.js';
import { createPermissionsService } from './service.js';

afterAll(async () => { await closeTestDb(); });

async function seedUser(db: any, role = 'user') {
  const id = 'u-' + Math.random().toString(36).slice(2, 10);
  await db.insert(schema.users).values({ id, email: `${id}@example.com`, name: 'X', role });
  return id;
}

describe('permissionsService', () => {
  it('grant + hasPermission returns true', async () => {
    await withRollbackDb(async (db) => {
      const userId = await seedUser(db, 'user');
      const adminId = await seedUser(db, 'admin');
      const svc = createPermissionsService(db);
      await svc.grant({ userId, permission: 'wiki_edit', grantedBy: adminId });
      expect(await svc.hasPermission(userId, 'wiki_edit')).toBe(true);
    });
  });

  it('admin implicitly has every permission', async () => {
    await withRollbackDb(async (db) => {
      const adminId = await seedUser(db, 'admin');
      const svc = createPermissionsService(db);
      expect(await svc.hasPermission(adminId, 'wiki_edit')).toBe(true);
      expect(await svc.hasPermission(adminId, 'art_upload')).toBe(true);
    });
  });

  it('moderator implicitly has every permission', async () => {
    await withRollbackDb(async (db) => {
      const modId = await seedUser(db, 'moderator');
      const svc = createPermissionsService(db);
      expect(await svc.hasPermission(modId, 'wiki_edit')).toBe(true);
    });
  });

  it('revoke removes the permission', async () => {
    await withRollbackDb(async (db) => {
      const userId = await seedUser(db, 'user');
      const adminId = await seedUser(db, 'admin');
      const svc = createPermissionsService(db);
      await svc.grant({ userId, permission: 'wiki_edit', grantedBy: adminId });
      await svc.revoke({ userId, permission: 'wiki_edit' });
      expect(await svc.hasPermission(userId, 'wiki_edit')).toBe(false);
    });
  });
});
