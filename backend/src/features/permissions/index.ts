import fp from 'fastify-plugin';
import type { FastifyInstance, preHandlerHookHandler } from 'fastify';
import { createPermissionsService, type PermissionsService, type Role } from './service.js';
import { createTokenService, type TokenService } from '../tokens/service.js';
import { createRequireAuth, createRequireRole, createRequirePermission } from './middleware.js';

declare module 'fastify' {
  interface FastifyInstance {
    perms: PermissionsService;
    tokens: TokenService;
    requireAuth: preHandlerHookHandler;
    requireRole: (minimum: Role) => preHandlerHookHandler;
    requirePermission: (perm: string) => preHandlerHookHandler;
  }
}

async function permissionsPlugin(app: FastifyInstance) {
  const perms = createPermissionsService(app.db);
  const tokens = createTokenService(app.db);
  app.decorate('perms', perms);
  app.decorate('tokens', tokens);
  app.decorate('requireAuth', createRequireAuth({ app, tokens }));
  app.decorate('requireRole', (minimum: Role) => createRequireRole(perms, minimum));
  app.decorate('requirePermission', (perm: string) => createRequirePermission(perms, perm));
}

export default fp(permissionsPlugin, { name: 'permissions', dependencies: ['auth', 'audit'] });
