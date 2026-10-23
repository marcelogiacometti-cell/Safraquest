import { and, asc, eq, gte, inArray, lte, sql } from 'drizzle-orm';
import { db, schema } from '@/db';
import { BADGES, streakOf } from './levels';
import { loadAttemptScores, missionsOfUser, scoresFor, sellerRankings, totalsByUser, type Totals } from './stats';
import { answerPoints } from './scoring';

export const GRACE_MS = 1500;
export const SUSPICIOUS_MS = 1200;

/** Campanhas agendadas viram ativas no início e fecham no fim. Chamado a cada acesso e pelo agendador. */
export async function syncCampaignStatuses(now = new Date()) {
  await db.execute(sql`
    update campaigns c set status = 'ACTIVE'
    where c.status = 'SCHEDULED' and c.start_date <= ${now}`);
  await db.execute(sql`
    update campaigns c set status = 'CLOSED'
    where c.status = 'ACTIVE' and c.end_date is not null and c.end_date + interval '1 day' <= ${now}`);
}

export async function openMissionFor(userId: string, now = new Date()) {
  await syncCampaignStatuses(now);
  const list = await missionsOfUser(userId);
  const open = list.filter((m) => m.status === 'ACTIVE' && m.opensAt <= now && m.closesAt >= now);
  return open.length ? open[open.length - 1] : null;
}

export async function lastClosedMission(userId: string, now = new Date()) {
  const list = await missionsOfUser(userId);
  const closed = list.filter((m) => m.closesAt < now && m.status !== 'SCHEDULED');
  return closed.length ? closed[closed.length - 1] : null;
}

export async function getAttempt(userId: string, missionId: string) {
  const [a] = await db.select().from(schema.attempts).where(and(eq(schema.attempts.userId, userId), eq(schema.attempts.missionId, missionId)));
  return a ?? null;
}

export class QuizError extends Error {
  constructor(public code: 'CLOSED' | 'NOT_ELIGIBLE' | 'FINISHED' | 'NO_QUESTIONS' | 'MISMATCH', msg: string) { super(msg); }
}

async function questionsOf(missionId: string) {
  return db.select().from(schema.questions).where(eq(schema.questions.missionId, missionId)).orderBy(asc(schema.questions.position));
}

export async function startAttempt(userId: string, missionId: string, now = new Date()) {
  const open = await openMissionFor(userId, now);
  const existing = await getAttempt(userId, missionId);
  if (existing) return existing; // quem já começou pode continuar, mesmo que a lista mude
  if (!open || open.id !== missionId) throw new QuizError('CLOSED', 'Esta missão não está aberta.');
  const qs = await questionsOf(missionId);
  if (!qs.length) throw new QuizError('NO_QUESTIONS', 'Esta missão ainda não tem perguntas.');
  const [a] = await db.insert(schema.attempts).values({ userId, missionId, startedAt: now }).onConflictDoNothing().returning();
  return a ?? (await getAttempt(userId, missionId))!;
}

export type CurrentQuestion = {
  attemptId: string; position: number; total: number; secondsLeft: number; timeLimit: number;
  question: { id: string; text: string; options: string[]; topic: string; product: string };
};

/** Entrega a pergunta atual SEM o gabarito e começa a contar o tempo no servidor. */
export async function currentQuestion(userId: string, missionId: string, now = new Date()): Promise<CurrentQuestion | { finished: true; attemptId: string }> {
  let attempt = await startAttempt(userId, missionId, now);
  const qs = await questionsOf(missionId);
  const [camp] = await db.select({ product: schema.campaigns.productName }).from(schema.missions)
    .innerJoin(schema.campaigns, eq(schema.missions.campaignId, schema.campaigns.id)).where(eq(schema.missions.id, missionId));
  // resolve perguntas cujo tempo estourou enquanto o vendedor estava fora
  for (;;) {
    if (attempt.finishedAt) return { finished: true, attemptId: attempt.id };
    const q = qs[attempt.currentPos - 1];
    if (!q) { attempt = await finishAttempt(attempt.id, now); return { finished: true, attemptId: attempt.id }; }
    if (!attempt.questionShownAt) {
      const [u] = await db.update(schema.attempts).set({ questionShownAt: now }).where(eq(schema.attempts.id, attempt.id)).returning();
      attempt = u;
    }
    const elapsed = now.getTime() - attempt.questionShownAt!.getTime();
    if (elapsed > q.timeLimit * 1000 + GRACE_MS) {
      await recordAnswer(attempt, q, -1, q.timeLimit * 1000, now);
      attempt = (await getAttempt(userId, missionId))!;
      continue;
    }
    return {
      attemptId: attempt.id, position: attempt.currentPos, total: qs.length, timeLimit: q.timeLimit,
      secondsLeft: Math.max(0, Math.ceil(q.timeLimit - elapsed / 1000)),
      question: { id: q.id, text: q.text, options: q.options, topic: q.topic, product: camp?.product ?? '' },
    };
  }
}

