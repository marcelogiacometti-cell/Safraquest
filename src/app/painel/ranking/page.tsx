import Link from 'next/link';
import { requirePanel } from '@/lib/web';
import { panelRanking } from '@/lib/panelRanking';
export const dynamic = 'force-dynamic';
type SP = { c?: string; regional?: string; tipo?: string; v?: string };
const VIEWS = [['vendedores', 'Vendedores'], ['distribuidores', 'Distribuidores'], ['filiais', 'Filiais'], ['regionais', 'Regionais']] as const;
const fmtTime = (ms: number) => { const s = Math.round(ms / 1000); return `${Math.floor(s / 60)}min ${String(s % 60).padStart(2, '0')}s`; };
const medal = (n: number) => (n === 1 ? '🥇' : n === 2 ? '🥈' : n === 3 ? '🥉' : n);
export default async function Ranking({ searchParams }: { searchParams: Promise<SP> }) {
  const { actor } = await requirePanel(); const sp = await searchParams;
  const v = VIEWS.some(([k]) => k === sp.v) ? sp.v! : 'vendedores';
  const type = sp.tipo === 'COOPERATIVA' || sp.tipo === 'REVENDA' ? sp.tipo : null;
  const r = await panelRanking(actor, { campaignId: sp.c || null, regionalId: sp.regional || null, type });
  const q = (o: Partial<SP>) => { const p = new URLSearchParams(); const m = { c: sp.c, regional: sp.regional, tipo: sp.tipo, v, ...o }; for (const [k, x] of Object.entries(m)) if (x) p.set(k, x); return `/painel/ranking?${p}`; };
  return (<><h1>Ranking</h1>
    <div className="card">
      <form method="get" className="row" style={{ gap: 10, alignItems: 'flex-end', flexWrap: 'wrap' }}>
        <input type="hidden" name="v" value={v} />
        <label>Período<select name="c" defaultValue={sp.c ?? ''} style={{ margin: 0 }}><option value="">Temporada (todas as campanhas)</option>{r.campaigns.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
        <label>Regional<select name="regional" defaultValue={sp.regional ?? ''} style={{ margin: 0 }}><option value="">Todas</option>{r.regionalOptions.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select></label>
        <label>Tipo de canal<select name="tipo" defaultValue={type ?? ''} style={{ margin: 0 }}><option value="">Todos</option><option value="COOPERATIVA">Cooperativas</option><option value="REVENDA">Revendas</option></select></label>
        <button className="btn sm">Filtrar</button></form>
      <p className="mu" style={{ marginTop: 8 }}>{r.campaignName ?? 'Temporada'} · {r.totalSellers} vendedores ativos · {r.participants} participaram. Distribuidores, filiais e regionais são ordenados pela média de pontos por vendedor ativo.</p></div>
    <div style={{ display: 'flex', gap: 8, margin: '4px 0 12px', flexWrap: 'wrap' }}>
      {VIEWS.map(([k, label]) => <Link key={k} href={q({ v: k })} className={'btn sm' + (k === v ? '' : ' sec')}>{label}</Link>)}</div>
    <div className="card">
      {v === 'vendedores' && <table><thead><tr><th>#</th><th>Vendedor</th><th>Distribuidor · filial</th><th>Regional</th><th>Pontos</th><th>Acerto</th><th>Quizzes</th><th>Tempo</th></tr></thead><tbody>
        {r.sellers.slice(0, 100).map((s, i) => <tr key={i}><td>{s.played ? medal(s.pos) : '—'}</td><td><b>{s.name}</b></td><td>{s.distributor}{s.unit ? ` · ${s.unit}` : ''}</td><td>{s.regional}</td>
          <td><b>{s.points}</b></td><td>{s.hitRate === null ? '—' : s.hitRate + '%'}</td><td>{s.missions}</td><td>{s.played ? fmtTime(s.timeMs) : '—'}</td></tr>)}
        {!r.sellers.length && <tr><td colSpan={8} className="mu">Nenhum vendedor neste filtro.</td></tr>}</tbody></table>}
      {v === 'distribuidores' && <table><thead><tr><th>#</th><th>Distribuidor</th><th>Tipo</th><th>Regional</th><th>Vendedores</th><th>Participaram</th><th>Média de pontos</th></tr></thead><tbody>
        {r.distributors.map((g) => <tr key={g.id}><td>{g.insufficient ? '—' : medal(g.pos)}</td><td><b>{g.name}</b></td><td>{g.type === 'COOPERATIVA' ? 'Cooperativa' : 'Revenda'}</td><td>{g.regional}</td><td>{g.sellers}</td><td>{g.participants}</td><td><b>{g.avgPoints}</b></td></tr>)}
        {!r.distributors.length && <tr><td colSpan={7} className="mu">Nenhum distribuidor neste filtro.</td></tr>}</tbody></table>}
      {v === 'filiais' && <><p className="mu">Uma filial só entra no ranking com pelo menos {r.minUnit} participantes.</p><table><thead><tr><th>#</th><th>Filial</th><th>Distribuidor</th><th>Vendedores</th><th>Participaram</th><th>Média de pontos</th></tr></thead><tbody>
        {r.units.map((g) => <tr key={g.id}><td>{g.insufficient ? '—' : medal(g.pos)}</td><td><b>{g.name}</b></td><td>{g.distributor}</td><td>{g.sellers}</td><td>{g.participants}</td><td>{g.insufficient ? <span className="mu">participantes insuficientes</span> : <b>{g.avgPoints}</b>}</td></tr>)}
        {!r.units.length && <tr><td colSpan={6} className="mu">Nenhuma filial neste filtro.</td></tr>}</tbody></table></>}
      {v === 'regionais' && <table><thead><tr><th>#</th><th>Regional</th><th>Vendedores</th><th>Participaram</th><th>Média de pontos</th></tr></thead><tbody>
        {r.regionals.map((g) => <tr key={g.id}><td>{g.insufficient ? '—' : medal(g.pos)}</td><td><b>{g.name}</b></td><td>{g.sellers}</td><td>{g.participants}</td><td><b>{g.avgPoints}</b></td></tr>)}
        {!r.regionals.length && <tr><td colSpan={5} className="mu">Nenhuma regional neste filtro.</td></tr>}</tbody></table>}</div>
  </>);
}
