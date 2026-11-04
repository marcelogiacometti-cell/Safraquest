import { and, eq, gte, inArray, sql } from 'drizzle-orm';
import { db, schema } from '@/db';
import { type Actor, visibleDistributorIds } from './access';
import { campaignEffectiveness } from './effectiveness';

const DAY = 86_400_000;

/** Painel gerencial da tela Resumo, já restrito ao que o perfil enxerga. */
export async function managerDashboard(actor: Actor) {
  const now = new Date();
  const since7 = new Date(now.getTime() - 7 * DAY);
  const vis = await visibleDistributorIds(actor);
  const allUsers = await db.select().from(schema.users);
  const users = allUsers.filter((u) => vis === null || (u.distributorId && vis.includes(u.distributorId)));
  const sellers = users.filter((u) => u.role === 'VENDEDOR');
  const activeSellers = sellers.filter((u) => u.status === 'ACTIVE');
  const scopeIds = new Set(users.map((u) => u.id));

  // atividade = iniciou um quiz ou respondeu pergunta (últimas 6 semanas)
  const since42 = new Date(now.getTime() - 42 * DAY);
  const a1 = await db.select({ uid: schema.attempts.userId, at: schema.attempts.startedAt }).from(schema.attempts).where(gte(schema.attempts.startedAt, since42));
  const a2 = await db.select({ uid: schema.attempts.userId, at: schema.answers.createdAt }).from(schema.answers)
    .innerJoin(schema.attempts, eq(schema.answers.attemptId, schema.attempts.id)).where(gte(schema.answers.createdAt, since42));
  const events = [...a1, ...a2].filter((e) => scopeIds.has(e.uid));
  const activeSet = new Set(events.filter((e) => e.at >= since7).map((e) => e.uid));
  const active7 = activeSellers.filter((u) => activeSet.has(u.id));
  const weekly = Array.from({ length: 6 }, (_, i) => {
    const from = new Date(now.getTime() - (6 - i) * 7 * DAY), to = new Date(now.getTime() - (5 - i) * 7 * DAY);
    const ids = new Set(events.filter((e) => e.at >= from && e.at < to && sellers.some((s) => s.id === e.uid)).map((e) => e.uid));
    return { label: `${String(to.getDate()).padStart(2, '0')}/${String(to.getMonth() + 1).padStart(2, '0')}`, n: ids.size };
  });

  const dists = (await db.select().from(schema.distributors)).filter((d) => vis === null || vis.includes(d.id));
  const regs = new Map((await db.select().from(schema.regionals)).map((r) => [r.id, r.name]));
  const byReg = [...regs.entries()].map(([rid, name]) => {
    const ds = dists.filter((d) => d.regionalId === rid).map((d) => d.id);
    const s = activeSellers.filter((u) => u.distributorId && ds.includes(u.distributorId));
    return { name, distributors: ds.length, sellers: s.length, active7: s.filter((u) => activeSet.has(u.id)).length };
  }).filter((r) => r.distributors > 0).sort((a, b) => b.sellers - a.sellers);
  const byDist = dists.map((d) => {
    const s = activeSellers.filter((u) => u.distributorId === d.id);
    return { name: d.name, type: d.type, sellers: s.length, active7: s.filter((u) => activeSet.has(u.id)).length };
  });
  const inactiveDists = byDist.filter((d) => d.sellers > 0).sort((a, b) => a.active7 / a.sellers - b.active7 / b.sellers).slice(0, 5);
  const noSellers = byDist.filter((d) => d.sellers === 0).length;

  const roles = (['VENDEDOR', 'GESTOR', 'REPRESENTANTE', 'MARKETING', 'REGIONAL', 'DIRETORIA'] as const)
    .map((r) => ({ role: r, n: users.filter((u) => u.role === r && u.status === 'ACTIVE').length })).filter((r) => r.n > 0);

  // campanhas em andamento
  const camps = (await db.select().from(schema.campaigns)).filter((c) => c.status === 'ACTIVE' || c.status === 'SCHEDULED');
  const campaigns = [];
  for (const c of camps) {
    const eff = await campaignEffectiveness(actor, { campaignId: c.id });
    campaigns.push({
      id: c.id, name: c.name, product: c.productName, status: c.status,
      week: eff ? eff.weeks.filter((w) => w.started).length : 0, totalWeeks: eff?.totalWeeks ?? 0,
      reached: eff?.kpis.reached ?? 0, participation: eff?.kpis.participationNow ?? null, hitRate: eff?.kpis.hitRate ?? null,
      finishedUsers: eff?.funnel.finished ?? 0,
    });
  }
  const closed = (await db.select({ n: sql<number>`count(*)::int` }).from(schema.campaigns).where(eq(schema.campaigns.status, 'CLOSED')))[0].n;

  const isMkt = actor.role === 'MARKETING';
  let health: null | { sent7: number; failed7: number; queued: number; reportsOpen: number; pending: number; codes7: number; lastSendAt: Date | null } = null;
  if (isMkt) {
    const logs = await db.select({ status: schema.messageLogs.status, at: schema.messageLogs.createdAt, sentAt: schema.messageLogs.sentAt }).from(schema.messageLogs).where(gte(schema.messageLogs.createdAt, since7));
    const [q] = await db.select({ n: sql<number>`count(*)::int` }).from(schema.messageLogs).where(eq(schema.messageLogs.status, 'QUEUED'));
    const [rp] = await db.select({ n: sql<number>`count(*)::int` }).from(schema.questionReports).where(inArray(schema.questionReports.status, ['OPEN', 'REVIEW']));
    const [cd] = await db.select({ n: sql<number>`count(*)::int` }).from(schema.loginCodes).where(gte(schema.loginCodes.createdAt, since7));
    const sentDates = logs.filter((l) => l.sentAt).map((l) => l.sentAt as Date).sort((a, b) => b.getTime() - a.getTime());
    health = {
      sent7: logs.filter((l) => ['SENT', 'DELIVERED', 'READ'].includes(l.status)).length,
      failed7: logs.filter((l) => l.status === 'FAILED').length,
      queued: q.n, reportsOpen: rp.n, pending: allUsers.filter((u) => u.status === 'PENDING').length, codes7: cd.n,
      lastSendAt: sentDates[0] ?? null,
    };
  }

  const new7 = sellers.filter((u) => u.createdAt >= since7 && u.status !== 'REJECTED').length;
  return {
    users: {
      sellersActive: activeSellers.length, sellersPending: sellers.filter((u) => u.status === 'PENDING').length,
      sellersLeft: sellers.filter((u) => u.status === 'LEFT' || u.optOutAt).length,
      active7: active7.length, active7Pct: activeSellers.length ? Math.round((active7.length / activeSellers.length) * 100) : 0,
      new7, total: users.filter((u) => u.status === 'ACTIVE').length,
    },
    weekly, byReg, inactiveDists, noSellers, roles, distributors: dists.length,
    campaigns, closed, health,
  };
}
