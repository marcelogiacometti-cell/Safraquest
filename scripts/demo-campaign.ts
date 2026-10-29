// Desenvolvimento: cria uma campanha ativa nesta semana, com 5 perguntas por missão, e um vendedor de teste.
import { eq } from 'drizzle-orm';
import { runMigrations } from '../src/db/migrate';
import { db, schema, getPool } from '../src/db';
import { saveCampaign, saveQuestion, createGroup, setCampaignGroups, scheduleCampaign } from '../src/lib/admin';
import { syncCampaignStatuses } from '../src/lib/quiz';
import { addSeller } from '../src/lib/demo';
import { localToUtc, toLocalParts } from '../src/lib/schedule';
(async () => {
  await runMigrations();
  const lp = toLocalParts(new Date());
  const start = localToUtc(lp.y, lp.m, lp.d - ((lp.wd + 6) % 7)); // segunda-feira desta semana, 00:00 em Brasília
  const id = await saveCampaign(null, { name: 'Lançamento Demo', productName: 'Produto Demo', startDate: start, endDate: new Date(start.getTime() + 14 * 86400_000) });
  const ms = await db.select().from(schema.missions).where(eq(schema.missions.campaignId, id));
  for (const m of ms) for (let i = 0; i < 5; i++)
    await saveQuestion(null, { missionId: m.id, text: `Pergunta ${i + 1} da missão ${m.number}?`, options: ['Alternativa A', 'Alternativa B', 'Alternativa C', 'Alternativa D'], correct: i % 4, explanation: 'Explicação de exemplo.', topic: i % 2 ? 'Posicionamento' : 'Manejo' });
  const g = await createGroup({ name: 'Todos os canais', autoInclude: true });
  await setCampaignGroups(id, [g]);
  await scheduleCampaign(id);
  await syncCampaignStatuses();
  const [d] = await db.select().from(schema.distributors).where(eq(schema.distributors.name, 'Revenda Beta'));
  const [u] = await db.select().from(schema.units).where(eq(schema.units.distributorId, d.id));
  const s = await addSeller(d.id, u.id, 'Paulo Teixeira');
  console.log('Campanha ativa. Vendedor de teste:', s.email);
  await getPool().end();
})();
