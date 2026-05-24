import fp from 'fastify-plugin';
import type { FastifyInstance } from 'fastify';
import { createAuth, type AuthInstance } from './better-auth.js';
import { createDb } from '../../db/client.js';

declare module 'fastify' {
  interface FastifyInstance {
    auth: AuthInstance;
  }
}

export type AuthPluginOptions = {
  databaseUrl: string;
  baseUrl: string;
  secret: string;
};

// Returns the list of allowed origins from the environment variable.
// Re-read on every request so changes to ALLOWED_ORIGINS take effect
// without a restart (useful during development).
function getAllowedOrigins(): string[] {
  return (process.env.ALLOWED_ORIGINS ?? '').split(',').map(o => o.trim()).filter(Boolean);
}

async function authPlugin(app: FastifyInstance, opts: AuthPluginOptions) {
  const db = createDb(opts.databaseUrl);
  const auth = createAuth({ db, baseUrl: opts.baseUrl, secret: opts.secret });
  app.decorate('auth', auth);

  // Handle CORS preflight for all /api/auth/* routes.
  // Better Auth does not respond to OPTIONS with CORS headers in this
  // Fastify adapter setup — it returns 404, which causes the browser to
  // block the subsequent POST. We intercept OPTIONS here before the
  // request reaches Better Auth.
  app.options('/api/auth/*', async (request, reply) => {
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

  // Mount Better Auth's HTTP handler at /api/auth/*
  app.all('/api/auth/*', async (request, reply) => {
    const url = new URL(request.url, opts.baseUrl);
    const headers = new Headers();
    for (const [key, value] of Object.entries(request.headers)) {
      if (Array.isArray(value)) headers.set(key, value.join(', '));
      else if (value) headers.set(key, value);
    }
    const body = ['GET', 'HEAD'].includes(request.method)
      ? undefined
      : JSON.stringify(request.body);

    const webRequest = new Request(url, {
      method: request.method,
      headers,
      body,
    });

    const webResponse = await auth.handler(webRequest);
    reply.status(webResponse.status);

    const setCookies = typeof webResponse.headers.getSetCookie === 'function'
      ? webResponse.headers.getSetCookie()
      : [];
    if (setCookies.length > 0) {
      reply.header('set-cookie', setCookies);
    }

    webResponse.headers.forEach((value, key) => {
      if (key.toLowerCase() === 'set-cookie') return;
      reply.header(key, value);
    });

    // Better Auth sets CORS headers based on trustedOrigins, but only when
    // the origin is recognised. Ensure the header is always present for
    // allowed origins so credentials-mode fetch never gets silently blocked.
    const origin = request.headers.origin;
    if (origin && getAllowedOrigins().includes(origin)) {
      if (!reply.hasHeader('access-control-allow-origin')) {
        reply.header('Access-Control-Allow-Origin', origin);
        reply.header('Access-Control-Allow-Credentials', 'true');
      }
    }

    const responseBody = await webResponse.text();
    reply.send(responseBody);
  });
}

export default fp(authPlugin, { name: 'auth' });
