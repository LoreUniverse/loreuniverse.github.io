import type { FastifyInstance } from 'fastify';
import type { drizzle } from 'drizzle-orm/postgres-js';
import type { schema } from '../db/schema.js';

type Db = ReturnType<typeof drizzle<typeof schema>>;

declare module 'fastify' {
  interface FastifyInstance {
    db: Db;
  }
}

export async function registerHealthRoute(app: FastifyInstance): Promise<void> {
  app.get('/health', async () => {
    const dbCheck = await checkDb(app.db);
    const overallOk = dbCheck.status === 'ok';
    return {
      status: overallOk ? 'ok' : 'down',
      modules: { db: dbCheck },
    };
  });
}

async function checkDb(
  db: Db,
): Promise<{ status: 'ok' | 'down'; latency_ms: number; error?: string }> {
  const start = Date.now();
  try {
    await db.execute('SELECT 1');
    return { status: 'ok', latency_ms: Date.now() - start };
  } catch (err) {
    return {
      status: 'down',
      latency_ms: Date.now() - start,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
