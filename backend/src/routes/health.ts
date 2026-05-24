import type { FastifyInstance } from 'fastify';
import type { drizzle } from 'drizzle-orm/postgres-js';
import type { schema } from '../db/schema.js';

type Db = ReturnType<typeof drizzle<typeof schema>>;

export async function registerHealthRoute(app: FastifyInstance): Promise<void> {
  app.get('/health', async () => {
    const dbCheck = await checkDb(app.db);
    return {
      status: dbCheck.status === 'ok' ? 'ok' : 'down',
      modules: {
        db: dbCheck,
        auth: { status: 'ok' },
        audit: { status: 'ok' },
        permissions: { status: 'ok' },
        tokens: { status: 'ok' },
        wiki: { status: 'ok' },
        books: { status: 'ok' },
        chapters: { status: 'ok' },
        admin: { status: 'ok' },
      },
    };
  });
}

async function checkDb(db: Db) {
  const start = Date.now();
  try {
    await db.execute('SELECT 1' as any);
    return { status: 'ok' as const, latency_ms: Date.now() - start };
  } catch (err) {
    return {
      status: 'down' as const,
      latency_ms: Date.now() - start,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
