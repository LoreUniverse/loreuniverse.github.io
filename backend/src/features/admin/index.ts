import fp from 'fastify-plugin';
import type { FastifyInstance } from 'fastify';
import { registerAutolinkRoutes } from './autolink-routes.js';
import { registerSiteRebuildRoutes } from './site-rebuild-routes.js';
import { createClaudeClient } from '../../lib/external/claude.js';

async function adminPlugin(app: FastifyInstance) {
  if (!app.hasDecorator('claude')) {
    app.decorate('claude', createClaudeClient());
  }
  await registerAutolinkRoutes(app);
  await registerSiteRebuildRoutes(app);
}

export default fp(adminPlugin, { name: 'admin', dependencies: ['permissions', 'wiki', 'audit'] });
