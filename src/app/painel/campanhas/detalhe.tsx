import Link from 'next/link';
import { asc, eq } from 'drizzle-orm';
import { db, schema } from '@/db';
import { requirePanel, fmtDate } from '@/lib/web';
import { campaignEffectiveness } from '@/lib/effectiveness';
import { panelRanking } from '@/lib/panelRanking';
const ST: Record<string, string> = { ACTIVE: 'ativa', SCHEDULED: 'agendada', CLOSED: 'encerrada', DRAFT: 'rascunho' };
const fmtTime = (ms: number) => { const s = Math.round(ms / 1000); return `${Math.floor(s / 60)}min ${String(s % 60).padStart(2, '0')}s`; };
const medal = (n: number) => (n === 1 ? '🥇' : n === 2 ? '🥈' : n === 3 ? '🥉' : n);

/** Caixa sobreposta com tudo da campanha. */
export async function Detalhe({ id }: { id: string }) {
  const { actor, user } = await requirePanel();
  const [c] = await db.select().from(schema.campaigns).where(eq(schema.campaigns.id, id));
  const close = <Link href="/painel/campanhas" className="x" aria-label="Fechar">×</Link>;
  if (!c) return <div className="ovl"><div className="box">{close}<p>Campanha não encontrada.</p></div></div>;
  const missions = await db.select().from(schema.missions).where(eq(schema.missions.campaignId, id)).orderBy(asc(schema.missions.number));
  const eff = await campaignEffectiveness(actor, { campaignId: id });
  const rk = await panelRanking(actor, { campaignId: id });
  return (<div className="ovl"><div className="box">{close}
    <span className={'pill' + (c.status === 'SCHEDULED' ? ' am' : c.status === 'CLOSED' ? ' cz' : '')}>{ST[c.status]}</span>
    <h1 style={{ margin: '8px 0 2px' }}>{c.name}</h1>
    <p className="mu" style={{ margin: 0 }}>Tema: <b>{c.productName}</b>{c.objective ? ` · ${c.objective}` : ''}</p>
    <p className="mu" style={{ margin: '4px 0' }}>Período: {c.startDate ? fmtDate(c.startDate) : '—'} até {c.endDate ? fmtDate(c.endDate) : '—'}</p>
    {c.materialUrl && <p className="mu"><a href={c.materialUrl} target="_blank" rel="noreferrer">Material de apoio</a></p>}

    <h2>Performance geral</h2>
    {eff && c.status !== 'SCHEDULED' ? <>
      <div className="grid">
        <div className="card"><div className="kpi">{eff.kpis.reached}</div><span className="mu">vendedores alcançados</span></div>
        <div className="card"><div className="kpi">{eff.kpis.participationNow ?? '—'}{eff.kpis.participationNow !== null && '%'}</div><span className="mu">participação atual</span></div>
        <div className="card"><div className="kpi">{eff.kpis.hitRate ?? '—'}{eff.kpis.hitRate !== null && '%'}</div><span className="mu">acerto médio</span></div></div>
      <table><thead><tr><th>Quiz</th><th>Abre</th><th>Concluíram</th><th>Participação</th><th>Acerto</th></tr></thead><tbody>
        {eff.weeks.map((w) => { const m = missions.find((x) => x.number === w.number); return (<tr key={w.number}><td>{w.number}</td><td>{m ? fmtDate(m.opensAt) : ''}</td><td>{w.finished}</td><td>{w.participation === null ? '—' : w.participation + '%'}</td><td>{w.hitRate === null ? '—' : w.hitRate + '%'}</td></tr>); })}</tbody></table></>
      : <p className="mu">A campanha ainda não começou. Os quizzes abrem nas datas programadas:</p>}
    {(!eff || c.status === 'SCHEDULED') && <table><tbody>{missions.map((m) => <tr key={m.id}><td>Quiz {m.number}</td><td>{fmtDate(m.opensAt)}</td></tr>)}</tbody></table>}

    {eff && eff.perQuestion.length > 0 && <><h2>Performance por pergunta</h2>
      <table><thead><tr><th>Quiz</th><th>Pergunta</th><th>Tema</th><th>Respostas</th><th>Acerto</th></tr></thead><tbody>
        {eff.perQuestion.map((q) => <tr key={q.id}><td>{q.week}</td><td>{q.text}</td><td>{q.topic}</td><td>{q.answers}</td><td><b>{q.rate === null ? '—' : q.rate + '%'}</b></td></tr>)}</tbody></table></>}

    {rk.distributors.length > 0 && <><h2>Ranking dos distribuidores</h2>
      <table><thead><tr><th>#</th><th>Distribuidor</th><th>Participaram</th><th>Média de pontos</th></tr></thead><tbody>
        {rk.distributors.map((g) => <tr key={g.id}><td>{g.insufficient ? '—' : medal(g.pos)}</td><td><b>{g.name}</b></td><td>{g.participants}/{g.sellers}</td><td><b>{g.avgPoints}</b></td></tr>)}</tbody></table></>}
    {rk.sellers.some((s) => s.played) && <><h2>Ranking dos participantes</h2>
      <table><thead><tr><th>#</th><th>Vendedor</th><th>Distribuidor</th><th>Pontos</th><th>Acerto</th><th>Tempo</th></tr></thead><tbody>
        {rk.sellers.filter((s) => s.played).slice(0, 30).map((s, i) => <tr key={i}><td>{medal(s.pos)}</td><td><b>{s.name}</b></td><td>{s.distributor}{s.unit ? ` · ${s.unit}` : ''}</td><td><b>{s.points}</b></td><td>{s.hitRate === null ? '—' : s.hitRate + '%'}</td><td>{fmtTime(s.timeMs)}</td></tr>)}</tbody></table></>}

    {user.role === 'MARKETING' && <p style={{ marginTop: 20 }}><Link href={`/painel/campanhas/${id}`} className="btn sm sec">Gestão completa (grupos, apuração e vencedores)</Link></p>}
  </div></div>);
}
