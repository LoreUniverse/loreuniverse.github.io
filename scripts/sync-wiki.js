#!/usr/bin/env node
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error('DATABASE_URL is required');
    process.exit(1);
  }

  // Dynamically import compiled dist files
  const { createDb, closeDb } = await import('../backend/dist/db/client.js').catch(() => {
    console.error('Backend not built. Run: cd backend && npm run build');
    process.exit(1);
  });
  const { syncWikiFromMarkdown } = await import('../backend/dist/features/wiki/sync.js').catch(() => {
    console.error('sync.js not found in dist. Run: cd backend && npm run build');
    process.exit(1);
  });

  const SRC_DIR = path.resolve(__dirname, '..', 'frontend', 'src', 'wiki');
  const db = createDb(url);
  try {
    const results = await syncWikiFromMarkdown(db, SRC_DIR);
    if (results.length === 0) {
      console.log('No wiki entries found to sync (frontend/src/wiki/ may be empty).');
    } else {
      console.log(`Synced ${results.length} wiki entries:`);
      for (const r of results) {
        console.log(`  ${r.action.padEnd(8)} ${r.category}/${r.slug}`);
      }
    }
  } finally {
    await closeDb();
  }
}

main().catch((err) => { console.error(err); process.exit(1); });
