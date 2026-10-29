import { and, eq, gte, inArray, sql } from 'drizzle-orm';
import { db, schema } from '@/db';
import { magicLinkPath } from './auth';
import { env } from './env';
import { inSendWindow, momentFireAt } from './schedule';
import { signToken } from './session';
import { syncCampaignStatuses } from './quiz';
import { getConfig, getProvider, contactOf } from './whatsapp/provider';

export type DispatchReport = {
  sent: number; skipped: number; failed: number; blocked: string[]; windowClosed: boolean; moments: number;
};

type Mom = typeof schema.messageMoments.$inferSelect;

async function recipientsOfCampaign(campaignId: string) {
  const groupIds = (await db.select().from(schema.campaignGroups).where(eq(schema.campaignGroups.campaignId, campaignId))).map((g) => g.groupId);
  const dists = groupIds.length
    ? (await db.select().from(schema.channelGroupMembers).where(inArray(schema.channelGroupMembers.groupId, groupIds))).map((m) => m.distributorId)
    : [];
  const sellers = dists.length
    ? await db.select().from(schema.users).where(and(inArray(schema.users.distributorId, [...new Set(dists)]), eq(schema.users.role, 'VENDEDOR'), eq(schema.users.status, 'ACTIVE')))
    : [];
  const reps = await db.select().from(schema.users).where(and(eq(schema.users.role, 'REPRESENTANTE'), eq(schema.users.status, 'ACTIVE')));
  return [...sellers, ...reps];
}

export function canReceive(u: typeof schema.users.$inferSelect, now: Date): boolean {
  if (!contactOf(u) || !u.consentAt || u.optOutAt || !u.notifyOptIn) return false;
  if (u.pausedUntil && u.pausedUntil > now) return false;
  return true;
}

async function audienceFilter(audience: string, missionId: string, prevMissionId: string | null, users: (typeof schema.users.$inferSelect)[]) {
  if (audience === 'ALL') return users;
  const atts = await db.select().from(schema.attempts).where(inArray(schema.attempts.missionId, [missionId, ...(prevMissionId ? [prevMissionId] : [])]));
  const started = new Set(atts.filter((a) => a.missionId === missionId).map((a) => a.userId));
  const finished = new Set(atts.filter((a) => a.missionId === missionId && a.finishedAt).map((a) => a.userId));
  const prevFinished = new Set(atts.filter((a) => a.missionId === prevMissionId && a.finishedAt).map((a) => a.userId));
  if (audience === 'NOT_STARTED') return users.filter((u) => !started.has(u.id));
  if (audience === 'NOT_FINISHED') return users.filter((u) => !finished.has(u.id));
  if (audience === 'FINISHED_PREVIOUS') return users.filter((u) => prevFinished.has(u.id));
  return users;
}

