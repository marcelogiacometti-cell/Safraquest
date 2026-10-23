import { and, eq, inArray } from 'drizzle-orm';
import { db, schema } from '@/db';
import { type Actor, visibleDistributorIds } from './access';
import { loadAttemptScores, orgNames, type AttemptScore } from './stats';

export type Filters = { campaignId: string; regionalId?: string | null; type?: 'COOPERATIVA' | 'REVENDA' | null };

/** Relatório de efetividade da campanha, já restrito ao que o perfil pode enxergar. */
export async function campaignEffectiveness(actor: Actor, f: Filters) {
  const [camp] = await db.select().from(schema.campaigns).where(eq(schema.campaigns.id, f.campaignId));
  if (!camp) return null;
  const missions = (await db.select().from(schema.missions).where(eq(schema.missions.campaignId, f.campaignId))).sort((a, b) => a.number - b.number);
  const names = await orgNames();
  const allowed = await visibleDistributorIds(actor);
  let dists = names.distRows.filter((d) => allowed === null || allowed.includes(d.id));
  if (f.regionalId) dists = dists.filter((d) => d.regionalId === f.regionalId);
  if (f.type) dists = dists.filter((d) => d.type === f.type);
  const distIds = dists.map((d) => d.id);
  const sellers = distIds.length
    ? await db.select().from(schema.users).where(and(inArray(schema.users.distributorId, distIds), eq(schema.users.role, 'VENDEDOR'), eq(schema.users.status, 'ACTIVE')))
    : [];
  const sellerIds = new Set(sellers.map((s) => s.id));
  const scores = (await loadAttemptScores({ campaignId: f.campaignId })).filter((s) => sellerIds.has(s.userId));
  const qs = await db.select().from(schema.questions).where(eq(schema.questions.campaignId, f.campaignId));
  const qPerMission = new Map<string, number>();
  for (const q of qs) qPerMission.set(q.missionId, (qPerMission.get(q.missionId) ?? 0) + 1);
  const now = new Date();

  const weeks = missions.map((m) => {
    const list = scores.filter((s) => s.missionId === m.id);
    const done = list.filter((s) => s.finished);
    const started = m.opensAt <= now;
    const hits = done.reduce((a, s) => a + s.hits, 0);
    const total = done.length * (qPerMission.get(m.id) ?? 0);
    return {
      number: m.number, started, opened: list.length, finished: done.length,
      participation: started && sellers.length ? Math.round((done.length / sellers.length) * 100) : null,
      hitRate: started && total ? Math.round((hits / total) * 100) : null,
    };
  });
  const played = weeks.filter((w) => w.hitRate !== null);
  const funnel = {
    invited: sellers.length,
    withConsent: sellers.filter((s) => s.consentAt && !s.optOutAt).length,
    opened: new Set(scores.map((s) => s.userId)).size,
    finished: new Set(scores.filter((s) => s.finished).map((s) => s.userId)).size,
    above70: 0,
  };
  const perUser = new Map<string, { hits: number; q: number }>();
  for (const s of scores.filter((x) => x.finished)) { const p = perUser.get(s.userId) ?? { hits: 0, q: 0 }; p.hits += s.hits; p.q += qPerMission.get(s.missionId) ?? 0; perUser.set(s.userId, p); }
  funnel.above70 = [...perUser.values()].filter((p) => p.q && p.hits / p.q >= 0.7).length;

  const lastStarted = [...weeks].reverse().find((w) => w.started);
  const currentMission = lastStarted ? missions.find((m) => m.number === lastStarted.number) : null;
  const curScores = currentMission ? scores.filter((s) => s.missionId === currentMission.id) : [];

  const partByDist = dists.map((d) => {
    const ds = sellers.filter((s) => s.distributorId === d.id);
    const fin = ds.filter((s) => curScores.some((c) => c.userId === s.id && c.finished)).length;
    return { id: d.id, name: d.name, type: d.type, regionalId: d.regionalId, sellers: ds.length, finished: fin, participation: ds.length ? Math.round((fin / ds.length) * 100) : 0 };
  });
  const group = (label: string, pred: (d: (typeof partByDist)[number]) => boolean) => {
    const g = partByDist.filter(pred); const s = g.reduce((a, d) => a + d.sellers, 0); const fin = g.reduce((a, d) => a + d.finished, 0);
    return { label, distributors: g.length, sellers: s, participation: s ? Math.round((fin / s) * 100) : 0 };
  };
  const reg = new Map((await db.select().from(schema.regionals)).map((r) => [r.id, r.name]));

  // acerto por tema e perguntas mais erradas
  const ans = qs.length ? await db.select({ qid: schema.answers.questionId, correct: schema.answers.correct, uid: schema.attempts.userId })
    .from(schema.answers).innerJoin(schema.attempts, eq(schema.answers.attemptId, schema.attempts.id)).where(inArray(schema.answers.questionId, qs.map((q) => q.id))) : [];
  const ansIn = ans.filter((a) => sellerIds.has(a.uid));
  const byQ = qs.map((q) => {
    const a = ansIn.filter((x) => x.qid === q.id); const hit = a.filter((x) => x.correct).length;
    const mn = missions.find((m) => m.id === q.missionId)?.number ?? 0;
    return { id: q.id, text: q.text, topic: q.topic, week: mn, answers: a.length, rate: a.length ? Math.round((hit / a.length) * 100) : null as number | null, hits: hit };
  }).filter((x) => x.answers > 0);
  const topicMap = new Map<string, { hits: number; n: number }>();
  for (const q of byQ) { const t = topicMap.get(q.topic) ?? { hits: 0, n: 0 }; t.hits += q.hits; t.n += q.answers; topicMap.set(q.topic, t); }
  const themes = [...topicMap.entries()].map(([topic, t]) => ({ topic, rate: Math.round((t.hits / t.n) * 100) })).sort((a, b) => b.rate - a.rate);
  const hardest = [...byQ].sort((a, b) => (a.rate ?? 0) - (b.rate ?? 0)).slice(0, 4);

  const overallHits = played.length ? Math.round(played.reduce((a, w) => a + (w.hitRate ?? 0), 0) / played.length) : null;
  return {
    campaign: camp, weeks, played: played.length, totalWeeks: missions.length,
    kpis: {
      reached: sellers.length, distributors: dists.length,
      participationNow: lastStarted?.participation ?? null,
      participationDelta: played.length > 1 && weeks[0].participation !== null && lastStarted?.participation != null ? lastStarted.participation - weeks[0].participation : null,
      hitRate: overallHits,
      hitGain: played.length > 1 ? (played[played.length - 1].hitRate ?? 0) - (played[0].hitRate ?? 0) : null,
    },
    funnel, themes, hardest,
    groups: [
      group('Cooperativas', (d) => d.type === 'COOPERATIVA'),
      group('Revendas Sul', (d) => d.type === 'REVENDA' && reg.get(d.regionalId) === 'Sul'),
      group('Revendas Norte', (d) => d.type === 'REVENDA' && reg.get(d.regionalId) === 'Norte'),
    ].filter((g) => g.distributors > 0),
    lowDistributors: [...partByDist].filter((d) => d.sellers > 0).sort((a, b) => a.participation - b.participation).slice(0, 4),
    channels: partByDist,
  };
}
export type { AttemptScore };
