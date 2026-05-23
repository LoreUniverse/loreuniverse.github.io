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

async function authPlugin(app: FastifyInstance, opts: AuthPluginOptions) {
  const db = createDb(opts.databaseUrl);
  const auth = createAuth({ db, baseUrl: opts.baseUrl, secret: opts.secret });
  app.decorate('auth', auth);

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

    const responseBody = await webResponse.text();
    reply.send(responseBody);
  });
}

export default fp(authPlugin, { name: 'auth' });
