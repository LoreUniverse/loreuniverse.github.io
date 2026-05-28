import 'dotenv/config';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { schema } from './db/schema.js';

// ---------------------------------------------------------------------------
// Static chapter catalogue — kept in sync with frontend/src/lorekeeper/books/
// Add new chapters here when publishing them.
// ---------------------------------------------------------------------------
const BOOKS = [
  { slug: 'book1', title: 'Book 1' },
] as const;

const CHAPTERS: Record<string, Array<{ slug: string; title: string; chapterNumber: number; publishedAt: Date | null }>> = {
  book1: [
    { slug: 'test-chapter', title: 'The Beginning',        chapterNumber: 1, publishedAt: new Date('2025-01-01') },
    { slug: 'chapter-2',    title: 'The Second Step',      chapterNumber: 2, publishedAt: new Date('2025-01-08') },
    { slug: 'chapter-3',    title: 'The Third Threshold',  chapterNumber: 3, publishedAt: new Date('2025-01-15') },
  ],
};

async function seedCatalogue(db: ReturnType<typeof drizzle<typeof schema>>) {
  for (const book of BOOKS) {
    const [upserted] = await db
      .insert(schema.books)
      .values({ slug: book.slug, title: book.title })
      .onConflictDoUpdate({
        target: schema.books.slug,
        set: { title: book.title, updatedAt: new Date() },
      })
      .returning({ id: schema.books.id });

    const bookId = upserted.id;
    for (const ch of CHAPTERS[book.slug] ?? []) {
      await db
        .insert(schema.chapters)
        .values({ bookId, slug: ch.slug, title: ch.title, chapterNumber: ch.chapterNumber, publishedAt: ch.publishedAt })
        .onConflictDoUpdate({
          target: [schema.chapters.bookId, schema.chapters.slug],
          set: { title: ch.title, chapterNumber: ch.chapterNumber, publishedAt: ch.publishedAt, updatedAt: new Date() },
        });
    }
  }
  console.log('Catalogue seeded (books + chapters).');
}

const url = process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL is required for migrations');

const sql = postgres(url, { max: 1 });
const db = drizzle(sql, { schema });

migrate(db, { migrationsFolder: './drizzle' })
  .then(async () => {
    console.log('Migrations applied.');
    await seedCatalogue(db);
    await sql.end();
    process.exit(0);
  })
  .catch(async (err) => {
    console.error('Migration failed:', err);
    await sql.end();
    process.exit(1);
  });
