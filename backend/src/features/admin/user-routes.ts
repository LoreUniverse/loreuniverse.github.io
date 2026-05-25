import { count, desc } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { schema } from '../../db/schema.js';

export async function registerAdminUserRoutes(app: FastifyInstance): Promise<void> {
  app.get(
    '/api/admin/users',
    { preHandler: [app.requireAuth, app.requireRole('admin')] },
    async (request) => {
      const query = request.query as { page?: string; limit?: string };
      const page  = Math.max(1, parseInt(query.page  ?? '1',  10));
      const limit = Math.min(100, Math.max(1, parseInt(query.limit ?? '50', 10)));
      const offset = (page - 1) * limit;

      const [{ total }] = await app.db.select({ total: count() }).from(schema.users);

      const users = await app.db.select({
        id:            schema.users.id,
        email:         schema.users.email,
        name:          schema.users.name,
        role:          schema.users.role,
        isBanned:      schema.users.isBanned,
        bannedAt:      schema.users.bannedAt,
        bannedReason:  schema.users.bannedReason,
        emailVerified: schema.users.emailVerified,
        createdAt:     schema.users.createdAt,
      })
        .from(schema.users)
        .orderBy(desc(schema.users.createdAt))
        .limit(limit)
        .offset(offset);

      return { users, total, page, limit };
    },
  );
}
