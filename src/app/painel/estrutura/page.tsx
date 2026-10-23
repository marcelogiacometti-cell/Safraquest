import { db, schema } from '@/db';
import { requirePanel } from '@/lib/web';
import { Form } from '@/app/forms';
import { criarDistribuidor, criarGrupo } from '../actions';
export const dynamic = 'force-dynamic';
export default async function Estrutura() {
  await requirePanel(['MARKETING']);
  const regs = await db.select().from(schema.regionals); const ds = await db.select().from(schema.distributors); const us = await db.select().from(schema.units);
  return (<><h1>Estrutura</h1>
    <div className="card"><table><thead><tr><th>Distribuidor</th><th>Tipo</th><th>Unidades</th></tr></thead><tbody>
      {ds.map((d) => <tr key={d.id}><td>{d.name}<br /><span className="mu">{d.id}</span></td><td>{d.type}</td><td>{us.filter((u) => u.distributorId === d.id).map((u) => u.name).join(', ')}</td></tr>)}</tbody></table></div>
    <div className="card"><h2>Novo distribuidor</h2><Form action={criarDistribuidor} submit="Criar">
      <label>Nome<input name="nome" required /></label>
      <label>Tipo<select name="tipo"><option value="COOPERATIVA">Cooperativa</option><option value="REVENDA">Revenda</option></select></label>
      <label>Regional<select name="regional">{regs.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</select></label>
      <label>Primeira unidade<input name="unidade" defaultValue="Matriz" /></label></Form></div>
    <div className="card"><h2>Novo grupo de canais</h2><Form action={criarGrupo} submit="Criar grupo">
      <label>Nome<input name="nome" required /></label>
      <label>Tipo<select name="tipo"><option value="">Todos</option><option value="COOPERATIVA">Cooperativas</option><option value="REVENDA">Revendas</option></select></label></Form></div></>);
}
