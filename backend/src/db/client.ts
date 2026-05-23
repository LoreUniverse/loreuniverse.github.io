import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { schema } from './schema.js';

type DrizzleClient = ReturnType<typeof drizzle<typeof schema>>;

let _connections: postgres.Sql[] = [];

export function createDb(url: string): DrizzleClient {
  const sql = postgres(url, {
    max: 5,
    idle_timeout: 20,
    connect_timeout: 10,
  });
  _connections.push(sql);
  return drizzle(sql, { schema });
}

export async function closeDb(): Promise<void> {
  for (const sql of _connections) {
    await sql.end({ timeout: 5 });
  }
  _connections = [];
}
