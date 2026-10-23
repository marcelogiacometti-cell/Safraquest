import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { getDb, getPool } from './index';

export async function runMigrations() {
  await migrate(getDb(), { migrationsFolder: './drizzle' });
}

if (process.argv[1]?.endsWith('migrate.ts')) {
  runMigrations()
    .then(() => { console.log('Migrações aplicadas.'); return getPool().end(); })
    .catch((e) => { console.error(e); process.exit(1); });
}
