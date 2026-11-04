import { and, desc, eq, inArray } from 'drizzle-orm';
import { db, schema } from '@/db';
import { requirePanel, fmtDate } from '@/lib/web';
import { visibleDistributorIds, canApprove } from '@/lib/access';
import { aprovar, recusar } from './actions';
import { managerDashboard } from '@/lib/dashboard';
import Link from 'next/link';
export const dynamic = 'force-dynamic';
const ROLE = { VENDEDOR: 'Vendedores', GESTOR: 'Gestores', REPRESENTANTE: 'Representantes', MARKETING: 'Marketing', REGIONAL: 'Regionais', DIRETORIA: 'Diretoria' } as Record<string, string>;
export default async function Resumo() {
  const { user, actor } = await requirePanel();
  const vis = await visibleDistributorIds(actor);
  const pend = (await db.select({ u: schema.users, d: schema.distributors.name, un: schema.units.name }).from(schema.users)
    .leftJoin(schema.distributors, eq(schema.users.distributorId, schema.distributors.id)).leftJoin(schema.units, eq(schema.users.unitId, schema.units.id))
    .where(eq(schema.users.status, 'PENDING')).orderBy(desc(schema.users.createdAt)))
    .filter((r) => canApprove(actor, { role: r.u.role as never, distributorId: r.u.distributorId, unitId: r.u.unitId }));
  const units = actor.distributorId ? await db.select().from(schema.units).where(eq(schema.units.distributorId, actor.distributorId)) : [];
  const dash = await managerDashboard(actor);
  const dists = actor.distributorId ? [] : (await db.select().from(schema.distributors)).filter((d) => !vis || vis.includes(d.id));
  return (<>
    <h1>Olá, {user.name.split(' ')[0]}</h1>
    <div className="grid">
      <div className="card"><div className="mu">Vendedores cadastrados</div><div className="kpi">{dash.users.sellersActive}</div><span className="mu">{dash.users.sellersPending} aguardando aprovação · {dash.users.new7} novos em 7 dias</span></div>
      <div className="card"><div className="mu">Ativos nos últimos 7 dias</div><div className="kpi">{dash.users.active7}</div><span className="mu">{dash.users.active7Pct}% dos cadastrados</span></div>
      <div className="card"><div className="mu">Campanhas em andamento</div><div className="kpi">{dash.campaigns.length}</div><span className="mu">{dash.closed} encerrada(s)</span></div>
      <div className="card"><div className="mu">Distribuidores</div><div className="kpi">{dash.distributors}</div><span className="mu">{dash.noSellers} sem vendedor ativo</span></div></div>
    <div className="card"><h2>Campanhas em andamento</h2>
      {!dash.campaigns.length && <p className="mu">Nenhuma campanha ativa ou agendada.</p>}
      {dash.campaigns.length > 0 && <table><thead><tr><th>Campanha</th><th>Situação</th><th>Semana</th><th>Vendedores</th><th>Participação</th><th>Acerto médio</th></tr></thead><tbody>
        {dash.campaigns.map((c) => <tr key={c.id}><td><Link href={`/painel/campanhas/${c.id}`}><b>{c.name}</b></Link><br /><span className="mu">{c.product}</span></td>
          <td>{c.status === 'ACTIVE' ? 'Ativa' : 'Agendada'}</td><td>{c.week}/{c.totalWeeks}</td><td>{c.reached}</td>
          <td>{c.participation === null ? '—' : c.participation + '%'}</td><td>{c.hitRate === null ? '—' : c.hitRate + '%'}</td></tr>)}</tbody></table>}</div>
    <div className="card"><h2>Vendedores ativos por semana</h2><p className="mu">Quem iniciou ou respondeu um quiz em cada semana (últimas 6).</p>
      <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', height: 120 }}>
        {dash.weekly.map((w, i) => { const max = Math.max(1, ...dash.weekly.map((x) => x.n)); return (
          <div key={i} style={{ flex: 1, textAlign: 'center' }}><div style={{ fontSize: 12, fontWeight: 700 }}>{w.n}</div>
            <div style={{ height: Math.max(4, (w.n / max) * 80), background: 'var(--g, #1E7B4F)', borderRadius: 6 }} /><div className="mu" style={{ fontSize: 11 }}>até {w.label}</div></div>); })}</div></div>
    <div className="grid">
      <div className="card"><h2>Por regional</h2><table><thead><tr><th>Regional</th><th>Vendedores</th><th>Ativos 7d</th></tr></thead><tbody>
        {dash.byReg.map((r) => <tr key={r.name}><td>{r.name}</td><td>{r.sellers}</td><td>{r.active7}{r.sellers ? ` (${Math.round((r.active7 / r.sellers) * 100)}%)` : ''}</td></tr>)}</tbody></table></div>
      <div className="card"><h2>Menos engajados</h2><p className="mu">Distribuidores com menor % de ativos em 7 dias.</p><table><tbody>
        {!dash.inactiveDists.length && <tr><td className="mu">Sem dados ainda.</td></tr>}
        {dash.inactiveDists.map((d) => <tr key={d.name}><td>{d.name}</td><td style={{ textAlign: 'right' }}>{d.active7}/{d.sellers}</td></tr>)}</tbody></table></div>
      <div className="card"><h2>Usuários por perfil</h2><table><tbody>
        {dash.roles.map((r) => <tr key={r.role}><td>{ROLE[r.role]}</td><td style={{ textAlign: 'right' }}>{r.n}</td></tr>)}</tbody></table></div></div>
    {dash.health && <div className="card"><h2>Saúde do app</h2><div className="grid">
      <div><div className="kpi">{dash.health.sent7}</div><span className="mu">e-mails enviados (7 dias)</span></div>
      <div><div className="kpi" style={dash.health.failed7 ? { color: '#b3261e' } : undefined}>{dash.health.failed7}</div><span className="mu">falhas de envio</span></div>
      <div><div className="kpi">{dash.health.queued}</div><span className="mu">na fila</span></div>
      <div><div className="kpi">{dash.health.codes7}</div><span className="mu">códigos de acesso (7 dias)</span></div>
      <div><div className="kpi">{dash.health.reportsOpen}</div><span className="mu"><Link href="/painel/correcoes">correções abertas</Link></span></div>
      <div><div className="kpi">{dash.health.pending}</div><span className="mu">cadastros pendentes</span></div></div>
      <p className="mu" style={{ marginTop: 8 }}>Último envio: {dash.health.lastSendAt ? fmtDate(dash.health.lastSendAt) : 'nenhum ainda'}. “Ativo” = iniciou ou respondeu um quiz.</p></div>}
    <div className="card"><h2>Aguardando aprovação ({pend.length})</h2>
      {!pend.length && <p className="mu">Ninguém na fila.</p>}
      <table><tbody>{pend.map((r) => (<tr key={r.u.id}><td><b>{r.u.name}</b><br /><span className="mu">{r.d} {r.un ? '· ' + r.un : ''} · {fmtDate(r.u.createdAt)}</span></td>
        <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
          <form action={aprovar} style={{ display: 'inline' }}><input type="hidden" name="id" value={r.u.id} /><button className="btn sm">Aprovar</button></form>{' '}
          <form action={recusar} style={{ display: 'inline' }}><input type="hidden" name="id" value={r.u.id} /><button className="btn sm sec">Recusar</button></form></td></tr>))}</tbody></table></div>
  </>);
}
