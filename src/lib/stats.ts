import { and, eq, inArray, sql } from 'drizzle-orm';
import { db, schema } from '@/db';
import { attemptScore, type ScoreRules } from './scoring';

export type AttemptScore = {
  attemptId: string; missionId: string; campaignId: string; userId: string;
  points: number; hits: number; answered: number; timeMs: number; finished: boolean; finishedAt: Date | null;
};

/** Pontuação de todas as tentativas. Recalculada na hora: corrigir ou anular uma pergunta muda o ranking sozinho. */
export async function loadAttemptScores(filter?: { campaignId?: string; missionId?: string; userIds?: string[] }): Promise<AttemptScore[]> {
  const conds = [];
  if (filter?.campaignId) conds.push(eq(schema.missions.campaignId, filter.campaignId));
  if (filter?.missionId) conds.push(eq(schema.attempts.missionId, filter.missionId));
  if (filter?.userIds) { if (!filter.userIds.length) return []; conds.push(inArray(schema.attempts.userId, filter.userIds)); }
  const atts = await db.select({
    id: schema.attempts.id, missionId: schema.attempts.missionId, userId: schema.attempts.userId,
    finishedAt: schema.attempts.finishedAt, campaignId: schema.missions.campaignId,
  }).from(schema.attempts).innerJoin(schema.missions, eq(schema.attempts.missionId, schema.missions.id))
    .where(conds.length ? and(...conds) : undefined);
  if (!atts.length) return [];
  const missionIds = [...new Set(atts.map((a) => a.missionId))];
  const campaignIds = [...new Set(atts.map((a) => a.campaignId))];
  const [qs, camps, ans] = await Promise.all([
    db.select().from(schema.questions).where(inArray(schema.questions.missionId, missionIds)),
    db.select().from(schema.campaigns).where(inArray(schema.campaigns.id, campaignIds)),
    db.select().from(schema.answers).where(inArray(schema.answers.attemptId, atts.map((a) => a.id))),
  ]);
  const qByMission = new Map<string, typeof qs>();
  for (const q of qs) { const l = qByMission.get(q.missionId) ?? []; l.push(q); qByMission.set(q.missionId, l); }
  const campById = new Map(camps.map((c) => [c.id, c]));
  const ansByAttempt = new Map<string, typeof ans>();
  for (const a of ans) { const l = ansByAttempt.get(a.attemptId) ?? []; l.push(a); ansByAttempt.set(a.attemptId, l); }
  return atts.map((a) => {
    const c = campById.get(a.campaignId)!;
    const rules: ScoreRules = { pointsPerHit: c.pointsPerHit, completionBonus: c.completionBonus, speedBonus: c.speedBonus };
    const list = ansByAttempt.get(a.id) ?? [];
    const s = attemptScore(
      (qByMission.get(a.missionId) ?? []).map((q) => ({ id: q.id, points: q.points, timeLimit: q.timeLimit, voided: q.voided })),
      list.map((x) => ({ questionId: x.questionId, correct: x.correct, timeMs: x.timeMs })),
      !!a.finishedAt, rules,
    );
    return { attemptId: a.id, missionId: a.missionId, campaignId: a.campaignId, userId: a.userId, points: s.points, hits: s.hits, answered: list.length, timeMs: s.totalTimeMs, finished: !!a.finishedAt, finishedAt: a.finishedAt };
  });
}

export type Person = { id: string; name: string; role: string; distributorId: string | null; unitId: string | null };
export type Totals = { points: number; timeMs: number; missions: number; hits: number; answered: number };

export function totalsByUser(scores: AttemptScore[]): Map<string, Totals> {
  const m = new Map<string, Totals>();
  for (const s of scores) {
    const t = m.get(s.userId) ?? { points: 0, timeMs: 0, missions: 0, hits: 0, answered: 0 };
    t.points += s.points; t.timeMs += s.timeMs; t.hits += s.hits; t.answered += s.answered;
    if (s.finished) t.missions += 1;
    m.set(s.userId, t);
  }
  return m;
}

