import fp from 'fastify-plugin';
import type { FastifyInstance } from 'fastify';
import { registerTokenRoutes } from './routes.js';

async function tokensPlugin(app: FastifyInstance) {
  await registerTokenRoutes(app);
}

export default fp(tokensPlugin, { name: 'tokens', dependencies: ['permissions', 'audit'] });
