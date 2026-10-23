/** Ao iniciar o servidor: aplica migrações e garante modelos de mensagem e o usuário Marketing. */
export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs' || process.env.NEXT_PHASE === 'phase-production-build') return;
  if (!process.env.DATABASE_URL) return;
  try {
    const { runMigrations } = await import('./db/migrate');
    const { bootstrap } = await import('./lib/bootstrap');
    await runMigrations();
    const r = await bootstrap({ adminEmail: process.env.ADMIN_EMAIL, adminPassword: process.env.ADMIN_PASSWORD, adminName: process.env.ADMIN_NAME });
    console.log('[safraquest] banco pronto.', r.adminId ? 'Usuário Marketing ok.' : 'Defina ADMIN_EMAIL e ADMIN_PASSWORD para criar o primeiro usuário.');
  } catch (e) { console.error('[safraquest] falha ao preparar o banco:', e); }
}
