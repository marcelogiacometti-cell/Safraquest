import { requirePanel, fmtDate } from '@/lib/web';
import { reportQueue } from '@/lib/reports';
import { resolver } from '../actions';
export const dynamic = 'force-dynamic';
const KIND: Record<string, string> = { ERROR: 'Pergunta com erro', CONFUSING: 'Pergunta confusa', OUTDATED: 'Informação desatualizada', SUGGESTION: 'Sugestão', OTHER: 'Problema ou dúvida' };
export default async function Correcoes() {
  await requirePanel(['MARKETING']); // só o Marketing vê as mensagens enviadas
  const rows = [...await reportQueue('OPEN'), ...await reportQueue('REVIEW')].sort((a, b) => b.r.createdAt.getTime() - a.r.createdAt.getTime());
  const done = (await reportQueue('DONE')).sort((a, b) => b.r.createdAt.getTime() - a.r.createdAt.getTime());
  return (<><h1>Correções e sugestões</h1>
    <p className="mu">Mensagens enviadas por vendedores, gestores e representantes. Só o Marketing vê esta lista. ({rows.length} em aberto)</p>
    {!rows.length && <div className="card">Nenhuma mensagem em aberto. 🎉</div>}
    {rows.map(({ r, q, uname, dist }) => (<div className="card" key={r.id}>
      <span className="pill am">{KIND[r.kind] ?? r.kind}</span>{r.status === 'REVIEW' && <span className="pill cz" style={{ marginLeft: 6 }}>aguardando detalhes</span>} <span className="mu">{uname}{dist ? ` · ${dist}` : ''} · {fmtDate(r.createdAt)}{r.topic ? ` · ${r.topic}` : ''}</span>
      {q && <p><b>{q.text}</b></p>}<p style={{ whiteSpace: 'pre-wrap' }}>{r.text}</p>
      <form action={resolver}><input type="hidden" name="id" value={r.id} />
        <input name="nota" placeholder="Nota para quem enviou (opcional)" />
        {q && <select name="certa" defaultValue=""><option value="">Manter alternativa correta</option>{q.options.map((o, i) => <option key={i} value={i}>Passa a ser: {o}</option>)}</select>}
        <div className="row" style={{ justifyContent: 'flex-start', flexWrap: 'wrap' }}>
          {q ? <><button name="acao" value="FIX" className="btn sm">Corrigir</button><button name="acao" value="VOID" className="btn sm dng">Anular pergunta</button></>
            : <button name="acao" value="ACK" className="btn sm">Agradecer e encerrar</button>}
          <button name="acao" value="ASK_MORE" className="btn sm sec">Pedir detalhes</button><button name="acao" value="DISCARD" className="btn sm sec">Descartar</button></div></form></div>))}
    {done.length > 0 && <details className="card"><summary style={{ cursor: 'pointer', fontWeight: 700 }}>Encerradas ({done.length})</summary>
      <table><tbody>{done.slice(0, 50).map(({ r, uname }) => <tr key={r.id}><td>{KIND[r.kind] ?? r.kind}<br /><span className="mu">{uname} · {fmtDate(r.createdAt)}</span></td><td style={{ whiteSpace: 'pre-wrap' }}>{r.text}</td><td className="mu">{r.resolution}</td></tr>)}</tbody></table></details>}</>);
}
