import { db, schema } from '@/db';
import { type Actor, visibleDistributorIds } from './access';
import { activeSellers, orgNames, rankPeople, scoresFor, standByGroup, totalsByUser, type SeasonScope } from './stats';

export type RankFilters = { campaignId?: string | null; regionalId?: string | null; type?: 'COOPERATIVA' | 'REVENDA' | null };

/** Ranking gerencial (vendedores, distribuidores, filiais e regionais), restrito ao que o perfil enxerga. */
export async function panelRanking(actor: Actor, f: RankFilters) {
  const scope: SeasonScope = f.campaignId ? { kind: 'campaign', campaignId: f.campaignId } : { kind: 'season' };
  const names = await orgNames();
  const allowed = await visibleDistributorIds(actor);
  const regs = new Map((await db.select().from(schema.regionals)).map((r) => [r.id, r.name]));
  let dists = names.distRows.filter((d) => allowed === null || allowed.includes(d.id));
  if (f.regionalId) dists = dists.filter((d) => d.regionalId === f.regionalId);
  if (f.type) dists = dists.filter((d) => d.type === f.type);
  const ids = new Set(dists.map((d) => d.id));
  const people = (await activeSellers()).filter((p) => p.distributorId && ids.has(p.distributorId));
  const scores = (await scoresFor(scope)).filter((s) => people.some((p) => p.id === s.userId));
  const totals = totalsByUser(scores);
  const [camp] = f.campaignId ? (await db.select().from(schema.campaigns)).filter((c) => c.id === f.campaignId) : [];
  const minUnit = camp?.minUnitSellers ?? 3;

  const distRow = new Map(dists.map((d) => [d.id, d]));
  const sellers = rankPeople(people, totals).map((p) => ({
    pos: p.pos, name: p.name, distributor: names.dist.get(p.distributorId!)?.name ?? '', unit: p.unitId ? names.unit.get(p.unitId)?.name ?? '' : '',
    regional: regs.get(distRow.get(p.distributorId!)?.regionalId ?? '') ?? '', points: p.points, missions: p.missions,
    hitRate: p.answered ? Math.round((p.hits / p.answered) * 100) : null, timeMs: p.timeMs, played: p.answered > 0,
  }));
  const distributors = standByGroup(people, totals, (p) => p.distributorId, names.dist).map((g) => ({ ...g, regional: regs.get(distRow.get(g.id)?.regionalId ?? '') ?? '' }));
  const unitDist = new Map(names.unitRows.map((u) => [u.id, u.distributorId]));
  const units = standByGroup(people, totals, (p) => p.unitId, names.unit, minUnit).map((g) => ({ ...g, distributor: names.dist.get(unitDist.get(g.id) ?? '')?.name ?? '' }));
  const regionals = standByGroup(people, totals, (p) => (p as { regionalId?: string | null }).regionalId ?? null, new Map([...regs].map(([id, name]) => [id, { name }])));
  const campaigns = (await db.select().from(schema.campaigns)).sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()).map((c) => ({ id: c.id, name: c.name }));
  return { sellers, distributors, units, regionals, minUnit, campaigns, campaignName: camp?.name ?? null, totalSellers: people.length, participants: sellers.filter((s) => s.played).length, regionalOptions: [...regs].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name, 'pt-BR')) };
}
