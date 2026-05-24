import { eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { schema } from '../../db/schema.js';

export async function registerChapterRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/chapters/:bookSlug', async (request, reply) => {
    const { bookSlug } = request.params as { bookSlug: string };
    const [book] = await app.db.select().from(schema.books).where(eq(schema.books.slug, bookSlug));
    if (!book) return reply.code(404).send({ error: { code: 'NOT_FOUND', message: 'Book not found.' } });
    return app.db.select().from(schema.chapters)
      .where(eq(schema.chapters.bookId, book.id))
      .orderBy(schema.chapters.chapterNumber);
  });
}
