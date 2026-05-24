import type { FastifyInstance } from 'fastify';

export async function registerSiteRebuildRoutes(app: FastifyInstance): Promise<void> {
  app.post(
    '/api/admin/site-rebuild',
    { preHandler: [app.requireAuth, app.requireRole('admin')] },
    async (request, reply) => {
      await app.dispatch.triggerEvent({
        eventType: 'wiki-content-changed',
        clientPayload: { reason: 'manual', actorUserId: request.user!.id },
      });

      await app.audit.log({
        actorUserId: request.user!.id,
        action: 'site.rebuild.manual',
      }).catch((err) => request.log.error({ err }, 'audit log failed'));

      return reply.code(204).send();
    },
  );
}
