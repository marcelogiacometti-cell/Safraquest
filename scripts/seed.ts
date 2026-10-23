// Desenvolvimento: dados de demonstração (NÃO usar em produção).
import { runMigrations } from '../src/db/migrate';
import { db, schema, getPool } from '../src/db';
import { freshWorld } from '../src/lib/demo';
(async () => {
  await runMigrations();
  const w = await freshWorld();
  console.log('Demo pronta. Painel: mkt@corteva.test / senha-forte-123');
  await getPool().end();
})();