async function recordAnswer(attempt: typeof schema.attempts.$inferSelect, q: typeof schema.questions.$inferSelect, chosen: number, timeMs: number, now: Date) {
  const correct = chosen === q.correct;
  await db.insert(schema.answers).values({
    attemptId: attempt.id, questionId: q.id, chosen, correct, timeMs, suspicious: chosen >= 0 && timeMs < SUSPICIOUS_MS,
  }).onConflictDoNothing();
  const total = (await questionsOf(attempt.missionId)).length;
  if (attempt.currentPos >= total) {
    await finishAttempt(attempt.id, now);
  } else {
    await db.update(schema.attempts).set({ currentPos: attempt.currentPos + 1, questionShownAt: null }).where(eq(schema.attempts.id, attempt.id));
  }
}

export type AnswerFeedback = {
  correct: boolean; correctIndex: number; explanation: string | null; points: number; timedOut: boolean;
  finished: boolean; attemptId: string;
};

export async function submitAnswer(userId: string, missionId: string, questionId: string, chosen: number, now = new Date()): Promise<AnswerFeedback> {
  const attempt = await getAttempt(userId, missionId);
  if (!attempt) throw new QuizError('MISMATCH', 'Missão não iniciada.');
  if (attempt.finishedAt) throw new QuizError('FINISHED', 'Você já terminou esta missão.');
  const qs = await questionsOf(missionId);
  const q = qs[attempt.currentPos - 1];
  if (!q || q.id !== questionId || !attempt.questionShownAt) throw new QuizError('MISMATCH', 'Essa não é a pergunta atual.');
  const elapsed = Math.max(0, now.getTime() - attempt.questionShownAt.getTime());
  const timedOut = elapsed > q.timeLimit * 1000 + GRACE_MS || chosen < 0 || chosen >= q.options.length;
  const finalChosen = timedOut ? -1 : chosen;
  const timeMs = Math.min(elapsed, q.timeLimit * 1000);
  await recordAnswer(attempt, q, finalChosen, timeMs, now);
  const [camp] = await db.select().from(schema.campaigns).where(eq(schema.campaigns.id, q.campaignId));
  const correct = finalChosen === q.correct;
  const points = answerPoints({ id: q.id, points: q.points, timeLimit: q.timeLimit, voided: q.voided },
    { questionId: q.id, correct, timeMs }, { pointsPerHit: camp.pointsPerHit, completionBonus: camp.completionBonus, speedBonus: camp.speedBonus });
  const fresh = (await getAttempt(userId, missionId))!;
  return { correct, correctIndex: q.correct, explanation: q.explanation, points, timedOut, finished: !!fresh.finishedAt, attemptId: attempt.id };
}

export async function finishAttempt(attemptId: string, now = new Date()) {
  const [a] = await db.update(schema.attempts).set({ finishedAt: now })
    .where(and(eq(schema.attempts.id, attemptId), sql`${schema.attempts.finishedAt} is null`)).returning();
  if (a) await awardBadges(a.userId, a.missionId);
  return a ?? (await db.select().from(schema.attempts).where(eq(schema.attempts.id, attemptId)))[0];
}

// ---------------------------------------------------------------- conquistas

