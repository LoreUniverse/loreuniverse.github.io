#!/usr/bin/env node
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) { console.error('DATABASE_URL is required'); process.exit(1); }

  const { createDb, closeDb } = await import('../backend/dist/db/client.js').catch(() => {
    console.error('Backend not built. Run: cd backend && npm run build');
    process.exit(1);
  });
  const { syncChaptersFromMarkdown } = await import('../backend/dist/features/chapters/sync.js').catch(() => {
    console.error('sync.js not found in dist. Run: cd backend && npm run build');
    process.exit(1);
  });

  const BOOKS_DIR = path.resolve(__dirname, '..', 'frontend', 'src', 'lorekeeper', 'books');
  const db = createDb(url);
  try {
    const n = await syncChaptersFromMarkdown(db, BOOKS_DIR);
    console.log(`Synced ${n} chapters.`);
  } finally {
    await closeDb();
  }
}
main().catch((err) => { console.error(err); process.exit(1); });
