import 'dotenv/config';
import { describe, it, expect, afterAll } from 'vitest';
import { withRollbackDb, closeTestDb } from './test-db.js';
import { schema } from '../db/schema.js';

describe('withRollbackDb', () => {
  afterAll(async () => {
    await closeTestDb();
  });

  it('inserts inside a transaction and rolls back so no row persists', async () => {
    let seenInsideTransaction = false;
    await withRollbackDb(async (db) => {
      await db.insert(schema.users).values({
        id: 'rollback-test-user',
        email: 'rollback@example.com',
        name: 'Rollback',
      });
      const rows = await db.select().from(schema.users);
      seenInsideTransaction = rows.some(r => r.id === 'rollback-test-user');
    });

    expect(seenInsideTransaction).toBe(true);

    // After rollback, the row should not exist.
    await withRollbackDb(async (db) => {
      const rows = await db.select().from(schema.users);
      expect(rows.some(r => r.id === 'rollback-test-user')).toBe(false);
    });
  });
});