export async function awardBadges(userId: string, missionId: string): Promise<string[]> {
  const have = new Set((await db.select().from(schema.userBadges).where(eq(schema.userBadges.userId, userId))).map((b) => b.key));
  const earn: string[] = [];
  const grant = (k: string) => { if (!have.has(k) && !earn.includes(k)) earn.push(k); };

  const mine = await loadAttemptScores({ userIds: [userId] });
  const thisAtt = mine.find((m) => m.missionId === missionId);
  const finishedCount = mine.filter((m) => m.finished).length;
  if (finishedCount >= 1) grant('first_mission');

  const qs = await db.select().from(schema.questions).where(eq(schema.questions.missionId, missionId));
  if (thisAtt && qs.length && thisAtt.hits === qs.length) grant('perfect');

  const now = new Date();
  const ms = await missionsOfUser(userId);
  const done = new Set(mine.filter((m) => m.finished).map((m) => m.missionId));
  const seq = ms.filter((m) => m.opensAt <= now).map((m) => ({ closed: m.closesAt < now, finished: done.has(m.id) }));
  const st = streakOf(seq);
  if (st >= 4) grant('streak_4');
  if (st >= 8) grant('streak_8');

  // especialista: campanha inteira concluída com 80%+ de acerto
  if (thisAtt) {
    const campMissions = ms.filter((m) => m.campaignId === thisAtt.campaignId);
    const campAtts = mine.filter((m) => m.campaignId === thisAtt.campaignId && m.finished);
    if (campMissions.length && campAtts.length === campMissions.length) {
      const allQs = await db.select().from(schema.questions).where(eq(schema.questions.campaignId, thisAtt.campaignId));
      const hits = campAtts.reduce((s, a) => s + a.hits, 0);
      if (allQs.length && hits / allQs.length >= 0.8) grant('specialist');
    }
  }
  const seasonRank = await sellerRankings(userId, { kind: 'season' });
  if (seasonRank.myGeneral && seasonRank.myGeneral.pos <= 10 && seasonRank.myGeneral.points > 0) grant('top10');

  for (const k of earn) await db.insert(schema.userBadges).values({ userId, key: k }).onConflictDoNothing();
  return earn;
}

export async function badgesOf(userId: string) {
  const got = new Map((await db.select().from(schema.userBadges).where(eq(schema.userBadges.userId, userId))).map((b) => [b.key, b.earnedAt]));
  return BADGES.map((b) => ({ ...b, earned: got.has(b.key), earnedAt: got.get(b.key) ?? null }));
}

// ---------------------------------------------------------------- resultado

export async function attemptSummary(userId: string, missionId: string) {
  const [att] = await loadAttemptScores({ userIds: [userId], missionId });
  if (!att) return null;
  const qs = await db.select().from(schema.questions).where(eq(schema.questions.missionId, missionId));
  // posições antes e depois desta missão (antes = pontos totais sem esta tentativa)
  const afterScores = await scoresFor({ kind: 'season' });
  const afterTotals = totalsByUser(afterScores);
  const beforeTotals = new Map<string, Totals>(afterTotals);
  const mine = afterTotals.get(userId);
  if (mine) beforeTotals.set(userId, { ...mine, points: mine.points - att.points, missions: mine.missions - 1, hits: mine.hits - att.hits, answered: mine.answered - att.answered, timeMs: mine.timeMs - att.timeMs });
  const after = await sellerRankings(userId, { kind: 'season' }, afterTotals);
  const before = await sellerRankings(userId, { kind: 'season' }, beforeTotals);
  const delta = (b: number | undefined, a: number | undefined) => (b && a ? b - a : 0);
  return {
    points: att.points, hits: att.hits, total: qs.length, finished: att.finished,
    general: { before: before.myGeneral?.pos, after: after.myGeneral?.pos, up: delta(before.myGeneral?.pos, after.myGeneral?.pos) },
    distributor: { before: before.myInDistributor?.pos, after: after.myInDistributor?.pos, up: delta(before.myInDistributor?.pos, after.myInDistributor?.pos) },
    unit: { before: before.myInUnit?.pos, after: after.myInUnit?.pos, up: delta(before.myInUnit?.pos, after.myInUnit?.pos) },
  };
}
export { gte, lte, inArray };
