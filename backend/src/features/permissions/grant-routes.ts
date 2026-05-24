import type { FastifyInstance } from 'fastify';

export async function registerGrantRoutes(app: FastifyInstance): Promise<void> {
  app.post(
    '/api/admin/users/:id/permissions',
    {
      preHandler: [app.requireAuth, app.requireRole('admin')],
      schema: {
        body: {
          type: 'object',
          required: ['permission'],
          properties: {
            permission: { type: 'string', enum: ['wiki_edit', 'art_upload'] },
          },
        },
      },
    },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const { permission } = request.body as { permission: string };

      await app.perms.grant({ userId: id, permission, grantedBy: request.user!.id });

      await app.audit.log({
        actorUserId: request.user!.id,
        action: 'permission.grant',
        targetType: 'user',
        targetId: id,
        metadata: { permission },
      }).catch((err) => request.log.error({ err }, 'audit log failed'));

      return reply.code(204).send();
    },
  );

  app.delete(
    '/api/admin/users/:id/permissions/:permission',
    { preHandler: [app.requireAuth, app.requireRole('admin')] },
    async (request, reply) => {
      const { id, permission } = request.params as { id: string; permission: string };

      await app.perms.revoke({ userId: id, permission });

      await app.audit.log({
        actorUserId: request.user!.id,
        action: 'permission.revoke',
        targetType: 'user',
        targetId: id,
        metadata: { permission },
      }).catch((err) => request.log.error({ err }, 'audit log failed'));

      return reply.code(204).send();
    },
  );
}
