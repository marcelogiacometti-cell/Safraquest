import { and, asc, eq, inArray, sql } from 'drizzle-orm';
import { db, schema } from '@/db';
import { type Actor, canApprove, canCreateInvite, type Role } from './access';
import { randomToken } from './crypto';
import { env } from './env';
import { DEFAULT_MOMENTS, planMissions } from './schedule';
import { getProvider, contactOf } from './whatsapp/provider';

export const QUESTIONS_PER_MISSION = 5;

export class AdminError extends Error {
  constructor(public code: string, msg: string) { super(msg); }
}

// ---------------------------------------------------------------- campanhas

export type CampaignInput = {
  name: string; productName: string; objective?: string | null; materialUrl?: string | null;
  startDate?: Date | null; endDate?: Date | null; everyWeeks?: number; pointsPerHit?: number; completionBonus?: number;
  speedBonus?: boolean; minMissions?: number; minUnitSellers?: number; tiebreak?: string; openWeekday?: number; openTime?: string;
};

export async function saveCampaign(id: string | null, input: CampaignInput) {
  if (!input.name?.trim()) throw new AdminError('NAME', 'Dê um nome à campanha.');
  if (!input.productName?.trim()) throw new AdminError('PRODUCT', 'Informe o produto lançamento.');
  if (input.startDate && input.endDate && input.endDate < input.startDate) throw new AdminError('DATES', 'A data final precisa ser depois da inicial.');
  const values = { ...input, name: input.name.trim(), productName: input.productName.trim() };
  let campaignId = id;
  if (id) {
    const [c] = await db.select().from(schema.campaigns).where(eq(schema.campaigns.id, id));
    if (!c) throw new AdminError('NOT_FOUND', 'Campanha não encontrada.');
    if (c.status === 'CLOSED') throw new AdminError('CLOSED', 'Campanha encerrada não pode ser editada.');
    await db.update(schema.campaigns).set(values).where(eq(schema.campaigns.id, id));
  } else {
    const [c] = await db.insert(schema.campaigns).values(values).returning();
    campaignId = c.id;
    await ensureDefaultMoments(c.id);
  }
  await ensureMissions(campaignId!);
  return campaignId!;
}

export async function ensureDefaultMoments(campaignId: string) {
  const ex = await db.select({ id: schema.messageMoments.id }).from(schema.messageMoments).where(eq(schema.messageMoments.campaignId, campaignId));
  if (ex.length) return;
  await db.insert(schema.messageMoments).values(DEFAULT_MOMENTS.map((m) => ({ ...m, campaignId })));
}

/** Cria as missões a partir das datas. Missões que já têm respostas nunca são apagadas. */
export async function ensureMissions(campaignId: string) {
  const [c] = await db.select().from(schema.campaigns).where(eq(schema.campaigns.id, campaignId));
  if (!c.startDate || !c.endDate) return [];
  const plan = planMissions({ start: c.startDate, end: c.endDate, everyWeeks: c.everyWeeks, openTime: c.openTime });
  const existing = await db.select().from(schema.missions).where(eq(schema.missions.campaignId, campaignId));
  for (const p of plan) {
    const ex = existing.find((e) => e.number === p.number);
    if (ex) await db.update(schema.missions).set({ opensAt: p.opensAt, closesAt: p.closesAt }).where(eq(schema.missions.id, ex.id));
    else await db.insert(schema.missions).values({ campaignId, ...p });
  }
  for (const ex of existing.filter((e) => e.number > plan.length)) {
    const [att] = await db.select({ id: schema.attempts.id }).from(schema.attempts).where(eq(schema.attempts.missionId, ex.id)).limit(1);
    if (!att) await db.delete(schema.missions).where(eq(schema.missions.id, ex.id));
  }
  return plan;
}

export async function setCampaignGroups(campaignId: string, groupIds: string[]) {
  await db.delete(schema.campaignGroups).where(eq(schema.campaignGroups.campaignId, campaignId));
  if (groupIds.length) await db.insert(schema.campaignGroups).values(groupIds.map((groupId) => ({ campaignId, groupId })));
}

