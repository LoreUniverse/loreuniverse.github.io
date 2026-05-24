import fp from 'fastify-plugin';
import type { FastifyInstance } from 'fastify';
import { registerChapterRoutes } from './routes.js';

async function chaptersPlugin(app: FastifyInstance) {
  await registerChapterRoutes(app);
}

export default fp(chaptersPlugin, { name: 'chapters', dependencies: ['permissions'] });
