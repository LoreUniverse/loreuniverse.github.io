import { and, eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { schema } from '../../db/schema.js';

export async function registerApplicationRoutes(app: FastifyInstance): Promise<void> {
  // User submits a permission application
  app.post(
    '/api/account/permission-applications',
    {
      preHandler: [app.requireAuth],
      schema: {
        body: {
          type: 'object',
          required: ['permission', 'justification'],
          properties: {
            permission: { type: 'string', enum: ['wiki_edit', 'art_upload'] },
            justification: { type: 'string', minLength: 1, maxLength: 2000 },
          },
        },
      },
    },
    async (request, reply) => {
      const { permission, justification } = request.body as { permission: string; justification: string };

      const [row] = await app.db.insert(schema.permissionApplications)
        .values({ userId: request.user!.id, permission, justification })
        .returning();

      await app.audit.log({
        actorUserId: request.user!.id,
        action: 'permission_application.submit',
        targetType: 'permission_application',
        targetId: row.id,
        metadata: { permission },
      }).catch((err) => request.log.error({ err }, 'audit log failed'));

      return reply.code(201).send(row);
    },
  );

  // Admin lists pending applications
  app.get(
    '/api/admin/permission-applications',
    { preHandler: [app.requireAuth, app.requireRole('admin')] },
    async (request) => {
      const status = (request.query as { status?: string }).status ?? 'pending';
      return app.db.select().from(schema.permissionApplications)
        .where(eq(schema.permissionApplications.status, status))
        .orderBy(schema.permissionApplications.createdAt);
    },
  );

  // Admin approves an application
  app.post(
    '/api/admin/permission-applications/:id/approve',
    {
      preHandler: [app.requireAuth, app.requireRole('admin')],
      schema: {
        body: {
          type: 'object',
          properties: { note: { type: 'string', maxLength: 1000 } },
        },
      },
    },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const { note } = ((request.body ?? {}) as { note?: string });

      const [appRow] = await app.db.select().from(schema.permissionApplications)
        .where(and(eq(schema.permissionApplications.id, id), eq(schema.permissionApplications.status, 'pending')));
      if (!appRow) {
        return reply.code(404).send({ error: { code: 'NOT_FOUND', message: 'Application not found or already reviewed.' } });
      }

      await app.db.update(schema.permissionApplications)
        .set({ status: 'approved', reviewedBy: request.user!.id, reviewedAt: new Date(), reviewNote: note ?? null })
        .where(eq(schema.permissionApplications.id, id));

      await app.perms.grant({ userId: appRow.userId, permission: appRow.permission, grantedBy: request.user!.id });

      await app.audit.log({
        actorUserId: request.user!.id,
        action: 'permission_application.approve',
        targetType: 'permission_application',
        targetId: id,
        metadata: { permission: appRow.permission, grantedTo: appRow.userId },
      }).catch((err) => request.log.error({ err }, 'audit log failed'));

      return reply.code(204).send();
    },
  );

  // Admin rejects an application
  app.post(
    '/api/admin/permission-applications/:id/reject',
    {
      preHandler: [app.requireAuth, app.requireRole('admin')],
      schema: {
        body: {
          type: 'object',
          properties: { note: { type: 'string', maxLength: 1000 } },
        },
      },
    },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const { note } = ((request.body ?? {}) as { note?: string });

      const [appRow] = await app.db.select().from(schema.permissionApplications)
        .where(and(eq(schema.permissionApplications.id, id), eq(schema.permissionApplications.status, 'pending')));
      if (!appRow) {
        return reply.code(404).send({ error: { code: 'NOT_FOUND', message: 'Application not found or already reviewed.' } });
      }

      await app.db.update(schema.permissionApplications)
        .set({ status: 'rejected', reviewedBy: request.user!.id, reviewedAt: new Date(), reviewNote: note ?? null })
        .where(eq(schema.permissionApplications.id, id));

      await app.audit.log({
        actorUserId: request.user!.id,
        action: 'permission_application.reject',
        targetType: 'permission_application',
        targetId: id,
      }).catch((err) => request.log.error({ err }, 'audit log failed'));

      return reply.code(204).send();
    },
  );
}