export type QuestionInput = {
  missionId: string; text: string; options: string[]; correct: number; explanation?: string | null;
  timeLimit?: number; points?: number | null; topic?: string; difficulty?: string;
};

export function validateQuestion(q: QuestionInput) {
  if (!q.text?.trim()) throw new AdminError('Q_TEXT', 'Escreva o enunciado.');
  const opts = (q.options ?? []).map((o) => o.trim());
  if (opts.length < 2 || opts.length > 4 || opts.some((o) => !o)) throw new AdminError('Q_OPTS', 'Preencha de 2 a 4 alternativas.');
  if (new Set(opts.map((o) => o.toLowerCase())).size !== opts.length) throw new AdminError('Q_DUP', 'Há alternativas repetidas.');
  if (!Number.isInteger(q.correct) || q.correct < 0 || q.correct >= opts.length) throw new AdminError('Q_CORRECT', 'Marque a alternativa correta.');
  return opts;
}

export async function saveQuestion(questionId: string | null, q: QuestionInput) {
  const options = validateQuestion(q);
  const [m] = await db.select().from(schema.missions).where(eq(schema.missions.id, q.missionId));
  if (!m) throw new AdminError('MISSION', 'Missão não encontrada.');
  const [c] = await db.select().from(schema.campaigns).where(eq(schema.campaigns.id, m.campaignId));
  if (c.status === 'CLOSED') throw new AdminError('CLOSED', 'Campanha encerrada.');
  const base = {
    text: q.text.trim(), options, correct: q.correct, explanation: q.explanation ?? null, timeLimit: q.timeLimit ?? 30,
    points: q.points ?? null, topic: q.topic ?? 'Diferenciais do produto', difficulty: q.difficulty ?? 'Média',
  };
  if (questionId) {
    const [ex] = await db.select().from(schema.questions).where(eq(schema.questions.id, questionId));
    if (!ex) throw new AdminError('NOT_FOUND', 'Pergunta não encontrada.');
    await db.update(schema.questions).set(base).where(eq(schema.questions.id, questionId));
    return questionId;
  }
  const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(schema.questions).where(eq(schema.questions.missionId, q.missionId));
  if (n >= QUESTIONS_PER_MISSION) throw new AdminError('FULL', `Cada missão tem no máximo ${QUESTIONS_PER_MISSION} perguntas.`);
  const [created] = await db.insert(schema.questions).values({ ...base, campaignId: m.campaignId, missionId: q.missionId, position: n + 1 }).returning();
  return created.id;
}

export async function deleteQuestion(id: string) {
  const [q] = await db.select().from(schema.questions).where(eq(schema.questions.id, id));
  if (!q) return;
  const [a] = await db.select({ id: schema.answers.id }).from(schema.answers).where(eq(schema.answers.questionId, id)).limit(1);
  if (a) throw new AdminError('HAS_ANSWERS', 'Esta pergunta já foi respondida. Use "Anular" nas correções.');
  await db.delete(schema.questions).where(eq(schema.questions.id, id));
  const rest = await db.select().from(schema.questions).where(eq(schema.questions.missionId, q.missionId)).orderBy(asc(schema.questions.position));
  for (let i = 0; i < rest.length; i++) if (rest[i].position !== i + 1) await db.update(schema.questions).set({ position: i + 1 }).where(eq(schema.questions.id, rest[i].id));
}

export type ChecklistItem = { ok: boolean; text: string };

