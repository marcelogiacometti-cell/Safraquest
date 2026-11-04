import { db, schema } from '@/db';
import { requirePanel } from '@/lib/web';
import { Form } from '@/app/forms';
import { criarDistribuidor, criarGrupo, criarRegional, renomearRegional, apagarRegional, moverDistribuidor, editarDistribuidor, excluirDistribuidor, editarGrupo, excluirGrupo } from '../actions';
export const dynamic = 'force-dynamic';
export default async function Estrutura() {
  await requirePanel(['MARKETING']);
  const regs = (await db.select().from(schema.regionals)).sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
  const ds = await db.select().from(schema.distributors); const us = await db.select().from(schema.units);
  const groups = await db.select().from(schema.channelGroups);
  const regName = new Map(regs.map((r) => [r.id, r.name]));
  return (<><h1>Estrutura</h1>
    <div className="card"><h2>Regionais</h2><p className="mu">Usadas para segmentar distribuidores, grupos de canais e filtros dos relatórios.</p>
      {regs.map((r) => { const n = ds.filter((d) => d.regionalId === r.id).length; return (
        <div key={r.id} className="row" style={{ borderTop: '1px solid var(--bd)', padding: '8px 0', alignItems: 'flex-start' }}>
          <Form action={renomearRegional} submit="Renomear" small className="row"><input type="hidden" name="id" value={r.id} /><input name="nome" defaultValue={r.name} style={{ margin: 0, minWidth: 220 }} /></Form>
          <span className="mu" style={{ whiteSpace: 'nowrap' }}>{n} distribuidor(es)
            {n === 0 && <form action={apagarRegional} style={{ display: 'inline', marginLeft: 8 }}><input type="hidden" name="id" value={r.id} /><button className="btn sm sec">Apagar</button></form>}</span></div>); })}
      <Form action={criarRegional} submit="Adicionar regional"><label>Nova regional<input name="nome" required /></label></Form></div>
    <div className="card"><h2>Canais (distribuidores)</h2><table><thead><tr><th>Canal</th><th>Tipo</th><th>Regional</th><th>Unidades</th><th>Ações</th></tr></thead><tbody>
      {ds.map((d) => <tr key={d.id}><td>{d.name}</td><td>{d.type === 'COOPERATIVA' ? 'Cooperativa' : 'Revenda'}</td><td>{regName.get(d.regionalId)}</td>
        <td>{us.filter((u) => u.distributorId === d.id).map((u) => u.name).join(', ')}</td>
        <td style={{ minWidth: 260 }}>
          <details><summary className="btn sm sec" style={{ display: 'inline-block' }}>Editar</summary>
            <Form action={editarDistribuidor} submit="Salvar" small><input type="hidden" name="id" value={d.id} />
              <label>Nome<input name="nome" defaultValue={d.name} required /></label>
              <label>Tipo<select name="tipo" defaultValue={d.type}><option value="COOPERATIVA">Cooperativa</option><option value="REVENDA">Revenda</option></select></label>
              <label>Regional<select name="regional" defaultValue={d.regionalId}>{regs.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</select></label></Form></details>
          <details style={{ marginTop: 6 }}><summary className="btn sm sec" style={{ display: 'inline-block' }}>Excluir</summary>
            <Form action={excluirDistribuidor} submit="Confirmar exclusão" small><input type="hidden" name="id" value={d.id} />
              <p className="mu">Excluir <b>{d.name}</b> e suas unidades? Não dá para desfazer. Canais com usuários cadastrados não podem ser excluídos.</p></Form></details></td></tr>)}</tbody></table></div>
    <div className="card"><h2>Novo distribuidor</h2><Form action={criarDistribuidor} submit="Criar">
      <label>Nome<input name="nome" required /></label>
      <label>Tipo<select name="tipo"><option value="COOPERATIVA">Cooperativa</option><option value="REVENDA">Revenda</option></select></label>
      <label>Regional<select name="regional">{regs.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</select></label>
      <label>Primeira unidade<input name="unidade" defaultValue="Matriz" /></label></Form></div>
    <div className="card"><h2>Grupos de canais</h2>
      {groups.map((g) => <div key={g.id} className="row" style={{ borderTop: '1px solid var(--bd)', padding: '8px 0', alignItems: 'flex-start', gap: 12 }}>
        <span style={{ minWidth: 220 }}><b>{g.name}</b><br /><span className="mu">{[g.regionalId ? regName.get(g.regionalId) : 'Todas as regionais', g.type ? (g.type === 'COOPERATIVA' ? 'cooperativas' : 'revendas') : 'todos os tipos'].join(' · ')}</span></span>
        <details><summary className="btn sm sec" style={{ display: 'inline-block' }}>Editar</summary>
          <Form action={editarGrupo} submit="Salvar" small><input type="hidden" name="id" value={g.id} />
            <label>Nome<input name="nome" defaultValue={g.name} required /></label>
            <label>Tipo<select name="tipo" defaultValue={g.type ?? ''}><option value="">Todos</option><option value="COOPERATIVA">Cooperativas</option><option value="REVENDA">Revendas</option></select></label>
            <label>Regional<select name="regional" defaultValue={g.regionalId ?? ''}><option value="">Todas</option>{regs.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</select></label></Form></details>
        <details><summary className="btn sm sec" style={{ display: 'inline-block' }}>Excluir</summary>
          <Form action={excluirGrupo} submit="Confirmar exclusão" small><input type="hidden" name="id" value={g.id} /><p className="mu">Excluir o grupo <b>{g.name}</b>? Os canais não são afetados.</p></Form></details></div>)}
      <Form action={criarGrupo} submit="Criar grupo">
        <label>Nome<input name="nome" required placeholder="Ex.: Cooperativas do Centro Sul" /></label>
        <label>Tipo<select name="tipo"><option value="">Todos</option><option value="COOPERATIVA">Cooperativas</option><option value="REVENDA">Revendas</option></select></label>
        <label>Regional<select name="regional"><option value="">Todas</option>{regs.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</select></label></Form></div></>);
}
