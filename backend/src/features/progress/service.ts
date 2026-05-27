import { and, eq, isNotNull } from 'drizzle-orm';
import type { drizzle } from 'drizzle-orm/postgres-js';
import { schema } from '../../db/schema.js';

type Db = ReturnType<typeof drizzle<typeof schema>>;

export type ProgressService = {
  markRead(userId: string, bookSlug: string, chapterSlug: string): Promise<{ ok: true } | { ok: false; reason: 'not_found' }>;
  unmarkRead(userId: string, bookSlug: string, chapterSlug: string): Promise<void>;
  toggleFavorite(userId: string, category: string, slug: string): Promise<{ favorited: boolean }>;
  getProgress(userId: string): Promise<{ readChapters: string[]; favoriteWiki: string[] }>;
};

export function createProgressService(db: Db): ProgressService {
  return {
    async markRead(userId, bookSlug, chapterSlug) {
      const [row] = await db
        .select({ chapterId: schema.chapters.id })
        .from(schema.chapters)
        .innerJoin(schema.books, eq(schema.chapters.bookId, schema.books.id))
        .where(and(eq(schema.books.slug, bookSlug), eq(schema.chapters.slug, chapterSlug)));

      if (!row) return { ok: false, reason: 'not_found' };

      await db
        .insert(schema.chapterReads)
        .values({ userId, chapterId: row.chapterId })
        .onConflictDoNothing();

      return { ok: true };
    },

    async unmarkRead(userId, bookSlug, chapterSlug) {
      const [row] = await db
        .select({ chapterId: schema.chapters.id })
        .from(schema.chapters)
        .innerJoin(schema.books, eq(schema.chapters.bookId, schema.books.id))
        .where(and(eq(schema.books.slug, bookSlug), eq(schema.chapters.slug, chapterSlug)));

      if (!row) return;

      await db
        .delete(schema.chapterReads)
        .where(and(
          eq(schema.chapterReads.userId, userId),
          eq(schema.chapterReads.chapterId, row.chapterId),
        ));
    },

    async toggleFavorite(userId, category, slug) {
      const [entry] = await db
        .select({ id: schema.wikiEntries.id })
        .from(schema.wikiEntries)
        .where(and(
          eq(schema.wikiEntries.category, category),
          eq(schema.wikiEntries.slug, slug),
          eq(schema.wikiEntries.isPublished, true),
        ));

      if (!entry) return { favorited: false };

      const [existing] = await db
        .select({ id: schema.wikiFavorites.id })
        .from(schema.wikiFavorites)
        .where(and(
          eq(schema.wikiFavorites.userId, userId),
          eq(schema.wikiFavorites.wikiEntryId, entry.id),
        ));

      if (existing) {
        await db.delete(schema.wikiFavorites).where(eq(schema.wikiFavorites.id, existing.id));
        return { favorited: false };
      }

      await db.insert(schema.wikiFavorites).values({ userId, wikiEntryId: entry.id });
      return { favorited: true };
    },

    async getProgress(userId) {
      const reads = await db
        .select({
          bookSlug: schema.books.slug,
          chapterSlug: schema.chapters.slug,
        })
        .from(schema.chapterReads)
        .innerJoin(schema.chapters, eq(schema.chapterReads.chapterId, schema.chapters.id))
        .innerJoin(schema.books, eq(schema.chapters.bookId, schema.books.id))
        .where(and(
          eq(schema.chapterReads.userId, userId),
          isNotNull(schema.chapters.publishedAt),
        ));

      const favs = await db
        .select({
          category: schema.wikiEntries.category,
          slug: schema.wikiEntries.slug,
        })
        .from(schema.wikiFavorites)
        .innerJoin(schema.wikiEntries, eq(schema.wikiFavorites.wikiEntryId, schema.wikiEntries.id))
        .where(and(
          eq(schema.wikiFavorites.userId, userId),
          eq(schema.wikiEntries.isPublished, true),
        ));

      return {
        readChapters: reads.map((r) => `${r.bookSlug}/${r.chapterSlug}`),
        favoriteWiki: favs.map((f) => `${f.category}/${f.slug}`),
      };
    },
  };
}