/** O que impede de agendar. Mostrado na tela de envios. */
export async function campaignChecklist(campaignId: string): Promise<{ ok: boolean; items: ChecklistItem[] }> {
  const [c] = await db.select().from(schema.campaigns).where(eq(schema.campaigns.id, campaignId));
  if (!c) throw new AdminError('NOT_FOUND', 'Campanha não encontrada.');
  const items: ChecklistItem[] = [];
  items.push({ ok: !!c.startDate && !!c.endDate, text: 'Datas de início e fim definidas' });
  const groups = await db.select().from(schema.campaignGroups).where(eq(schema.campaignGroups.campaignId, campaignId));
  items.push({ ok: groups.length > 0, text: 'Pelo menos um grupo de canais selecionado' });
  const ms = await db.select().from(schema.missions).where(eq(schema.missions.campaignId, campaignId)).orderBy(asc(schema.missions.number));
  const qs = await db.select().from(schema.questions).where(eq(schema.questions.campaignId, campaignId));
  const need = ms.length * QUESTIONS_PER_MISSION;
  items.push({ ok: ms.length > 0 && qs.length >= need, text: need > qs.length ? `Faltam ${need - qs.length} perguntas` : 'Todas as perguntas cadastradas' });
  const moments = await db.select().from(schema.messageMoments).where(eq(schema.messageMoments.campaignId, campaignId));
  const tpls = new Map((await db.select().from(schema.waTemplates)).map((t) => [t.name, t]));
  for (const m of moments) {
    const t = tpls.get(m.templateName);
    items.push({ ok: t?.status === 'APPROVED', text: t?.status === 'APPROVED' ? `Modelo ${m.templateName} aprovado` : `O modelo ${m.templateName} ainda não está aprovado na Meta` });
  }
  return { ok: items.every((i) => i.ok), items };
}

export async function scheduleCampaign(campaignId: string) {
  const [c] = await db.select().from(schema.campaigns).where(eq(schema.campaigns.id, campaignId));
  if (!c) throw new AdminError('NOT_FOUND', 'Campanha não encontrada.');
  if (c.status !== 'DRAFT') throw new AdminError('STATE', 'Só rascunhos podem ser agendados.');
  const chk = await campaignChecklist(campaignId);
  if (!chk.ok) throw new AdminError('CHECKLIST', 'Há pendências: ' + chk.items.filter((i) => !i.ok).map((i) => i.text).join('; ') + '.');
  await db.update(schema.campaigns).set({ status: 'SCHEDULED' }).where(eq(schema.campaigns.id, campaignId));
}

export async function campaignReach(campaignId: string) {
  const groupIds = (await db.select().from(schema.campaignGroups).where(eq(schema.campaignGroups.campaignId, campaignId))).map((g) => g.groupId);
  if (!groupIds.length) return { distributors: 0, sellers: 0, withConsent: 0 };
  const dists = [...new Set((await db.select().from(schema.channelGroupMembers).where(inArray(schema.channelGroupMembers.groupId, groupIds))).map((m) => m.distributorId))];
  if (!dists.length) return { distributors: 0, sellers: 0, withConsent: 0 };
  const sellers = await db.select().from(schema.users).where(and(inArray(schema.users.distributorId, dists), eq(schema.users.role, 'VENDEDOR'), eq(schema.users.status, 'ACTIVE')));
  return { distributors: dists.length, sellers: sellers.length, withConsent: sellers.filter((s) => s.consentAt && !s.optOutAt).length };
}

// ---------------------------------------------------------------- grupos de canais

export async function refreshGroupMembers(groupId: string) {
  const [g] = await db.select().from(schema.channelGroups).where(eq(schema.channelGroups.id, groupId));
  if (!g || !g.autoInclude) return;
  const conds = [eq(schema.distributors.active, true)];
  if (g.type) conds.push(eq(schema.distributors.type, g.type));
  if (g.regionalId) conds.push(eq(schema.distributors.regionalId, g.regionalId));
  const ds = await db.select({ id: schema.distributors.id }).from(schema.distributors).where(and(...conds));
  await db.delete(schema.channelGroupMembers).where(eq(schema.channelGroupMembers.groupId, groupId));
  if (ds.length) await db.insert(schema.channelGroupMembers).values(ds.map((d) => ({ groupId, distributorId: d.id })));
}

