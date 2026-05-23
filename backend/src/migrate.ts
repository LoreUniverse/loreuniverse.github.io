import 'dotenv/config';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';

const url = process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL is required for migrations');

const sql = postgres(url, { max: 1 });
const db = drizzle(sql);

migrate(db, { migrationsFolder: './drizzle' })
  .then(async () => {
    console.log('Migrations applied.');
    await sql.end();
    process.exit(0);
  })
  .catch(async (err) => {
    console.error('Migration failed:', err);
    await sql.end();
    process.exit(1);
  });
