import 'dotenv/config';
import Fastify from 'fastify';
import { registerHealthRoute } from './routes/health.js';
import authPlugin from './features/auth/index.js';
import auditPlugin from './features/audit/index.js';
import permissionsPlugin from './features/permissions/index.js';
import tokensPlugin from './features/tokens/index.js';
import wikiPlugin from './features/wiki/index.js';
import booksPlugin from './features/books/index.js';
import chaptersPlugin from './features/chapters/index.js';
import { createDb } from './db/client.js';

const PORT = Number(process.env.PORT ?? 3000);
const HOST = process.env.HOST ?? '0.0.0.0';

async function buildServer() {
  const app = Fastify({
    logger: { level: process.env.LOG_LEVEL ?? 'info' },
  });

  const databaseUrl = process.env.DATABASE_URL;
  const baseUrl = process.env.BETTER_AUTH_URL;
  const secret = process.env.BETTER_AUTH_SECRET;

  if (!databaseUrl) throw new Error('DATABASE_URL is required');
  if (!baseUrl) throw new Error('BETTER_AUTH_URL is required');
  if (!secret) throw new Error('BETTER_AUTH_SECRET is required');

  const db = createDb(databaseUrl);
  app.decorate('db', db);

  await app.register(authPlugin, { databaseUrl, baseUrl, secret });
  await app.register(auditPlugin);
  await app.register(permissionsPlugin);
  await app.register(tokensPlugin);
  await app.register(wikiPlugin);
  await app.register(booksPlugin);
  await app.register(chaptersPlugin);
  await registerHealthRoute(app);

  return app;
}

async function start() {
  const app = await buildServer();
  try {
    await app.listen({ port: PORT, host: HOST });
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

start();

export { buildServer };
