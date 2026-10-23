export type ScoreQuestion = { id: string; points: number | null; timeLimit: number; voided: boolean };
export type ScoreAnswer = { questionId: string; correct: boolean; timeMs: number };
export type ScoreRules = { pointsPerHit: number; completionBonus: number; speedBonus: boolean };

/** Pontos de uma resposta. Pergunta anulada vale como acerto para todos que responderam. */
export function answerPoints(q: ScoreQuestion, a: ScoreAnswer, rules: ScoreRules): number {
  const base = q.points ?? rules.pointsPerHit;
  if (q.voided) return base;
  if (!a.correct) return 0;
  let pts = base;
  if (rules.speedBonus) {
    const frac = Math.max(0, 1 - a.timeMs / (q.timeLimit * 1000));
    pts += Math.round(10 * frac);
  }
  return pts;
}

export function attemptScore(
  questions: ScoreQuestion[], answers: ScoreAnswer[], finished: boolean, rules: ScoreRules,
): { points: number; hits: number; totalTimeMs: number } {
  const byQ = new Map(questions.map((q) => [q.id, q]));
  let points = 0; let hits = 0; let totalTimeMs = 0;
  for (const a of answers) {
    const q = byQ.get(a.questionId);
    if (!q) continue;
    points += answerPoints(q, a, rules);
    if (q.voided || a.correct) hits += 1;
    totalTimeMs += a.timeMs;
  }
  if (finished) points += rules.completionBonus;
  return { points, hits, totalTimeMs };
}
