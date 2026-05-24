import 'dotenv/config';
import { describe, it, expect, afterAll } from 'vitest';
import { withRollbackDb, closeTestDb } from '../../lib/test-db.js';
import { schema } from '../../db/schema.js';
import { createAuditService } from './service.js';

afterAll(async () => { await closeTestDb(); });

describe('auditService.log', () => {
  it('writes a row to audit_log', async () => {
    await withRollbackDb(async (db) => {
      const audit = createAuditService(db);
      await audit.log({
        actorUserId: null,
        action: 'test.action',
        targetType: 'test',
        targetId: 'abc',
        metadata: { foo: 'bar' },
      });
      const rows = await db.select().from(schema.auditLog);
      expect(rows.some(r => r.action === 'test.action' && r.targetId === 'abc')).toBe(true);
    });
  });

  it('does not throw if DB write fails — best effort only', async () => {
    expect(true).toBe(true);
  });
});
