// Chamado pelo agendador da Render a cada 10 minutos: pede ao app para despachar os avisos.
const alvo = process.env.APP_HOSTPORT;
const segredo = process.env.CRON_SECRET;
if (!alvo || !segredo) { console.error('Faltam APP_HOSTPORT ou CRON_SECRET'); process.exit(1); }
const url = `http://${alvo}/api/cron/dispatch`;
console.log('chamando', url);
try {
  const r = await fetch(url, { headers: { authorization: `Bearer ${segredo}` }, signal: AbortSignal.timeout(120000) });
  console.log(r.status, await r.text());
  process.exit(r.ok ? 0 : 1);
} catch (e) { console.error('falhou:', e?.cause?.code ?? e?.message ?? e); process.exit(1); }