const ZERO: Totals = { points: 0, timeMs: 0, missions: 0, hits: 0, answered: 0 };

export type RankedPerson = Person & Totals & { pos: number };

/** Mais pontos primeiro; empate decidido pelo menor tempo total de resposta; depois nome. */
export function rankPeople(people: Person[], totals: Map<string, Totals>): RankedPerson[] {
  const rows = people.map((p) => ({ ...p, ...(totals.get(p.id) ?? ZERO) }));
  rows.sort((a, b) => b.points - a.points || (a.points === 0 && b.points === 0 ? 0 : a.timeMs - b.timeMs) || a.name.localeCompare(b.name, 'pt-BR'));
  return rows.map((r, i) => ({ ...r, pos: i + 1 }));
}

export async function activeSellers(): Promise<(Person & { regionalId: string | null })[]> {
  const rows = await db.select({
    id: schema.users.id, name: schema.users.name, role: schema.users.role,
    distributorId: schema.users.distributorId, unitId: schema.users.unitId, regionalId: schema.distributors.regionalId,
  }).from(schema.users).leftJoin(schema.distributors, eq(schema.users.distributorId, schema.distributors.id))
    .where(and(eq(schema.users.role, 'VENDEDOR'), eq(schema.users.status, 'ACTIVE')));
  return rows;
}

export type GroupStanding = { id: string; name: string; sellers: number; participants: number; avgPoints: number; pos: number; insufficient?: boolean; type?: string };

/** Média de pontos por vendedor ativo, para que distribuidores pequenos não saiam em desvantagem. */
export function standByGroup(
  people: Person[], totals: Map<string, Totals>, keyOf: (p: Person) => string | null,
  names: Map<string, { name: string; type?: string }>, minParticipants = 0,
): GroupStanding[] {
  const acc = new Map<string, { sellers: number; participants: number; points: number }>();
  for (const p of people) {
    const k = keyOf(p); if (!k) continue;
    const a = acc.get(k) ?? { sellers: 0, participants: 0, points: 0 };
    a.sellers += 1;
    const t = totals.get(p.id);
    if (t && (t.answered > 0)) a.participants += 1;
    a.points += t?.points ?? 0;
    acc.set(k, a);
  }
  const list = [...acc.entries()].map(([id, a]) => ({
    id, name: names.get(id)?.name ?? id, type: names.get(id)?.type, sellers: a.sellers, participants: a.participants,
    avgPoints: a.sellers ? Math.round(a.points / a.sellers) : 0, insufficient: a.participants < minParticipants,
  }));
  const ok = list.filter((x) => !x.insufficient).sort((a, b) => b.avgPoints - a.avgPoints || a.name.localeCompare(b.name, 'pt-BR'));
  const bad = list.filter((x) => x.insufficient).sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
  return [...ok.map((x, i) => ({ ...x, pos: i + 1 })), ...bad.map((x) => ({ ...x, pos: 0 }))];
}

export async function orgNames() {
  const [d, u] = await Promise.all([db.select().from(schema.distributors), db.select().from(schema.units)]);
  return {
    dist: new Map(d.map((x) => [x.id, { name: x.name, type: x.type as string }])),
    unit: new Map(u.map((x) => [x.id, { name: x.name, type: undefined as string | undefined }])),
    distRows: d, unitRows: u,
  };
}

export type SeasonScope = { kind: 'season' } | { kind: 'mission'; missionId: string } | { kind: 'campaign'; campaignId: string };

export async function scoresFor(scope: SeasonScope): Promise<AttemptScore[]> {
  if (scope.kind === 'mission') return loadAttemptScores({ missionId: scope.missionId });
  if (scope.kind === 'campaign') return loadAttemptScores({ campaignId: scope.campaignId });
  return loadAttemptScores();
}

