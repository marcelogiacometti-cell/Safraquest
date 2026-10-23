import { beforeAll, afterAll } from 'vitest';
import { getPool } from '@/db';
import { runMigrations } from '@/db/migrate';
export { freshWorld, addSeller } from '@/lib/demo';
export function setupDb() {
  beforeAll(async () => { await runMigrations(); });
  afterAll(async () => { await getPool().end(); });
}
