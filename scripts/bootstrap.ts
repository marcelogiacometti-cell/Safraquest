// Produção: cria modelos, regionais base e o usuário Marketing (ADMIN_EMAIL / ADMIN_PASSWORD).
import { runMigrations } from '../src/db/migrate';
import { bootstrap } from '../src/lib/bootstrap';
import { getPool } from '../src/db';
(async () => {
  await runMigrations();
  const r = await bootstrap({ adminEmail: process.env.ADMIN_EMAIL, adminPassword: process.env.ADMIN_PASSWORD, adminName: process.env.ADMIN_NAME, approveAllTemplates: process.env.WHATSAPP_PROVIDER !== 'meta' });
  console.log(r.adminId ? 'Marketing pronto.' : 'Defina ADMIN_EMAIL e ADMIN_PASSWORD para criar o primeiro usuário.');
  await getPool().end();
})();
