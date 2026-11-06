import Link from 'next/link';
import { eq } from 'drizzle-orm';
import { db, schema } from '@/db';
import { requirePanel, fmtDate } from '@/lib/web';
import { visibleDistributorIds } from '@/lib/access';
import { Form } from '@/app/forms';
import { aprovar, recusar, definirCarteira, editarUsuario, excluirUsuario } from '../actions';
import { Filtros, type F } from './filtros';
import { DistUnit } from './campos';
export const dynamic = 'force-dynamic';
const ROLE: Record<string, string> = { VENDEDOR: 'Vendedor', GESTOR: 'Gestor', REPRESENTANTE: 'Representante', REGIONAL: 'Regional', DIRETORIA: 'Diretoria', MARKETING: 'Marketing' };
const STATUS: Record<string, [string, string]> = { ACTIVE: ['Ativo', ''], LEFT: ['Inativo', ' cz'], PENDING: ['Pendente', ' am'], REJECTED: ['Recusado', ' rd'] };
type SP = Partial<Record<'papel' | 'regional' | 'dist' | 'unit' | 'q' | 'status' | 'edit' | 'del', string>>;

export default async function Usuarios({ searchParams }: { searchParams: Promise<SP> }) {
  const { user: me, actor } = await requirePanel(['MARKETING', 'GESTOR']); const sp = await searchParams;
  const vis = await visibleDistributorIds(actor);
  const allDists = await db.select().from(schema.distributors);
  const dists = allDists.filter((d) => vis === null || vis.includes(d.id));
  const units = (await db.select().from(schema.units)).filter((u) => dists.some((d) => d.id === u.distributorId));
  const regionals = await db.select().from(schema.regionals);
  const regOf = new Map(regionals.map((r) => [r.id, r.name]));
  const distOf = new Map(allDists.map((d) => [d.id, d]));
  const unitOf = new Map(units.map((u) => [u.id, u]));
  let all = (await db.select().from(schema.users)).filter((u) => me.role === 'MARKETING' || (u.distributorId && vis?.includes(u.distributorId)));
  const f: F = { papel: sp.papel ?? '', regional: sp.regional ?? '', dist: sp.dist ?? '', unit: sp.unit ?? '', q: sp.q ?? '', status: sp.status ?? '' };
  const q = f.q.toLowerCase();
  const rows = all.filter((u) => (!f.papel || u.role === f.papel) && (!f.dist || u.distributorId === f.dist) && (!f.unit || u.unitId === f.unit) && (!f.status || u.status === f.status)
    && (!f.regional || (u.distributorId && distOf.get(u.distributorId)?.regionalId === f.regional)) && (!q || u.name.toLowerCase().includes(q) || (u.email ?? '').toLowerCase().includes(q)))
    .sort((a, b) => ({ PENDING: 0, ACTIVE: 1, LEFT: 2, REJECTED: 3 } as Record<string, number>)[a.status] - ({ PENDING: 0, ACTIVE: 1, LEFT: 2, REJECTED: 3 } as Record<string, number>)[b.status] || a.name.localeCompare(b.name, 'pt-BR'));
  const roles = [...new Set(all.map((u) => u.role))];
  const canManage = (u: (typeof all)[number]) => me.role === 'MARKETING' || (u.role === 'VENDEDOR' && u.distributorId === actor.distributorId);
  const editing = sp.edit ? all.find((u) => u.id === sp.edit && canManage(u)) : null;
  const deleting = sp.del ? all.find((u) => u.id === sp.del && canManage(u) && u.id !== me.id) : null;
  const close = <Link href="/painel/usuarios" className="x" aria-label="Fechar">×</Link>;
  const assigns = editing?.role === 'REPRESENTANTE' ? await db.select().from(schema.repAssignments).where(eq(schema.repAssignments.userId, editing.id)) : [];
  const keep = (extra: SP) => { const p = new URLSearchParams(); for (const [k, v] of Object.entries({ ...f, ...extra })) if (v) p.set(k, v); return `/painel/usuarios?${p}`; };

  return (<>
    <h1>Usuários cadastrados</h1>
    <p className="mu" style={{ margin: '0 0 8px' }}>{rows.length} de {all.length} usuário(s)</p>
    <Filtros f={f} regionals={regionals} dists={dists} units={units} roles={roles} />
    <div className="card" style={{ overflowX: 'auto' }}><table><thead><tr><th>Usuário</th><th>Categoria</th><th>Canal vinculado</th><th>Status</th><th>Ações</th></tr></thead><tbody>
      {rows.map((u) => { const d = u.distributorId ? distOf.get(u.distributorId) : null; const un = u.unitId ? unitOf.get(u.unitId) : null; const [sl, sc] = STATUS[u.status] ?? [u.status, ''];
        return (<tr key={u.id}><td><b>{u.name}</b><br /><span className="mu">{u.email} · desde {fmtDate(u.createdAt)}</span></td>
          <td>{ROLE[u.role] ?? u.role}</td>
          <td>{d ? <>{d.name}{un ? ` · ${un.name}` : ''}<br /><span className="mu">{regOf.get(d.regionalId) ?? ''} · {d.type === 'COOPERATIVA' ? 'Cooperativa' : 'Revenda'}</span></> : '—'}</td>
          <td><span className={'pill' + sc} style={u.status === 'ACTIVE' ? { background: '#d7f0e0', color: '#1b6b43' } : undefined}>{sl}</span></td>
          <td style={{ whiteSpace: 'nowrap' }}>
            {u.status === 'PENDING' && <><form action={aprovar} style={{ display: 'inline' }}><input type="hidden" name="id" value={u.id} /><button className="btn sm">Aprovar</button></form>{' '}
              <form action={recusar} style={{ display: 'inline' }}><input type="hidden" name="id" value={u.id} /><button className="btn sm sec">Recusar</button></form>{' '}</>}
            {canManage(u) && <><Link href={keep({ edit: u.id })} className="btn sm sec">Editar</Link>{' '}{u.id !== me.id && <Link href={keep({ del: u.id })} className="btn sm sec">Excluir</Link>}</>}</td></tr>); })}
      {!rows.length && <tr><td colSpan={5} className="mu">Nenhum usuário neste filtro.</td></tr>}</tbody></table></div>

    {editing && <div className="ovl"><div className="box" style={{ maxWidth: 560 }}>{close}
      <h2 style={{ marginTop: 0 }}>Editar usuário</h2><p className="mu">{ROLE[editing.role]}</p>
      <Form action={editarUsuario} submit="Salvar alterações"><input type="hidden" name="id" value={editing.id} />
        <label>Nome<input name="nome" defaultValue={editing.name} required /></label>
        <label>E-mail<input name="email" type="email" defaultValue={editing.email ?? ''} required /></label>
        {(editing.role === 'VENDEDOR' || editing.role === 'GESTOR') && (me.role === 'MARKETING'
          ? <DistUnit dists={dists} units={units} dist={editing.distributorId ?? ''} unit={editing.unitId ?? ''} requireUnit={editing.role === 'VENDEDOR'} />
          : <label>Filial<select name="filial" defaultValue={editing.unitId ?? ''}>{units.filter((x) => x.distributorId === editing.distributorId).map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select></label>)}
        <label>Status da conta<select name="status" defaultValue={editing.status === 'ACTIVE' ? 'ACTIVE' : 'LEFT'}><option value="ACTIVE">Ativo</option><option value="LEFT">Inativo</option></select></label></Form>
      {editing.role === 'REPRESENTANTE' && me.role === 'MARKETING' && <form action={definirCarteira} style={{ marginTop: 18 }}><input type="hidden" name="id" value={editing.id} />
        <h2>Carteira de canais</h2>{allDists.map((d) => <label key={d.id} style={{ display: 'block', fontWeight: 400 }}><input type="checkbox" name="dists" value={d.id} defaultChecked={assigns.some((a) => a.distributorId === d.id)} style={{ width: 'auto' }} /> {d.name}</label>)}
        <button className="btn sm">Salvar carteira</button></form>}</div></div>}

    {deleting && <div className="ovl"><div className="box" style={{ maxWidth: 480 }}>{close}
      <h2 style={{ marginTop: 0 }}>Excluir usuário</h2>
      <Form action={excluirUsuario} submit="Confirmar exclusão"><input type="hidden" name="id" value={deleting.id} />
        <p>Excluir <b>{deleting.name}</b>? Respostas, pontos e histórico dela saem dos rankings e não dá para desfazer. Para só bloquear o acesso, use <b>Editar › Inativo</b>.</p></Form>
      <Link href="/painel/usuarios" className="btn sm sec" style={{ marginTop: 10 }}>Cancelar</Link></div></div>}
  </>);
}
