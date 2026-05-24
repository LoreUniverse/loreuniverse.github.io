import fp from 'fastify-plugin';
import type { FastifyInstance } from 'fastify';
import { registerBookRoutes } from './routes.js';

async function booksPlugin(app: FastifyInstance) {
  await registerBookRoutes(app);
}

export default fp(booksPlugin, { name: 'books', dependencies: ['permissions', 'audit'] });
