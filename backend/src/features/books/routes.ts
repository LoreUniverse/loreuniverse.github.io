import { eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { schema } from '../../db/schema.js';

export async function registerBookRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/books', async () => {
    return app.db.select().from(schema.books).where(eq(schema.books.isPublished, true));
  });

  app.get('/api/books/:slug', async (request, reply) => {
    const { slug } = request.params as { slug: string };
    const [book] = await app.db.select().from(schema.books).where(eq(schema.books.slug, slug));
    if (!book) return reply.code(404).send({ error: { code: 'NOT_FOUND', message: 'Book not found.' } });
    return book;
  });

  // Minimal admin upsert
  app.put(
    '/api/admin/books/:slug',
    { preHandler: [app.requireAuth, app.requireRole('admin')] },
    async (request, reply) => {
      const { slug } = request.params as { slug: string };
      const body = request.body as {
        title: string; description?: string; coverImageUrl?: string;
        externalLinks?: Record<string, string>; isPublished?: boolean; publishedAt?: string;
      };

      const [existing] = await app.db.select().from(schema.books).where(eq(schema.books.slug, slug));
      const values = {
        slug,
        title: body.title,
        description: body.description ?? '',
        coverImageUrl: body.coverImageUrl ?? null,
        externalLinks: (body.externalLinks ?? {}) as any,
        isPublished: body.isPublished ?? true,
        publishedAt: body.publishedAt ? new Date(body.publishedAt) : null,
        updatedAt: new Date(),
      };

      const result = existing
        ? await app.db.update(schema.books).set(values).where(eq(schema.books.id, existing.id)).returning()
        : await app.db.insert(schema.books).values(values).returning();

      await app.audit.log({
        actorUserId: request.user!.id,
        action: 'book.upsert',
        targetType: 'book',
        targetId: result[0].id,
      }).catch((err) => request.log.error({ err }, 'audit log failed'));

      return reply.send(result[0]);
    },
  );
}
