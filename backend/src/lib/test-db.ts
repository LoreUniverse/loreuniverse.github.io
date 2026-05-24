import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { schema } from '../db/schema.js';

const url = process.env.DATABASE_URL_TEST;
if (!url) {
  throw new Error('DATABASE_URL_TEST must be set for tests');
}

const sql = postgres(url, { max: 5 });
const baseDb = drizzle(sql, { schema });

class RollbackSignal extends Error {
  constructor() { super('__rollback__'); }
}

export async function withRollbackDb<T>(
  fn: (db: typeof baseDb) => Promise<T>
): Promise<T> {
  let result: T;
  try {
    await baseDb.transaction(async (tx) => {
      result = await fn(tx as unknown as typeof baseDb);
      throw new RollbackSignal();
    });
  } catch (err) {
    if (!(err instanceof RollbackSignal)) throw err;
  }
  return result!;
}

export async function closeTestDb(): Promise<void> {
  await sql.end({ timeout: 5 });
}
