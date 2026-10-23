/** Fuso fixo de Brasília (sem horário de verão desde 2019). */
export const TZ_OFFSET_MIN = -180;

export function localToUtc(y: number, m: number, d: number, hh = 0, mm = 0, ss = 0): Date {
  return new Date(Date.UTC(y, m, d, hh, mm, ss) - TZ_OFFSET_MIN * 60_000);
}

export function toLocalParts(date: Date) {
  const t = new Date(date.getTime() + TZ_OFFSET_MIN * 60_000);
  return { y: t.getUTCFullYear(), m: t.getUTCMonth(), d: t.getUTCDate(), wd: t.getUTCDay(), hh: t.getUTCHours(), mm: t.getUTCMinutes() };
}

export function parseHHMM(s: string): [number, number] {
  const [h, m] = s.split(':').map(Number);
  return [h || 0, m || 0];
}

export type MissionPlan = { number: number; opensAt: Date; closesAt: Date };

/** Gera as missões de uma campanha: abre no dia/hora configurados e fecha no fim do último dia do ciclo. */
export function planMissions(opts: { start: Date; end: Date; everyWeeks: number; openTime: string }): MissionPlan[] {
  const [hh, mm] = parseHHMM(opts.openTime);
  const s = toLocalParts(opts.start); const e = toLocalParts(opts.end);
  const startDay = Date.UTC(s.y, s.m, s.d); const endDay = Date.UTC(e.y, e.m, e.d);
  const cycleDays = 7 * Math.max(1, opts.everyWeeks);
  const totalDays = Math.round((endDay - startDay) / 86_400_000) + 1;
  const count = Math.max(0, Math.floor(totalDays / cycleDays));
  const out: MissionPlan[] = [];
  for (let k = 0; k < count; k++) {
    const od = new Date(startDay + k * cycleDays * 86_400_000);
    const cd = new Date(startDay + (k * cycleDays + cycleDays - 1) * 86_400_000);
    out.push({
      number: k + 1,
      opensAt: localToUtc(od.getUTCFullYear(), od.getUTCMonth(), od.getUTCDate(), hh, mm),
      closesAt: localToUtc(cd.getUTCFullYear(), cd.getUTCMonth(), cd.getUTCDate(), 23, 59, 59),
    });
  }
  return out;
}

export type MomentPlan = { weekday: number; weekOffset: number; time: string };

/** Quando um momento de envio dispara, relativo à abertura da missão. */
export function momentFireAt(mission: { opensAt: Date }, openWeekday: number, everyWeeks: number, m: MomentPlan): Date {
  const o = toLocalParts(mission.opensAt);
  const [hh, mm] = parseHHMM(m.time);
  const delta = ((m.weekday - openWeekday + 7) % 7) + m.weekOffset * 7 * Math.max(1, everyWeeks);
  const base = new Date(Date.UTC(o.y, o.m, o.d) + delta * 86_400_000);
  return localToUtc(base.getUTCFullYear(), base.getUTCMonth(), base.getUTCDate(), hh, mm);
}

export function inSendWindow(now: Date, from: string, until: string, skipSundays: boolean): boolean {
  const p = toLocalParts(now);
  if (skipSundays && p.wd === 0) return false;
  const cur = p.hh * 60 + p.mm;
  const [fh, fm] = parseHHMM(from); const [uh, um] = parseHHMM(until);
  return cur >= fh * 60 + fm && cur <= uh * 60 + um;
}

export const DEFAULT_MOMENTS = [
  { kind: 'OPENING' as const, weekday: 1, weekOffset: 0, time: '09:00', templateName: 'abertura_missao_semanal', audience: 'ALL' },
  { kind: 'REMINDER' as const, weekday: 3, weekOffset: 0, time: '17:00', templateName: 'lembrete_missao', audience: 'NOT_STARTED' },
  { kind: 'LAST_CALL' as const, weekday: 6, weekOffset: 0, time: '10:00', templateName: 'ultimo_aviso_missao', audience: 'NOT_FINISHED' },
  { kind: 'RESULT' as const, weekday: 1, weekOffset: 1, time: '08:30', templateName: 'resultado_ranking', audience: 'FINISHED_PREVIOUS' },
];
