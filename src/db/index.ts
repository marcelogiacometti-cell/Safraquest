import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema';

const g = globalThis as unknown as { __pool?: Pool };

export function getPool(): Pool {
  if (!g.__pool) {
    g.__pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 10 });
  }
  return g.__pool;
}

export function getDb() {
  return drizzle(getPool(), { schema });
}

export const db = new Proxy({} as ReturnType<typeof getDb>, {
  get(_t, prop) {
    return (getDb() as never)[prop as never];
  },
});

export type Db = ReturnType<typeof getDb>;
export { schema };
