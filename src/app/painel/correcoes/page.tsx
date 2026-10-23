import { requirePanel } from '@/lib/web';
import { reportQueue } from '@/lib/reports';
import { resolver } from '../actions';
export const dynamic = 'force-dynamic';
export default async function Correcoes() {
  await requirePanel(['MARKETING']);
  const rows = [...await reportQueue('OPEN'), ...await reportQueue('REVIEW')];
  return (<><h1>Correções e sugestões</h1>{!rows.length && <div className="card">Fila vazia. 🎉</div>}
    {rows.map(({ r, q, uname, dist }) => (<div className="card" key={r.id}>
      <span className="pill am">{r.kind}</span> <span className="mu">{uname} · {dist}</span>
      {q && <p><b>{q.text}</b></p>}<p>{r.text}</p>
      <form action={resolver}><input type="hidden" name="id" value={r.id} />
        <input name="nota" placeholder="Nota para o vendedor (opcional)" />
        {q && <select name="certa" defaultValue=""><option value="">Manter alternativa correta</option>{q.options.map((o, i) => <option key={i} value={i}>Passa a ser: {o}</option>)}</select>}
        <div className="row" style={{ justifyContent: 'flex-start', flexWrap: 'wrap' }}>
          <button name="acao" value="FIX" className="btn sm">Corrigir</button><button name="acao" value="VOID" className="btn sm dng">Anular pergunta</button>
          <button name="acao" value="ASK_MORE" className="btn sm sec">Pedir detalhes</button><button name="acao" value="DISCARD" className="btn sm sec">Descartar</button></div></form></div>))}</>);
}
