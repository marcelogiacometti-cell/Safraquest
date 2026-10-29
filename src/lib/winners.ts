import { eq, inArray } from 'drizzle-orm';
import { db, schema } from '@/db';
import { AdminError } from './admin';
import { activeSellers, loadAttemptScores, orgNames, rankPeople, standByGroup, totalsByUser } from './stats';
import { getProvider, contactOf } from './whatsapp/provider';

export type WinnerRow = { id: string; name: string; org: string; value: number };

function mulberry32(seed: number) {
  return () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

export async function computeStandings(campaignId: string, seed = Date.now() % 2 ** 31) {
  const [camp] = await db.select().from(schema.campaigns).where(eq(schema.campaigns.id, campaignId));
  if (!camp) throw new AdminError('NOT_FOUND', 'Campanha não encontrada.');
  const missions = await db.select().from(schema.missions).where(eq(schema.missions.campaignId, campaignId));
  const scores = await loadAttemptScores({ campaignId });
  const totals = totalsByUser(scores);
  const sellers = await activeSellers();
  const names = await orgNames();
  const orgOf = (p: { distributorId: string | null }) => (p.distributorId ? names.dist.get(p.distributorId)?.name ?? '' : '');

  const eligible = sellers.filter((s) => (totals.get(s.id)?.missions ?? 0) >= camp.minMissions);
  const eligibility = rankPeople(sellers, totals).filter((r) => r.answered > 0 || r.missions > 0).map((r) => ({
    pos: r.pos, id: r.id, name: r.name, org: orgOf(r), points: r.points, missions: r.missions, hitRate: r.answered ? Math.round((r.hits / r.answered) * 100) : 0,
    timeMs: r.timeMs, eligible: r.missions >= camp.minMissions,
    atRisk: r.missions < camp.minMissions && r.missions + (missions.filter((m) => m.closesAt > new Date()).length) < camp.minMissions,
  }));

  const sellersTop = rankPeople(eligible, totals).slice(0, 3).map((r): WinnerRow => ({ id: r.id, name: r.name, org: orgOf(r), value: r.points }));

  const unitSt = standByGroup(sellers, totals, (p) => p.unitId, names.unit, camp.minUnitSellers).filter((u) => u.pos > 0).slice(0, 3);
  const unitDist = new Map(names.unitRows.map((u) => [u.id, u.distributorId]));
  const unitsTop = unitSt.map((u): WinnerRow => ({ id: u.id, name: u.name, org: `${names.dist.get(unitDist.get(u.id) ?? '')?.name ?? ''} · ${u.sellers} vendedores`, value: u.avgPoints }));

  const distSt = standByGroup(sellers, totals, (p) => p.distributorId, names.dist, 0);
  const distTop: (WinnerRow & { category: string })[] = [];
  for (const type of ['COOPERATIVA', 'REVENDA']) {
    const best = distSt.filter((d) => d.type === type && d.pos > 0)[0];
    if (best) distTop.push({ id: best.id, name: best.name, org: type === 'COOPERATIVA' ? 'Categoria Cooperativas' : 'Categoria Revendas', value: best.avgPoints, category: type });
  }

  // mais evoluídos: ganho de taxa de acerto entre a 1ª missão concluída e a última
  const byUser = new Map<string, typeof scores>();
  const qCount = new Map<string, number>();
  for (const m of missions) qCount.set(m.id, (await db.select().from(schema.questions).where(eq(schema.questions.missionId, m.id))).length);
  for (const s of scores.filter((x) => x.finished)) { const l = byUser.get(s.userId) ?? []; l.push(s); byUser.set(s.userId, l); }
  const missionNo = new Map(missions.map((m) => [m.id, m.number]));
  const evolved: WinnerRow[] = [];
  for (const [uid, list] of byUser) {
    if (list.length < 2) continue;
    list.sort((a, b) => (missionNo.get(a.missionId) ?? 0) - (missionNo.get(b.missionId) ?? 0));
    const rate = (s: (typeof list)[number]) => s.hits / Math.max(1, qCount.get(s.missionId) ?? 1);
    const gain = Math.round((rate(list[list.length - 1]) - rate(list[0])) * 100);
    const p = sellers.find((x) => x.id === uid);
    if (p && gain > 0) evolved.push({ id: uid, name: p.name, org: orgOf(p), value: gain });
  }
  evolved.sort((a, b) => b.value - a.value || a.name.localeCompare(b.name, 'pt-BR'));

  // sorteio entre quem concluiu todas as missões da campanha, com semente guardada para poder ser auditado
  const allDone = sellers.filter((s) => (totals.get(s.id)?.missions ?? 0) >= missions.length && missions.length > 0).sort((a, b) => a.id.localeCompare(b.id));
  const rnd = mulberry32(seed);
  const drawn = allDone.length ? allDone[Math.floor(rnd() * allDone.length)] : null;

  const pending = await db.select({ id: schema.users.id }).from(schema.users).where(eq(schema.users.status, 'PENDING'));
  const [{ n: suspicious }] = await db.execute(sql`select count(*)::int as n from answers a join attempts t on a.attempt_id = t.id join missions m on t.mission_id = m.id where m.campaign_id = ${campaignId} and a.suspicious`).then((r) => r.rows as { n: number }[]);

  return {
    campaignId, computedAt: new Date().toISOString(), seed, minMissions: camp.minMissions, minUnitSellers: camp.minUnitSellers,
    sellers: sellersTop, units: unitsTop, distributors: distTop, evolved: evolved.slice(0, 3),
    draw: { eligibleCount: allDone.length, winner: drawn ? { id: drawn.id, name: drawn.name, org: orgOf(drawn) } : null },
    eligibility: eligibility.slice(0, 200),
    checks: { pendingRegistrations: pending.length, suspiciousAnswers: Number(suspicious), outOfRace: sellers.length - eligible.length },
  };
}
import { sql } from 'drizzle-orm';

export type Standings = Awaited<ReturnType<typeof computeStandings>>;

export async function closeApuracao(campaignId: string) {
  const [camp] = await db.select().from(schema.campaigns).where(eq(schema.campaigns.id, campaignId));
  if (!camp) throw new AdminError('NOT_FOUND', 'Campanha não encontrada.');
  const missions = await db.select().from(schema.missions).where(eq(schema.missions.campaignId, campaignId));
  const last = missions.reduce((m, x) => (x.closesAt > m ? x.closesAt : m), new Date(0));
  if (!missions.length || last > new Date()) throw new AdminError('EARLY', `A apuração só abre depois que a última missão termina (${last.toLocaleDateString('pt-BR')}).`);
  const [ex] = await db.select().from(schema.closures).where(eq(schema.closures.campaignId, campaignId));
  if (ex) throw new AdminError('DONE', 'A apuração já foi fechada e não muda.');
  const payload = await computeStandings(campaignId);
  await db.insert(schema.closures).values({ campaignId, payload });
  await db.update(schema.campaigns).set({ status: 'CLOSED' }).where(eq(schema.campaigns.id, campaignId));
  return payload;
}

export async function publishWinners(campaignId: string) {
  const [cl] = await db.select().from(schema.closures).where(eq(schema.closures.campaignId, campaignId));
  if (!cl) throw new AdminError('NOT_CLOSED', 'Feche a apuração antes de publicar.');
  if (cl.publishedAt) throw new AdminError('PUBLISHED', 'Os vencedores já foram publicados.');
  const p = cl.payload as Standings;
  const ids = new Set<string>([...p.sellers.map((s) => s.id), ...(p.draw.winner ? [p.draw.winner.id] : []), ...p.evolved.map((e) => e.id)]);
  const users = ids.size ? await db.select().from(schema.users).where(inArray(schema.users.id, [...ids])) : [];
  const [tpl] = await db.select().from(schema.waTemplates).where(eq(schema.waTemplates.name, 'vencedores_campanha'));
  let notified = 0;
  if (tpl?.status === 'APPROVED') {
    const prov = await getProvider();
    for (const u of users) if (contactOf(u) && u.consentAt && !u.optOutAt && (await prov.sendTemplate(contactOf(u)!, 'vencedores_campanha', [u.name.split(' ')[0]])).ok) notified++;
  }
  await db.update(schema.closures).set({ publishedAt: new Date() }).where(eq(schema.closures.id, cl.id));
  return { notified, winners: users.length };
}
