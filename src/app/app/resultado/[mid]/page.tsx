import Link from 'next/link';
import { requireMember } from '@/lib/web';
import { attemptSummary, badgesOf } from '@/lib/quiz';
export const dynamic = 'force-dynamic';
const mv = (up: number) => up > 0 ? `▲ subiu ${up}` : up < 0 ? `▼ caiu ${-up}` : '= manteve';
export default async function Resultado({ params }: { params: Promise<{ mid: string }> }) {
  const u = await requireMember(); const { mid } = await params;
  const s = await attemptSummary(u.id, mid);
  if (!s) return <><h1>Sem resultado</h1><p className="mu">Você não participou desta missão.</p><Link className="btn block" href="/app">Voltar</Link></>;
  const badges = (await badgesOf(u.id)).filter((b) => b.earned);
  return (<>
    <h1>{s.finished ? 'Missão concluída! 🎉' : 'Missão em andamento'}</h1>
    <div className="card"><div className="kpi">{s.points} pts</div><span className="mu">{s.hits} de {s.total} acertos</span></div>
    <div className="card"><h2>Sua posição</h2>
      <p>Geral: <b>{s.general.after ?? '—'}º</b> <span className="mu">{mv(s.general.up)}</span></p>
      <p>Na sua loja: <b>{s.distributor.after ?? '—'}º</b> <span className="mu">{mv(s.distributor.up)}</span></p>
      <p>Na sua unidade: <b>{s.unit.after ?? '—'}º</b> <span className="mu">{mv(s.unit.up)}</span></p></div>
    {badges.length > 0 && <div className="card"><h2>Suas conquistas</h2>{badges.map((b) => <span key={b.key} className="pill" style={{ marginRight: 6 }}>{b.label}</span>)}</div>}
    <Link className="btn block" href="/app/rankings">Ver rankings</Link>
  </>);
}
