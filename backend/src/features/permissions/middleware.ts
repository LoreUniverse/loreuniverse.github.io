import type { FastifyInstance, FastifyRequest, FastifyReply, preHandlerHookHandler } from 'fastify';
import { eq } from 'drizzle-orm';
import { schema } from '../../db/schema.js';
import type { TokenService } from '../tokens/service.js';
import type { PermissionsService, Role } from './service.js';

export type AuthedUser = {
  id: string;
  role: Role;
  isBanned: boolean;
  authVia: 'session' | 'token';
};

declare module 'fastify' {
  interface FastifyRequest {
    user?: AuthedUser;
  }
}

export function createRequireAuth(opts: {
  app: FastifyInstance;
  tokens: TokenService;
}): preHandlerHookHandler {
  const { app, tokens } = opts;

  return async function requireAuth(request: FastifyRequest, reply: FastifyReply) {
    // 1. Try Bearer token
    const authHeader = request.headers.authorization;
    if (authHeader?.startsWith('Bearer ')) {
      const plaintext = authHeader.slice('Bearer '.length).trim();
      const result = await tokens.validate(plaintext);
      if (result) {
        const [u] = await app.db.select().from(schema.users).where(eq(schema.users.id, result.userId));
        if (!u) return reply.code(401).send({ error: { code: 'UNAUTHORIZED', message: 'Unknown user.' } });
        if (u.isBanned) return reply.code(403).send({ error: { code: 'BANNED', message: 'Account banned.' } });
        request.user = { id: u.id, role: (u.role as Role) ?? 'user', isBanned: u.isBanned, authVia: 'token' };
        return;
      }
    }

    // 2. Try Better Auth session
    const session = await app.auth.api.getSession({ headers: request.headers as any }).catch(() => null);
    if (!session?.user) {
      return reply.code(401).send({ error: { code: 'UNAUTHORIZED', message: 'Login required.' } });
    }
    const [u] = await app.db.select().from(schema.users).where(eq(schema.users.id, session.user.id));
    if (!u) return reply.code(401).send({ error: { code: 'UNAUTHORIZED', message: 'Session user missing.' } });
    if (u.isBanned) return reply.code(403).send({ error: { code: 'BANNED', message: 'Account banned.' } });
    request.user = { id: u.id, role: (u.role as Role) ?? 'user', isBanned: u.isBanned, authVia: 'session' };
  };
}

export function createRequireRole(perms: PermissionsService, minimum: Role): preHandlerHookHandler {
  return async function requireRole(request, reply) {
    if (!request.user) return reply.code(401).send({ error: { code: 'UNAUTHORIZED', message: 'Login required.' } });
    const ok = await perms.hasRole(request.user.id, minimum);
    if (!ok) return reply.code(403).send({ error: { code: 'FORBIDDEN', message: `Requires role ${minimum} or higher.` } });
  };
}

export function createRequirePermission(perms: PermissionsService, permission: string): preHandlerHookHandler {
  return async function requirePermission(request, reply) {
    if (!request.user) return reply.code(401).send({ error: { code: 'UNAUTHORIZED', message: 'Login required.' } });
    const ok = await perms.hasPermission(request.user.id, permission);
    if (!ok) return reply.code(403).send({ error: { code: 'FORBIDDEN', message: `Missing permission ${permission}.` } });
  };
}