export async function createGroup(input: { name: string; type?: 'COOPERATIVA' | 'REVENDA' | null; regionalId?: string | null; autoInclude?: boolean }) {
  if (!input.name.trim()) throw new AdminError('NAME', 'Dê um nome ao grupo.');
  const [g] = await db.insert(schema.channelGroups).values({ name: input.name.trim(), type: input.type ?? null, regionalId: input.regionalId ?? null, autoInclude: input.autoInclude ?? true }).returning();
  await refreshGroupMembers(g.id);
  return g.id;
}

// ---------------------------------------------------------------- estrutura

export async function createDistributor(input: { name: string; type: 'COOPERATIVA' | 'REVENDA'; regionalId: string; firstUnit?: string }) {
  if (!input.name.trim()) throw new AdminError('NAME', 'Informe o nome do distribuidor.');
  const [ex] = await db.select().from(schema.distributors).where(eq(schema.distributors.name, input.name.trim()));
  if (ex) throw new AdminError('DUP', 'Já existe um distribuidor com esse nome.');
  const [d] = await db.insert(schema.distributors).values({ name: input.name.trim(), type: input.type, regionalId: input.regionalId }).returning();
  if (input.firstUnit?.trim()) await db.insert(schema.units).values({ distributorId: d.id, name: input.firstUnit.trim() });
  const groups = await db.select().from(schema.channelGroups).where(eq(schema.channelGroups.autoInclude, true));
  for (const g of groups) await refreshGroupMembers(g.id); // entra sozinho nos grupos com os mesmos critérios
  return d.id;
}

export async function createUnit(distributorId: string, name: string, kind = 'Filial') {
  if (!name.trim()) throw new AdminError('NAME', 'Informe o nome da unidade.');
  const [ex] = await db.select().from(schema.units).where(and(eq(schema.units.distributorId, distributorId), eq(schema.units.name, name.trim())));
  if (ex) throw new AdminError('DUP', 'Essa unidade já existe neste distribuidor.');
  const [u] = await db.insert(schema.units).values({ distributorId, name: name.trim(), kind }).returning();
  return u.id;
}

export async function setRepPortfolio(userId: string, distributorIds: string[]) {
  const [u] = await db.select().from(schema.users).where(eq(schema.users.id, userId));
  if (!u || u.role !== 'REPRESENTANTE') throw new AdminError('ROLE', 'Só representantes têm carteira.');
  await db.delete(schema.repAssignments).where(eq(schema.repAssignments.userId, userId));
  if (distributorIds.length) await db.insert(schema.repAssignments).values(distributorIds.map((distributorId) => ({ userId, distributorId })));
}

// ---------------------------------------------------------------- convites e aprovação

export async function createInvite(actor: Actor, input: { role: Role; distributorId?: string | null; unitId?: string | null; days?: number | null; maxUses?: number | null }) {
  let unitDist: string | null = null;
  if (input.unitId) {
    const [u] = await db.select().from(schema.units).where(eq(schema.units.id, input.unitId));
    if (!u) throw new AdminError('UNIT', 'Unidade não encontrada.');
    unitDist = u.distributorId;
  }
  const dist = input.distributorId ?? unitDist ?? null;
  if (!canCreateInvite(actor, input.role, dist, input.unitId ?? null, unitDist)) throw new AdminError('FORBIDDEN', 'Você não pode gerar este tipo de link.');
  if (input.role !== 'REPRESENTANTE' && !dist) throw new AdminError('DIST', 'Escolha o distribuidor.');
  const token = randomToken(9);
  await db.insert(schema.inviteLinks).values({
    token, targetRole: input.role, distributorId: dist, unitId: input.unitId ?? null, createdById: actor.id,
    expiresAt: input.days ? new Date(Date.now() + input.days * 86_400_000) : null, maxUses: input.maxUses ?? null,
  });
  return { token, url: `${env.appUrl}/cadastro/${token}` };
}

