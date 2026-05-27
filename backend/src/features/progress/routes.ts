import type { FastifyInstance } from 'fastify';

export async function registerProgressRoutes(app: FastifyInstance): Promise<void> {
  app.get(
    '/api/user/progress',
    {
      preHandler: [app.requireAuth],
      config: { rateLimit: { max: 20, timeWindow: '1 minute' } },
    },
    async (request) => {
      return app.progress.getProgress(request.user!.id);
    },
  );

  app.post(
    '/api/user/chapters/:bookSlug/:chapterSlug/read',
    {
      preHandler: [app.requireAuth],
      config: { rateLimit: { max: 30, timeWindow: '1 minute' } },
    },
    async (request, reply) => {
      const { bookSlug, chapterSlug } = request.params as { bookSlug: string; chapterSlug: string };
      const result = await app.progress.markRead(request.user!.id, bookSlug, chapterSlug);
      if (!result.ok) {
        return reply.code(404).send({ error: { code: 'NOT_FOUND', message: 'Chapter not found.' } });
      }
      return reply.code(200).send({ ok: true });
    },
  );

  app.delete(
    '/api/user/chapters/:bookSlug/:chapterSlug/read',
    {
      preHandler: [app.requireAuth],
      config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
    },
    async (request, reply) => {
      const { bookSlug, chapterSlug } = request.params as { bookSlug: string; chapterSlug: string };
      await app.progress.unmarkRead(request.user!.id, bookSlug, chapterSlug);
      return reply.code(200).send({ ok: true });
    },
  );

  app.post(
    '/api/user/wiki/:category/:slug/favorite',
    {
      preHandler: [app.requireAuth],
      config: { rateLimit: { max: 20, timeWindow: '1 minute' } },
    },
    async (request) => {
      const { category, slug } = request.params as { category: string; slug: string };
      return app.progress.toggleFavorite(request.user!.id, category, slug);
    },
  );
}
