import { count, desc } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { schema } from '../../db/schema.js';

export async function registerAdminAuditRoutes(app: FastifyInstance): Promise<void> {
  app.get(
    '/api/admin/audit',
    { preHandler: [app.requireAuth, app.requireRole('admin')] },
    async (request) => {
      const query  = request.query as { page?: string; limit?: string };
      const page   = Math.max(1, parseInt(query.page  ?? '1',  10));
      const limit  = Math.min(100, Math.max(1, parseInt(query.limit ?? '50', 10)));
      const offset = (page - 1) * limit;

      const [{ total }] = await app.db.select({ total: count() }).from(schema.auditLog);

      const entries = await app.db.select()
        .from(schema.auditLog)
        .orderBy(desc(schema.auditLog.createdAt))
        .limit(limit)
        .offset(offset);

      return { entries, total, page, limit };
    },
  );
}
