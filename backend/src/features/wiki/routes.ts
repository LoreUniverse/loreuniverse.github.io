import { and, eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { schema } from '../../db/schema.js';

export async function registerWikiRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/wiki/all', async () => {
    return app.db.select({
      id: schema.wikiEntries.id,
      category: schema.wikiEntries.category,
      slug: schema.wikiEntries.slug,
      name: schema.wikiEntries.name,
      frontMatter: schema.wikiEntries.frontMatter,
      body: schema.wikiEntries.body,
      updatedAt: schema.wikiEntries.updatedAt,
    }).from(schema.wikiEntries).where(eq(schema.wikiEntries.isPublished, true));
  });

  app.get('/api/wiki/:category/:slug', async (request, reply) => {
    const { category, slug } = request.params as { category: string; slug: string };
    const [entry] = await app.db.select().from(schema.wikiEntries)
      .where(and(eq(schema.wikiEntries.category, category), eq(schema.wikiEntries.slug, slug)));
    if (!entry) return reply.code(404).send({ error: { code: 'NOT_FOUND', message: 'Entry not found.' } });
    return entry;
  });

  app.put(
    '/api/admin/wiki/:category/:slug',
    {
      preHandler: [app.requireAuth, app.requirePermission('wiki_edit')],
      schema: {
        body: {
          type: 'object',
          required: ['name', 'frontMatter', 'body'],
          properties: {
            name: { type: 'string', minLength: 1 },
            frontMatter: { type: 'object' },
            body: { type: 'string' },
            editSummary: { type: 'string', maxLength: 500 },
            isPublished: { type: 'boolean' },
          },
        },
      },
    },
    async (request, reply) => {
      const { category, slug } = request.params as { category: string; slug: string };
      const body = request.body as { name: string; frontMatter: object; body: string; editSummary?: string; isPublished?: boolean };

      const [existing] = await app.db.select().from(schema.wikiEntries)
        .where(and(eq(schema.wikiEntries.category, category), eq(schema.wikiEntries.slug, slug)));

      let entry;
      if (existing) {
        [entry] = await app.db.update(schema.wikiEntries)
          .set({
            name: body.name,
            frontMatter: body.frontMatter as any,
            body: body.body,
            isPublished: body.isPublished ?? existing.isPublished,
            updatedAt: new Date(),
          })
          .where(eq(schema.wikiEntries.id, existing.id))
          .returning();
      } else {
        [entry] = await app.db.insert(schema.wikiEntries)
          .values({
            category, slug, name: body.name,
            frontMatter: body.frontMatter as any,
            body: body.body,
            isPublished: body.isPublished ?? true,
          })
          .returning();
      }

      await app.db.insert(schema.wikiRevisions).values({
        wikiEntryId: entry.id,
        editorUserId: request.user!.id,
        frontMatter: body.frontMatter as any,
        body: body.body,
        editSummary: body.editSummary ?? null,
      });

      await app.dispatch.triggerEvent({
        eventType: 'wiki-content-changed',
        clientPayload: { category, slug, editorUserId: request.user!.id },
      }).catch((err) => request.log.error({ err }, 'site rebuild dispatch failed'));

      await app.audit.log({
        actorUserId: request.user!.id,
        action: 'wiki.edit',
        targetType: 'wiki_entry',
        targetId: entry.id,
        metadata: { category, slug, editSummary: body.editSummary },
      }).catch((err) => request.log.error({ err }, 'audit log failed'));

      return reply.send(entry);
    },
  );
}
