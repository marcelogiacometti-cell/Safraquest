import Link from 'next/link';
import { requireMember, firstName, fmtDate } from '@/lib/web';
import { openMissionFor, lastClosedMission, getAttempt, syncCampaignStatuses, attemptSummary } from '@/lib/quiz';
import { sellerRankings, totalsByUser, scoresFor } from '@/lib/stats';
import { levelInfo, streakOf } from '@/lib/levels';
import { eq } from 'drizzle-orm';
import { db, schema } from '@/db';
export const dynamic = 'force-dynamic';
export default async function Inicio() {
  const u = await requireMember();
  await syncCampaignStatuses();
  const open = await openMissionFor(u.id);
  const att = open ? await getAttempt(u.id, open.id) : null;
  const rk = await sellerRankings(u.id, { kind: 'season' });
  const me = rk.myGeneral;
  const lvl = levelInfo(me?.points ?? 0);
  const last = await lastClosedMission(u.id);
  return (<>
    <h1>Olá, {firstName(u.name)}! 👋</h1>
    <div className="card">
      <div className="row"><b>Nível {lvl.level}</b><span className="pill am">{me?.points ?? 0} pts</span></div>
      <div className="bar" style={{ margin: '8px 0' }}><i style={{ width: `${lvl.pct}%` }} /></div>
      <span className="mu">{me ? `${me.pos}º de ${rk.total} no ranking geral` : 'Faça sua primeira missão para entrar no ranking'}</span>
    </div>
    {open ? (<div className="card">
      <span className="pill">Missão {open.number}</span>
      <h2>{open.product}</h2>
      <p className="mu">Aberta até {fmtDate(open.closesAt)}. 5 perguntas, cerca de 4 minutos.</p>
      {att?.finishedAt ? <Link className="btn sec block" href={`/app/resultado/${open.id}`}>Ver meu resultado</Link>
        : <Link className="btn block" href={`/app/quiz/${open.id}`}>{att ? 'Continuar missão' : 'Começar missão'}</Link>}
    </div>) : <div className="card">Nenhuma missão aberta agora. Você recebe um aviso no WhatsApp na próxima segunda. 🌾</div>}
    {last && <Link className="btn sec block" href={`/app/resultado/${last.id}`}>Resultado da missão {last.number}</Link>}
  </>);
}
