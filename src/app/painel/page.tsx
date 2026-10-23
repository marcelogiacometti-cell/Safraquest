import { and, desc, eq, inArray } from 'drizzle-orm';
import { db, schema } from '@/db';
import { requirePanel, fmtDate } from '@/lib/web';
import { visibleDistributorIds, canApprove } from '@/lib/access';
import { aprovar, recusar, gerarConvite } from './actions';
import { Form } from '@/app/forms';
export const dynamic = 'force-dynamic';
export default async function Resumo() {
  const { user, actor } = await requirePanel();
  const vis = await visibleDistributorIds(actor);
  const pend = (await db.select({ u: schema.users, d: schema.distributors.name, un: schema.units.name }).from(schema.users)
    .leftJoin(schema.distributors, eq(schema.users.distributorId, schema.distributors.id)).leftJoin(schema.units, eq(schema.users.unitId, schema.units.id))
    .where(eq(schema.users.status, 'PENDING')).orderBy(desc(schema.users.createdAt)))
    .filter((r) => canApprove(actor, { role: r.u.role as never, distributorId: r.u.distributorId, unitId: r.u.unitId }));
  const units = actor.distributorId ? await db.select().from(schema.units).where(eq(schema.units.distributorId, actor.distributorId)) : [];
  const dists = actor.distributorId ? [] : (await db.select().from(schema.distributors)).filter((d) => !vis || vis.includes(d.id));
  return (<>
    <h1>Olá, {user.name.split(' ')[0]}</h1>
    <div className="card"><h2>Aguardando aprovação ({pend.length})</h2>
      {!pend.length && <p className="mu">Ninguém na fila.</p>}
      <table><tbody>{pend.map((r) => (<tr key={r.u.id}><td><b>{r.u.name}</b><br /><span className="mu">{r.d} {r.un ? '· ' + r.un : ''} · {fmtDate(r.u.createdAt)}</span></td>
        <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
          <form action={aprovar} style={{ display: 'inline' }}><input type="hidden" name="id" value={r.u.id} /><button className="btn sm">Aprovar</button></form>{' '}
          <form action={recusar} style={{ display: 'inline' }}><input type="hidden" name="id" value={r.u.id} /><button className="btn sm sec">Recusar</button></form></td></tr>))}</tbody></table></div>
    <div className="card"><h2>Link de cadastro</h2>
      <Form action={gerarConvite} submit="Gerar link">
        <input type="hidden" name="papel" value="VENDEDOR" />
        {actor.distributorId ? <input type="hidden" name="dist" value={actor.distributorId} /> : <label>Distribuidor<select name="dist" required defaultValue="">{<option value="" disabled>Escolha…</option>}{dists.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</select></label>}
        {units.length > 0 && <label>Unidade<select name="unidade" defaultValue=""><option value="">Vendedor escolhe</option>{units.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</select></label>}
        <label>Validade (dias)<input name="dias" type="number" defaultValue={7} min={1} max={90} /></label>
        <label>Máximo de cadastros (opcional)<input name="usos" type="number" min={1} /></label>
      </Form></div>
  </>);
}
