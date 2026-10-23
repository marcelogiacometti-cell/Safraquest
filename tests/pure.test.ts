import { describe, expect, it } from 'vitest';
import { normalizePhone, formatPhone } from '@/lib/phone';
import { answerPoints, attemptScore } from '@/lib/scoring';
import { levelInfo, streakOf } from '@/lib/levels';
import { planMissions, momentFireAt, inSendWindow, DEFAULT_MOMENTS } from '@/lib/schedule';
import { encrypt, decrypt } from '@/lib/crypto';

describe('telefone', () => {
  it('normaliza formatos comuns', () => {
    expect(normalizePhone('(54) 99999-1234')).toBe('5554999991234');
    expect(normalizePhone('+55 54 99999-1234')).toBe('5554999991234');
    expect(normalizePhone('54 8888-1234')).toBe('5554988881234');
    expect(normalizePhone('123')).toBeNull();
    expect(normalizePhone('(05) 99999-1234')).toBeNull();
  });
  it('formata', () => expect(formatPhone('5554999991234')).toBe('(54) 99999-1234'));
});

describe('pontuação', () => {
  const rules = { pointsPerHit: 40, completionBonus: 20, speedBonus: false };
  const qs = [1, 2, 3, 4, 5].map((n) => ({ id: 'q' + n, points: null, timeLimit: 30, voided: false }));
  it('4 acertos de 5 com bônus = 180', () => {
    const ans = qs.map((q, i) => ({ questionId: q.id, correct: i !== 2, timeMs: 8000 }));
    expect(attemptScore(qs, ans, true, rules).points).toBe(180);
  });
  it('sem terminar, não leva bônus de conclusão', () => {
    const ans = [{ questionId: 'q1', correct: true, timeMs: 5000 }];
    expect(attemptScore(qs, ans, false, rules).points).toBe(40);
  });
  it('bônus de rapidez até +10', () => {
    const r = { ...rules, speedBonus: true };
    expect(answerPoints(qs[0], { questionId: 'q1', correct: true, timeMs: 0 }, r)).toBe(50);
    expect(answerPoints(qs[0], { questionId: 'q1', correct: true, timeMs: 30000 }, r)).toBe(40);
    expect(answerPoints(qs[0], { questionId: 'q1', correct: false, timeMs: 1000 }, r)).toBe(0);
  });
  it('pergunta anulada devolve pontos a quem respondeu', () => {
    const q = { ...qs[0], voided: true };
    expect(answerPoints(q, { questionId: 'q1', correct: false, timeMs: 9000 }, rules)).toBe(40);
  });
});

describe('níveis e sequência', () => {
  it('nível 3 com 1.240 pontos, faltam 260 para o 4', () => {
    const l = levelInfo(1240);
    expect(l.level).toBe(3); expect(l.missing).toBe(260); expect(l.next).toBe(1500);
  });
  it('sequência ignora a missão aberta e quebra em falta', () => {
    expect(streakOf([{ closed: true, finished: true }, { closed: true, finished: true }, { closed: false, finished: false }])).toBe(2);
    expect(streakOf([{ closed: true, finished: true }, { closed: true, finished: false }, { closed: true, finished: true }])).toBe(1);
    expect(streakOf([])).toBe(0);
  });
});

describe('agenda', () => {
  const start = new Date('2026-11-02T03:00:00Z'); // segunda 02/11 00:00 em Brasília
  const end = new Date('2026-12-13T03:00:00Z');
  const ms = planMissions({ start, end, everyWeeks: 1, openTime: '09:00' });
  it('6 semanas entre 02/11 e 13/12', () => expect(ms).toHaveLength(6));
  it('abre segunda 09:00 e fecha domingo 23:59:59 (Brasília)', () => {
    expect(ms[0].opensAt.toISOString()).toBe('2026-11-02T12:00:00.000Z');
    expect(ms[0].closesAt.toISOString()).toBe('2026-11-09T02:59:59.000Z');
  });
  it('momentos caem nos dias certos', () => {
    const fire = DEFAULT_MOMENTS.map((m) => momentFireAt(ms[0], 1, 1, m).toISOString());
    expect(fire).toEqual(['2026-11-02T12:00:00.000Z', '2026-11-04T20:00:00.000Z', '2026-11-07T13:00:00.000Z', '2026-11-09T11:30:00.000Z']);
  });
  it('janela de envio respeita horário e domingo', () => {
    expect(inSendWindow(new Date('2026-11-02T12:00:00Z'), '08:00', '19:00', true)).toBe(true);
    expect(inSendWindow(new Date('2026-11-02T04:00:00Z'), '08:00', '19:00', true)).toBe(false);
    expect(inSendWindow(new Date('2026-11-08T15:00:00Z'), '08:00', '19:00', true)).toBe(false);
  });
});

describe('criptografia', () => {
  it('ida e volta', () => expect(decrypt(encrypt('segredo-da-meta'))).toBe('segredo-da-meta'));
});
