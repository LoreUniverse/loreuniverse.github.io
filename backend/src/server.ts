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
import adminPlugin from './features/admin/index.js';
import rateLimit from '@fastify/rate-limit';
import progressPlugin from './features/progress/index.js';
import { createDb } from './db/client.js';

const PORT = Number(process.env.PORT ?? 3000);
const HOST = process.env.HOST ?? '0.0.0.0';

function getAllowedOrigins(): string[] {
  return (process.env.ALLOWED_ORIGINS ?? '').split(',').map(o => o.trim()).filter(Boolean);
}

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

  // Global CORS — applies to all non-auth routes (auth plugin handles /api/auth/* itself).
  app.addHook('onSend', async (request, reply) => {
    const origin = request.headers.origin;
    if (origin && getAllowedOrigins().includes(origin)) {
      if (!reply.hasHeader('access-control-allow-origin')) {
        reply.header('Access-Control-Allow-Origin', origin);
        reply.header('Access-Control-Allow-Credentials', 'true');
      }
    }
  });

  // Handle OPTIONS preflight for all non-auth routes.
  app.options('*', async (request, reply) => {
    const origin = request.headers.origin;
    if (origin && getAllowedOrigins().includes(origin)) {
      reply
        .header('Access-Control-Allow-Origin', origin)
        .header('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS')
        .header('Access-Control-Allow-Headers', 'Content-Type, Authorization')
        .header('Access-Control-Allow-Credentials', 'true')
        .header('Access-Control-Max-Age', '86400')
        .status(204)
        .send();
    } else {
      reply.status(403).send();
    }
  });

  await app.register(authPlugin, { databaseUrl, baseUrl, secret });
  await app.register(auditPlugin);
  await app.register(permissionsPlugin);
  await app.register(tokensPlugin);
  await app.register(wikiPlugin);
  await app.register(booksPlugin);
  await app.register(chaptersPlugin);
  await app.register(adminPlugin);
  await app.register(rateLimit, {
    global: false, // only routes with config.rateLimit are rate-limited
    keyGenerator: (request) => (request as any).user?.id ?? request.ip,
  });
  await app.register(progressPlugin);
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
