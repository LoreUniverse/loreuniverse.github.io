import fp from 'fastify-plugin';
import type { FastifyInstance } from 'fastify';
import { createProgressService } from './service.js';
import type { ProgressService } from './service.js';
import { registerProgressRoutes } from './routes.js';

declare module 'fastify' {
  interface FastifyInstance {
    progress: ProgressService;
  }
}

async function progressPlugin(app: FastifyInstance) {
  app.decorate('progress', createProgressService(app.db));
  await registerProgressRoutes(app);
}

export default fp(progressPlugin, { name: 'progress', dependencies: ['permissions', 'tokens'] });
