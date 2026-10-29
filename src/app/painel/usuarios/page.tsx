import { eq } from 'drizzle-orm';
import { db, schema } from '@/db';
import { requirePanel, fmtDate } from '@/lib/web';
import { aprovar, recusar, definirCarteira, desativar } from '../actions';
export const dynamic = 'force-dynamic';
export default async function Usuarios() {
  await requirePanel(['MARKETING']);
  const us = await db.select({ u: schema.users, d: schema.distributors.name, un: schema.units.name }).from(schema.users)
    .leftJoin(schema.distributors, eq(schema.users.distributorId, schema.distributors.id)).leftJoin(schema.units, eq(schema.users.unitId, schema.units.id));
  const dists = await db.select().from(schema.distributors);
  const assigns = await db.select().from(schema.repAssignments);
  const rank = { PENDING: 0, ACTIVE: 1, REJECTED: 2, INACTIVE: 3 } as Record<string, number>;
  us.sort((a, b) => (rank[a.u.status] ?? 9) - (rank[b.u.status] ?? 9) || a.u.name.localeCompare(b.u.name));
  const reps = us.filter((r) => r.u.role === 'REPRESENTANTE' && r.u.status === 'ACTIVE');
  return (<><h1>Usuários ({us.length})</h1>
    <div className="card"><table><thead><tr><th>Nome</th><th>Papel</th><th>Onde</th><th>Situação</th><th></th></tr></thead><tbody>
      {us.map(({ u, d, un }) => (<tr key={u.id}><td><b>{u.name}</b><br /><span className="mu">{u.email} · {fmtDate(u.createdAt)}</span></td>
        <td>{u.role}</td><td>{d ?? '—'}{un ? ` · ${un}` : ''}</td>
        <td><span className={'pill' + (u.status === 'ACTIVE' ? '' : u.status === 'PENDING' ? ' am' : ' rd')}>{u.status}</span></td>
        <td style={{ whiteSpace: 'nowrap' }}>
          {u.status === 'PENDING' && <><form action={aprovar} style={{ display: 'inline' }}><input type="hidden" name="id" value={u.id} /><button className="btn sm">Aprovar</button></form>{' '}
            <form action={recusar} style={{ display: 'inline' }}><input type="hidden" name="id" value={u.id} /><button className="btn sm sec">Recusar</button></form></>}
          {u.status === 'ACTIVE' && u.role !== 'MARKETING' && <form action={desativar}><input type="hidden" name="id" value={u.id} /><button className="btn sm sec">Desativar</button></form>}</td></tr>))}
    </tbody></table></div>
    {reps.map(({ u }) => { const mine = new Set(assigns.filter((a) => a.userId === u.id).map((a) => a.distributorId)); return (
      <div className="card" key={u.id}><h2>Carteira de {u.name}</h2><p className="mu">Canais que este representante acompanha.</p>
        <form action={definirCarteira}><input type="hidden" name="id" value={u.id} />
          {dists.map((d) => <label key={d.id} style={{ display: 'block', fontWeight: 400 }}><input type="checkbox" name="dists" value={d.id} defaultChecked={mine.has(d.id)} style={{ width: 'auto' }} /> {d.name}</label>)}
          <button className="btn sm">Salvar carteira</button></form></div>); })}
  </>);
}
