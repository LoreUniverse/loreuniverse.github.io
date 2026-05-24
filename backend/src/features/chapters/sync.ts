import { readdir, readFile } from 'node:fs/promises';
import { join, basename } from 'node:path';
import matter from 'gray-matter';
import { and, eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import { schema } from '../../db/schema.js';

type Db = ReturnType<typeof drizzle<typeof schema>>;

export async function syncChaptersFromMarkdown(db: Db, booksDir: string): Promise<number> {
  let count = 0;
  let bookSlugs: string[];
  try {
    bookSlugs = await readdir(booksDir);
  } catch {
    return 0;
  }

  for (const bookSlug of bookSlugs) {
    const chaptersDir = join(booksDir, bookSlug, 'chapters');
    let files: string[];
    try {
      files = await readdir(chaptersDir);
    } catch {
      continue;
    }

    let [book] = await db.select().from(schema.books).where(eq(schema.books.slug, bookSlug));
    if (!book) {
      [book] = await db.insert(schema.books).values({
        slug: bookSlug,
        title: bookSlug.replace(/[-_]/g, ' '),
      }).returning();
    }

    for (const file of files) {
      if (!file.endsWith('.md') || file === 'index.md') continue;
      const filePath = join(chaptersDir, file);
      const slug = basename(file, '.md');
      const raw = await readFile(filePath, 'utf-8');
      const { data: frontMatter } = matter(raw);
      const title = (frontMatter.title as string) ?? slug;
      const chapterNumber = (frontMatter.chapter_number as number) ?? 0;
      const publishedAt = frontMatter.publication_date ? new Date(frontMatter.publication_date as string) : null;

      const [existing] = await db.select().from(schema.chapters)
        .where(and(eq(schema.chapters.bookId, book.id), eq(schema.chapters.slug, slug)));

      if (existing) {
        await db.update(schema.chapters)
          .set({ title, chapterNumber, publishedAt, updatedAt: new Date() })
          .where(eq(schema.chapters.id, existing.id));
      } else {
        await db.insert(schema.chapters).values({
          bookId: book.id, chapterNumber, slug, title, publishedAt,
        });
      }
      count++;
    }
  }
  return count;
}