export async function approveUser(actor: Actor, userId: string) {
  const [u] = await db.select().from(schema.users).where(eq(schema.users.id, userId));
  if (!u) throw new AdminError('NOT_FOUND', 'Cadastro não encontrado.');
  if (!canApprove(actor, { role: u.role as Role, distributorId: u.distributorId, unitId: u.unitId })) throw new AdminError('FORBIDDEN', 'Você não pode aprovar este cadastro.');
  if (u.status !== 'PENDING') throw new AdminError('STATE', 'Este cadastro já foi decidido.');
  await db.update(schema.users).set({ status: 'ACTIVE', approvedAt: new Date(), approvedById: actor.id }).where(eq(schema.users.id, userId));
  let notified = false;
  const [tpl] = await db.select().from(schema.waTemplates).where(eq(schema.waTemplates.name, 'cadastro_aprovado'));
  if (contactOf(u) && !u.optOutAt && tpl?.status === 'APPROVED') {
    const p = await getProvider();
    notified = (await p.sendTemplate(contactOf(u)!, 'cadastro_aprovado', [u.name.split(' ')[0], `${env.appUrl}${u.role === 'GESTOR' ? '/painel/login' : '/entrar'}`])).ok;
  }
  return { notified };
}

export async function rejectUser(actor: Actor, userId: string) {
  const [u] = await db.select().from(schema.users).where(eq(schema.users.id, userId));
  if (!u) throw new AdminError('NOT_FOUND', 'Cadastro não encontrado.');
  if (!canApprove(actor, { role: u.role as Role, distributorId: u.distributorId, unitId: u.unitId })) throw new AdminError('FORBIDDEN', 'Você não pode recusar este cadastro.');
  if (u.status !== 'PENDING') throw new AdminError('STATE', 'Este cadastro já foi decidido.');
  await db.update(schema.users).set({ status: 'REJECTED' }).where(eq(schema.users.id, userId));
}

/** Troca de unidade: o histórico fica no usuário, então pontos e conquistas acompanham a pessoa. */
export async function moveUserToUnit(actor: Actor, userId: string, unitId: string) {
  const [u] = await db.select().from(schema.users).where(eq(schema.users.id, userId));
  const [un] = await db.select().from(schema.units).where(eq(schema.units.id, unitId));
  if (!u || !un) throw new AdminError('NOT_FOUND', 'Usuário ou unidade não encontrados.');
  const okMkt = actor.role === 'MARKETING';
  const okGestor = actor.role === 'GESTOR' && actor.distributorId === u.distributorId && un.distributorId === u.distributorId && (!actor.unitId || actor.unitId === u.unitId);
  if (!okMkt && !okGestor) throw new AdminError('FORBIDDEN', 'Você não pode mover este vendedor.');
  if (un.distributorId !== u.distributorId && !okMkt) throw new AdminError('FORBIDDEN', 'Só o Marketing move entre distribuidores.');
  await db.update(schema.users).set({ unitId, distributorId: un.distributorId }).where(eq(schema.users.id, userId));
}

export async function deactivateUser(actor: Actor, userId: string) {
  const [u] = await db.select().from(schema.users).where(eq(schema.users.id, userId));
  if (!u) throw new AdminError('NOT_FOUND', 'Usuário não encontrado.');
  const okMkt = actor.role === 'MARKETING';
  const okGestor = actor.role === 'GESTOR' && actor.distributorId === u.distributorId && u.role === 'VENDEDOR';
  if (!okMkt && !okGestor) throw new AdminError('FORBIDDEN', 'Você não pode desativar este usuário.');
  await db.update(schema.users).set({ status: 'LEFT', notifyOptIn: false }).where(eq(schema.users.id, userId));
}

export async function leaveProgram(userId: string) {
  await db.update(schema.users).set({ status: 'LEFT', optOutAt: new Date(), notifyOptIn: false }).where(eq(schema.users.id, userId));
  await db.insert(schema.consentLogs).values({ userId, kind: 'REVOKE', source: 'app:sair' });
}

export async function pauseNotifications(userId: string, days: number) {
  await db.update(schema.users).set({ pausedUntil: new Date(Date.now() + days * 86_400_000) }).where(eq(schema.users.id, userId));
}
