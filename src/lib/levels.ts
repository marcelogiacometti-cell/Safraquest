export const LEVEL_STARTS = [0, 400, 900, 1500, 2300, 3300, 4500, 6000];

export function levelInfo(points: number) {
  let level = 1;
  for (let i = 0; i < LEVEL_STARTS.length; i++) if (points >= LEVEL_STARTS[i]) level = i + 1;
  const next = LEVEL_STARTS[level] ?? null;
  const start = LEVEL_STARTS[level - 1];
  const pct = next === null ? 100 : Math.round(((points - start) / (next - start)) * 100);
  return { level, next, missing: next === null ? 0 : next - points, pct };
}

/** Semanas seguidas: conta de trás para frente as missões já fechadas concluídas; a missão aberta não quebra a sequência. */
export function streakOf(missions: { closed: boolean; finished: boolean }[]): number {
  let n = 0;
  for (let i = missions.length - 1; i >= 0; i--) {
    const m = missions[i];
    if (!m.closed && !m.finished) continue;
    if (m.finished) n += 1; else break;
  }
  return n;
}

export const BADGES: { key: string; label: string; hint: string }[] = [
  { key: 'first_mission', label: 'Primeira missão', hint: 'Conclua sua primeira missão' },
  { key: 'perfect', label: 'Gabarito perfeito', hint: 'Acerte todas as perguntas de uma missão' },
  { key: 'streak_4', label: '4 semanas seguidas', hint: 'Conclua 4 missões em sequência' },
  { key: 'streak_8', label: '8 semanas seguidas', hint: 'Conclua 8 missões em sequência' },
  { key: 'specialist', label: 'Especialista', hint: 'Termine uma campanha com 80% de acerto ou mais' },
  { key: 'top10', label: 'Top 10', hint: 'Entre no top 10 geral' },
  { key: 'climber', label: 'Em ascensão', hint: 'Suba 5 posições numa missão' },
  { key: 'idea', label: 'Boa ideia', hint: 'Tenha uma sugestão virando pergunta' },
];
