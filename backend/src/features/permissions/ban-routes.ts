import { eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { schema } from '../../db/schema.js';

export async function registerBanRoutes(app: FastifyInstance): Promise<void> {
  app.post(
    '/api/admin/users/:id/ban',
    {
      preHandler: [app.requireAuth, app.requireRole('admin')],
      schema: {
        body: {
          type: 'object',
          required: ['reason'],
          properties: { reason: { type: 'string', minLength: 1, maxLength: 500 } },
        },
      },
    },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const { reason } = request.body as { reason: string };

      await app.db.update(schema.users)
        .set({ isBanned: true, bannedAt: new Date(), bannedReason: reason })
        .where(eq(schema.users.id, id));

      await app.audit.log({
        actorUserId: request.user!.id,
        action: 'user.ban',
        targetType: 'user',
        targetId: id,
        metadata: { reason },
      }).catch((err) => request.log.error({ err }, 'audit log failed'));

      return reply.code(204).send();
    },
  );

  app.post(
    '/api/admin/users/:id/unban',
    { preHandler: [app.requireAuth, app.requireRole('admin')] },
    async (request, reply) => {
      const { id } = request.params as { id: string };

      await app.db.update(schema.users)
        .set({ isBanned: false, bannedAt: null, bannedReason: null })
        .where(eq(schema.users.id, id));

      await app.audit.log({
        actorUserId: request.user!.id,
        action: 'user.unban',
        targetType: 'user',
        targetId: id,
      }).catch((err) => request.log.error({ err }, 'audit log failed'));

      return reply.code(204).send();
    },
  );
}
