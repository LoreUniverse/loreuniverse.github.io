import fp from 'fastify-plugin';
import type { FastifyInstance } from 'fastify';
import { createAuditService, type AuditService } from './service.js';

declare module 'fastify' {
  interface FastifyInstance {
    audit: AuditService;
  }
}

async function auditPlugin(app: FastifyInstance) {
  app.decorate('audit', createAuditService(app.db));
}

export default fp(auditPlugin, { name: 'audit', dependencies: [] });
