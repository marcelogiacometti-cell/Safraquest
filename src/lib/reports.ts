import { and, eq, inArray } from 'drizzle-orm';
import { db, schema } from '@/db';
import { AdminError, saveQuestion } from './admin';
import { getProvider } from './whatsapp/provider';

export type ReportKindIn = 'ERROR' | 'CONFUSING' | 'OUTDATED' | 'OTHER' | 'SUGGESTION';

export async function submitReport(userId: string, input: { questionId?: string | null; kind: ReportKindIn; text?: string; topic?: string }) {
  if (input.kind === 'SUGGESTION' && !(input.text ?? '').trim()) throw new AdminError('TEXT', 'Escreva a sua sugestão.');
  if (input.kind !== 'SUGGESTION' && !input.questionId) throw new AdminError('Q', 'Escolha a pergunta.');
  if ((input.text ?? '').length > 1500) throw new AdminError('LEN', 'Texto muito longo.');
  // evita repetição: o mesmo vendedor não abre dois relatos abertos para a mesma pergunta
  if (input.questionId) {
    const [dup] = await db.select().from(schema.questionReports).where(and(eq(schema.questionReports.userId, userId), eq(schema.questionReports.questionId, input.questionId), inArray(schema.questionReports.status, ['OPEN', 'REVIEW'])));
    if (dup) return dup.id;
  }
  const [r] = await db.insert(schema.questionReports).values({ userId, questionId: input.questionId ?? null, kind: input.kind, text: input.text?.trim() ?? null, topic: input.topic ?? null }).returning();
  return r.id;
}

export type ReportAction =
  | { type: 'FIX'; text?: string; options?: string[]; correct?: number; explanation?: string; note?: string }
  | { type: 'VOID'; note?: string }
  | { type: 'DISCARD'; note: string }
  | { type: 'ASK_MORE'; note: string }
  | { type: 'TO_QUESTION'; missionId: string; text: string; options: string[]; correct: number; explanation?: string };

async function notify(userIds: string[], text: string): Promise<number> {
  if (!userIds.length) return 0;
  const [tpl] = await db.select().from(schema.waTemplates).where(eq(schema.waTemplates.name, 'aviso_correcao'));
  if (tpl?.status !== 'APPROVED') return 0; // fora da janela de 24 h só vai por modelo aprovado
  const users = await db.select().from(schema.users).where(inArray(schema.users.id, userIds));
  const p = await getProvider();
  let n = 0;
  for (const u of users) {
    if (!u.whatsapp || !u.consentAt || u.optOutAt || !u.notifyOptIn) continue;
    if ((await p.sendTemplate(u.whatsapp, 'aviso_correcao', [u.name.split(' ')[0], text])).ok) n++;
  }
  return n;
}

export async function resolveReport(reportId: string, action: ReportAction) {
  const [r] = await db.select().from(schema.questionReports).where(eq(schema.questionReports.id, reportId));
  if (!r) throw new AdminError('NOT_FOUND', 'Relato não encontrado.');
  if (['RESOLVED', 'DISCARDED'].includes(r.status)) throw new AdminError('STATE', 'Este relato já foi encerrado.');
  const now = new Date();
  let notified = 0;
  if (action.type === 'ASK_MORE') {
    await db.update(schema.questionReports).set({ status: 'REVIEW', resolution: action.note }).where(eq(schema.questionReports.id, reportId));
    return { notified };
  }
  if (action.type === 'DISCARD') {
    await db.update(schema.questionReports).set({ status: 'DISCARDED', resolution: action.note, resolvedAt: now }).where(eq(schema.questionReports.id, reportId));
    notified = await notify([r.userId], 'Revisamos sua observação e mantivemos a pergunta. ' + action.note);
    return { notified };
  }
  if (action.type === 'TO_QUESTION') {
    if (r.kind !== 'SUGGESTION') throw new AdminError('KIND', 'Só sugestões viram pergunta.');
    await saveQuestion(null, { missionId: action.missionId, text: action.text, options: action.options, correct: action.correct, explanation: action.explanation, topic: r.topic ?? undefined });
    await db.update(schema.questionReports).set({ status: 'RESOLVED', resolution: 'Virou pergunta', resolvedAt: now }).where(eq(schema.questionReports.id, reportId));
    await db.insert(schema.userBadges).values({ userId: r.userId, key: 'idea' }).onConflictDoNothing();
    notified = await notify([r.userId], 'Sua sugestão virou pergunta! Você ganhou a conquista Boa ideia.');
    return { notified };
  }
  if (!r.questionId) throw new AdminError('Q', 'Este relato não aponta uma pergunta.');
  const [q] = await db.select().from(schema.questions).where(eq(schema.questions.id, r.questionId));
  if (!q) throw new AdminError('Q', 'Pergunta não existe mais.');
  const [camp] = await db.select().from(schema.campaigns).where(eq(schema.campaigns.id, q.campaignId));
  if (camp.status === 'CLOSED') {
    const [cl] = await db.select().from(schema.closures).where(eq(schema.closures.campaignId, camp.id));
    if (cl) throw new AdminError('CLOSED', 'A apuração desta campanha já foi fechada e não é recalculada.');
  }
  if (action.type === 'VOID') {
    await db.update(schema.questions).set({ voided: true }).where(eq(schema.questions.id, q.id));
  } else {
    const options = action.options ?? q.options;
    const correct = action.correct ?? q.correct;
    if (correct < 0 || correct >= options.length) throw new AdminError('Q_CORRECT', 'Gabarito inválido.');
    await db.update(schema.questions).set({ text: action.text ?? q.text, options, correct, explanation: action.explanation ?? q.explanation }).where(eq(schema.questions.id, q.id));
  }
  await db.update(schema.questionReports).set({ status: 'RESOLVED', resolution: action.type === 'VOID' ? 'Pergunta anulada; pontos devolvidos' : 'Pergunta corrigida', resolvedAt: now })
    .where(and(eq(schema.questionReports.questionId, q.id), inArray(schema.questionReports.status, ['OPEN', 'REVIEW'])));
  const answered = (await db.select({ id: schema.attempts.userId }).from(schema.answers).innerJoin(schema.attempts, eq(schema.answers.attemptId, schema.attempts.id)).where(eq(schema.answers.questionId, q.id))).map((x) => x.id);
  const reporters = (await db.select({ id: schema.questionReports.userId }).from(schema.questionReports).where(eq(schema.questionReports.questionId, q.id))).map((x) => x.id);
  notified = await notify([...new Set([...answered, ...reporters])], action.type === 'VOID' ? 'Uma pergunta foi anulada e seus pontos foram devolvidos. Confira o ranking.' : 'Corrigimos uma pergunta e recalculamos os pontos. Confira o ranking.');
  return { notified };
}

export async function reportQueue(status: 'OPEN' | 'REVIEW' | 'DONE') {
  const statuses = status === 'DONE' ? ['RESOLVED', 'DISCARDED'] as const : [status] as const;
  const rows = await db.select({
    r: schema.questionReports, q: schema.questions, uname: schema.users.name, dist: schema.distributors.name,
  }).from(schema.questionReports)
    .leftJoin(schema.questions, eq(schema.questionReports.questionId, schema.questions.id))
    .innerJoin(schema.users, eq(schema.questionReports.userId, schema.users.id))
    .leftJoin(schema.distributors, eq(schema.users.distributorId, schema.distributors.id))
    .where(inArray(schema.questionReports.status, [...statuses]));
  return rows;
}