/** Roda a cada poucos minutos (cron). Idempotente: o mesmo vendedor nunca recebe o mesmo momento duas vezes. */
export async function dispatchDue(now = new Date()): Promise<DispatchReport> {
  await syncCampaignStatuses(now);
  const cfg = await getConfig();
  const from = cfg?.sendFrom ?? '08:00'; const until = cfg?.sendUntil ?? '19:00';
  const report: DispatchReport = { sent: 0, skipped: 0, failed: 0, blocked: [], windowClosed: false, moments: 0 };
  if (cfg?.pauseOnRed && cfg.quality === 'RED') { report.blocked.push('Qualidade do número está vermelha: envios pausados.'); return report; }
  if (!inSendWindow(now, from, until, cfg?.skipSundays ?? true)) { report.windowClosed = true; return report; }

  const camps = await db.select().from(schema.campaigns).where(inArray(schema.campaigns.status, ['ACTIVE']));
  const templates = new Map((await db.select().from(schema.waTemplates)).map((t) => [t.name, t]));
  const provider = await getProvider();
  const maxPerWeek = cfg?.maxPerWeek ?? 4;
  const weekAgo = new Date(now.getTime() - 7 * 86_400_000);

  for (const c of camps) {
    const missions = await db.select().from(schema.missions).where(eq(schema.missions.campaignId, c.id));
    missions.sort((a, b) => a.number - b.number);
    const moments = await db.select().from(schema.messageMoments).where(eq(schema.messageMoments.campaignId, c.id));
    let recipients: (typeof schema.users.$inferSelect)[] | null = null;
    for (const m of missions) {
      for (const mo of moments as Mom[]) {
        const fire = momentFireAt(m, c.openWeekday, c.everyWeeks, mo);
        // janela de 6 h depois do horário combinado, para tolerar atraso do cron sem enviar fora de hora
        if (now < fire || now.getTime() - fire.getTime() > 6 * 3_600_000) continue;
        const tpl = templates.get(mo.templateName);
        if (!tpl || tpl.status !== 'APPROVED') { report.blocked.push(`Modelo ${mo.templateName} não está aprovado na Meta.`); continue; }
        report.moments++;
        recipients ??= await recipientsOfCampaign(c.id);
        const prev = missions.find((x) => x.number === m.number - 1) ?? null;
        const base = recipients.filter((u) => canReceive(u, now));
        const audience = await audienceFilter(mo.audience, m.id, prev?.id ?? null, base);
        // o resultado da missão N sai na semana seguinte; para ele, "missão" é a anterior
        for (const u of audience) {
          const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(schema.messageLogs)
            .where(and(eq(schema.messageLogs.userId, u.id), gte(schema.messageLogs.createdAt, weekAgo), sql`${schema.messageLogs.status} <> 'SKIPPED'`, sql`${schema.messageLogs.templateName} <> 'codigo_acesso'`));
          const ins = await db.insert(schema.messageLogs).values({
            userId: u.id, missionId: m.id, momentId: mo.id, kind: mo.kind, templateName: mo.templateName,
            status: n >= maxPerWeek ? 'SKIPPED' : 'QUEUED', error: n >= maxPerWeek ? 'limite semanal de mensagens' : null,
          }).onConflictDoNothing().returning();
          let row = ins[0];
          if (!row) {
            // já existe: só reprocessa se ficou na fila (queda no meio do envio ou "reenviar falhas")
            const [ex] = await db.select().from(schema.messageLogs).where(and(eq(schema.messageLogs.userId, u.id), eq(schema.messageLogs.missionId, m.id), eq(schema.messageLogs.momentId, mo.id)));
            if (!ex || ex.status !== 'QUEUED') continue;
            row = ex;
          }
          if (n >= maxPerWeek && row.status === 'QUEUED' && row.error === 'limite semanal de mensagens') { report.skipped++; continue; }
          if (n >= maxPerWeek && ins[0]) { report.skipped++; continue; }
          const token = await signToken({ uid: u.id, kind: 'magic', mid: m.id }, Math.max(3600, Math.floor((m.closesAt.getTime() - now.getTime()) / 1000) + 86_400));
          const first = u.name.split(' ')[0];
          const params = paramsFor(mo, first, c.productName, magicLinkPath(token));
          const res = await provider.sendTemplate(contactOf(u)!, mo.templateName, params);
          if (res.ok) {
            await db.update(schema.messageLogs).set({ status: 'SENT', waMessageId: res.id, sentAt: new Date() }).where(eq(schema.messageLogs.id, row.id));
            report.sent++;
          } else {
            await db.update(schema.messageLogs).set({ status: 'FAILED', error: res.error }).where(eq(schema.messageLogs.id, row.id));
            report.failed++;
          }
        }
      }
    }
  }
  return report;
}

function paramsFor(mo: Mom, firstName: string, product: string, link: string): string[] {
  if (mo.kind === 'RESULT') return [firstName, link];
  return [firstName, product, link];
}

/** Reenvia as mensagens que falharam (botão do painel). */
export async function retryFailed(): Promise<number> {
  const rows = await db.select().from(schema.messageLogs).where(eq(schema.messageLogs.status, 'FAILED'));
  return rows.length ? (await db.update(schema.messageLogs).set({ status: 'QUEUED', error: null }).where(eq(schema.messageLogs.status, 'FAILED')).returning()).length : 0;
}
export { env };