export type SellerRankings = {
  general: RankedPerson[]; myGeneral: RankedPerson | null;
  distributors: GroupStanding[]; myDistributorStanding: GroupStanding | null;
  inDistributor: RankedPerson[]; myInDistributor: RankedPerson | null;
  units: GroupStanding[]; inUnit: RankedPerson[]; myInUnit: RankedPerson | null;
  total: number;
};

/** Tudo o que o vendedor pode ver. Nunca devolve gente de outro distribuidor fora do ranking geral. */
export async function sellerRankings(userId: string, scope: SeasonScope, overrideTotals?: Map<string, Totals>): Promise<SellerRankings> {
  const sellers = await activeSellers();
  const me = sellers.find((s) => s.id === userId) ?? null;
  const totals = overrideTotals ?? totalsByUser(await scoresFor(scope));
  const names = await orgNames();
  const general = rankPeople(sellers, totals);
  const myGeneral = general.find((g) => g.id === userId) ?? null;
  const distributors = standByGroup(sellers, totals, (p) => p.distributorId, names.dist);
  const myDistributorStanding = me?.distributorId ? distributors.find((d) => d.id === me.distributorId) ?? null : null;
  const mine = me?.distributorId ? sellers.filter((s) => s.distributorId === me.distributorId) : [];
  const inDistributor = rankPeople(mine, totals);
  const myInDistributor = inDistributor.find((g) => g.id === userId) ?? null;
  const units = standByGroup(mine, totals, (p) => p.unitId, names.unit, 3);
  const inUnit = rankPeople(mine.filter((s) => s.unitId === me?.unitId), totals);
  const myInUnit = inUnit.find((g) => g.id === userId) ?? null;
  return { general, myGeneral, distributors, myDistributorStanding, inDistributor, myInDistributor, units, inUnit, myInUnit, total: sellers.length };
}

/** Top 10 + vizinhos + a própria posição, como na tela do vendedor. */
export function topAndMe(list: RankedPerson[], meId: string, topN = 5): { top: RankedPerson[]; near: RankedPerson[]; me: RankedPerson | null; gap: boolean } {
  const me = list.find((p) => p.id === meId) ?? null;
  const top = list.slice(0, topN);
  if (!me || me.pos <= topN) return { top, near: [], me: me && me.pos <= topN ? null : me, gap: false };
  const near = list.filter((p) => p.pos >= me.pos - 1 && p.pos < me.pos);
  const gap = (near[0]?.pos ?? me.pos) - topN > 1;
  return { top, near, me, gap };
}

export async function missionsOfUser(userId: string) {
  const [u] = await db.select().from(schema.users).where(eq(schema.users.id, userId));
  if (!u) return [];
  const rows = await db.select({
    id: schema.missions.id, number: schema.missions.number, opensAt: schema.missions.opensAt, closesAt: schema.missions.closesAt,
    campaignId: schema.missions.campaignId, status: schema.campaigns.status, campaignName: schema.campaigns.name, product: schema.campaigns.productName,
  }).from(schema.missions).innerJoin(schema.campaigns, eq(schema.missions.campaignId, schema.campaigns.id))
    .where(inArray(schema.campaigns.status, ['ACTIVE', 'CLOSED', 'SCHEDULED']));
  if (!rows.length) return [];
  const groupRows = await db.select().from(schema.campaignGroups);
  const members = await db.select().from(schema.channelGroupMembers);
  const campDists = new Map<string, Set<string>>();
  for (const cg of groupRows) {
    const s = campDists.get(cg.campaignId) ?? new Set<string>();
    for (const m of members) if (m.groupId === cg.groupId) s.add(m.distributorId);
    campDists.set(cg.campaignId, s);
  }
  const isRep = u.role === 'REPRESENTANTE';
  return rows.filter((m) => isRep || (u.distributorId && campDists.get(m.campaignId)?.has(u.distributorId)))
    .sort((a, b) => a.opensAt.getTime() - b.opensAt.getTime());
}
export { sql };
