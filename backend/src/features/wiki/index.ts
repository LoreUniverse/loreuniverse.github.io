import fp from 'fastify-plugin';
import type { FastifyInstance } from 'fastify';
import { registerWikiRoutes } from './routes.js';
import { createGitHubDispatchClient, type GitHubDispatchClient } from '../../lib/external/github-dispatch.js';

declare module 'fastify' {
  interface FastifyInstance {
    dispatch: GitHubDispatchClient;
  }
}

async function wikiPlugin(app: FastifyInstance) {
  if (!app.hasDecorator('dispatch')) {
    app.decorate('dispatch', createGitHubDispatchClient());
  }
  await registerWikiRoutes(app);
}

export default fp(wikiPlugin, { name: 'wiki', dependencies: ['permissions', 'audit'] });
