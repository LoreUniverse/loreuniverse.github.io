import { readdir, readFile } from 'node:fs/promises';
import { join, basename } from 'node:path';
import matter from 'gray-matter';
import { and, eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import { schema } from '../../db/schema.js';

type Db = ReturnType<typeof drizzle<typeof schema>>;

// Plural category names match the folder structure under frontend/src/wiki/
// AND the existing wiki link transform's regex AND the {category|slug|display}
// tokens used in chapter prose.
const CATEGORIES = ['characters', 'lore-traits', 'mechanics', 'locations', 'factions', 'lore'];

export type SyncResult = {
  category: string;
  slug: string;
  action: 'created' | 'updated' | 'skipped';
};

export async function syncWikiFromMarkdown(db: Db, srcDir: string): Promise<SyncResult[]> {
  const results: SyncResult[] = [];

  for (const category of CATEGORIES) {
    const dir = join(srcDir, category);
    let files: string[];
    try {
      files = await readdir(dir);
    } catch {
      continue;
    }
    for (const file of files) {
      if (!file.endsWith('.md') || file === 'index.md') continue;
      const filePath = join(dir, file);
      const slug = basename(file, '.md');
      const raw = await readFile(filePath, 'utf-8');
      const { data: frontMatter, content: body } = matter(raw);
      const name = (frontMatter.name as string) ?? slug;

      const [existing] = await db.select().from(schema.wikiEntries)
        .where(and(eq(schema.wikiEntries.category, category), eq(schema.wikiEntries.slug, slug)));

      if (existing) {
        await db.update(schema.wikiEntries)
          .set({
            name,
            frontMatter: frontMatter as Record<string, unknown>,
            body: body.trim(),
            updatedAt: new Date(),
          })
          .where(eq(schema.wikiEntries.id, existing.id));
        results.push({ category, slug, action: 'updated' });
      } else {
        await db.insert(schema.wikiEntries).values({
          category, slug, name,
          frontMatter: frontMatter as Record<string, unknown>,
          body: body.trim(),
        });
        results.push({ category, slug, action: 'created' });
      }
    }
  }

  return results;
}
