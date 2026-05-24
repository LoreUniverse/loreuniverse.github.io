import type { FastifyInstance } from 'fastify';

export async function registerTokenRoutes(app: FastifyInstance): Promise<void> {
  app.post(
    '/api/account/api-tokens',
    {
      preHandler: [app.requireAuth, app.requireRole('moderator')],
      schema: {
        body: {
          type: 'object',
          required: ['name'],
          properties: {
            name: { type: 'string', minLength: 1, maxLength: 64 },
            expiresAt: { type: 'string', format: 'date-time' },
          },
        },
      },
    },
    async (request, reply) => {
      const body = request.body as { name: string; expiresAt?: string };
      const { plaintext, record } = await app.tokens.create({
        userId: request.user!.id,
        userRole: request.user!.role,
        name: body.name,
        expiresAt: body.expiresAt ? new Date(body.expiresAt) : undefined,
      });

      await app.audit.log({
        actorUserId: request.user!.id,
        action: 'api_token.create',
        targetType: 'api_token',
        targetId: record.id,
        metadata: { name: record.name },
      }).catch((err) => request.log.error({ err }, 'audit log failed'));

      return reply.code(201).send({
        plaintext,
        token: { id: record.id, name: record.name, createdAt: record.createdAt, expiresAt: record.expiresAt },
      });
    },
  );

  app.get(
    '/api/account/api-tokens',
    { preHandler: [app.requireAuth] },
    async (request) => {
      return app.tokens.list(request.user!.id);
    },
  );

  app.delete(
    '/api/account/api-tokens/:id',
    { preHandler: [app.requireAuth] },
    async (request, reply) => {
      const params = request.params as { id: string };
      await app.tokens.revoke(params.id, request.user!.id);

      await app.audit.log({
        actorUserId: request.user!.id,
        action: 'api_token.revoke',
        targetType: 'api_token',
        targetId: params.id,
      }).catch((err) => request.log.error({ err }, 'audit log failed'));

      return reply.code(204).send();
    },
  );
}
