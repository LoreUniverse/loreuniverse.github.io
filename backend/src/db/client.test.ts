import 'dotenv/config';
import { describe, it, expect, afterAll } from 'vitest';
import { createDb, closeDb } from './client.js';

describe('createDb', () => {
  afterAll(async () => {
    await closeDb();
  });

  it('returns a connected Drizzle client given DATABASE_URL', async () => {
    const url = process.env.DATABASE_URL_TEST;
    expect(url, 'DATABASE_URL_TEST must be set').toBeTruthy();
    const db = createDb(url!);
    const result = await db.execute<{ now: Date }>("SELECT now() AS now");
    expect(result.length).toBeGreaterThan(0);
  });
});
