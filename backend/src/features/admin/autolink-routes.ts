import type { FastifyInstance } from 'fastify';
import { schema } from '../../db/schema.js';
import type { ClaudeClient, WikiIndex } from '../../lib/external/claude.js';

declare module 'fastify' {
  interface FastifyInstance {
    claude: ClaudeClient;
  }
}

export async function registerAutolinkRoutes(app: FastifyInstance): Promise<void> {
  app.post(
    '/api/admin/autolink',
    {
      preHandler: [app.requireAuth, app.requireRole('admin')],
      schema: {
        body: {
          type: 'object',
          required: ['chapterText'],
          properties: {
            chapterText: { type: 'string', minLength: 1, maxLength: 500_000 },
            policy: { type: 'string', enum: ['first-mention-per-chapter', 'first-mention-per-section', 'every-mention'] },
          },
        },
      },
    },
    async (request, reply) => {
      const body = request.body as { chapterText: string; policy?: 'first-mention-per-chapter' | 'first-mention-per-section' | 'every-mention' };
      const policy = body.policy ?? 'first-mention-per-section';

      const entries = await app.db.select({
        category: schema.wikiEntries.category,
        slug: schema.wikiEntries.slug,
        name: schema.wikiEntries.name,
        frontMatter: schema.wikiEntries.frontMatter,
      }).from(schema.wikiEntries);

      const wikiIndex: WikiIndex = entries.map(e => ({
        category: e.category,
        slug: e.slug,
        name: e.name,
        aliases: extractAliases(e.frontMatter),
      }));

      const result = await app.claude.annotateChapter({
        chapterText: body.chapterText,
        wikiIndex,
        policy,
      });

      await app.audit.log({
        actorUserId: request.user!.id,
        action: 'autolink.request',
        targetType: 'chapter',
        metadata: {
          chars: body.chapterText.length,
          model: result.model,
          tokensIn: result.tokensIn,
          tokensOut: result.tokensOut,
          policy,
        },
      }).catch((err) => request.log.error({ err }, 'audit log failed'));

      return reply.send({
        annotatedText: result.annotatedText,
        usage: { model: result.model, tokensIn: result.tokensIn, tokensOut: result.tokensOut },
      });
    },
  );
}

function extractAliases(frontMatter: unknown): string[] {
  if (!frontMatter || typeof frontMatter !== 'object') return [];
  const fm = frontMatter as Record<string, unknown>;
  if (Array.isArray(fm.aliases)) return fm.aliases as string[];
  return [];
}
