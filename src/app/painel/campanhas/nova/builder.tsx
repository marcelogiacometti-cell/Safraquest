'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { salvarPlano } from '../../actions';
import type { CampaignPlanInput, PlanQuestion } from '@/lib/admin';

const LET = ['A', 'B', 'C', 'D'];
const blankQ = (): PlanQuestion & { options: string[] } => ({ sendDate: '', sendTime: '09:00', text: '', options: ['', '', '', ''], correct: 0, explanation: '', topic: '', timeLimit: 30 });
const fmtDay = (d: string) => (d ? d.split('-').reverse().join('/') : '—');
const weekday = (d: string) => (d ? ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'][new Date(d + 'T12:00:00Z').getUTCDay()] : '');

export function Builder({ groups, initial, campaignId }: { groups: { id: string; name: string }[]; initial: CampaignPlanInput; campaignId: string | null }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [f, setF] = useState({ name: initial.name, productName: initial.productName, objective: initial.objective ?? '', materialUrl: initial.materialUrl ?? '', speedBonus: !!initial.speedBonus });
  const [groupIds, setGroupIds] = useState<string[]>(initial.groupIds);
  const [qs, setQs] = useState<PlanQuestion[]>(initial.questions);
  const [editing, setEditing] = useState<{ idx: number | null; q: PlanQuestion } | null>(null);
  const [qErr, setQErr] = useState('');
  const [summary, setSummary] = useState(false);
  const [err, setErr] = useState('');

  const sorted = qs.map((q, i) => ({ q, i })).sort((a, b) => (a.q.sendDate + a.q.sendTime).localeCompare(b.q.sendDate + b.q.sendTime) || a.i - b.i);
  const quizzes = [...new Map(sorted.map(({ q }) => [q.sendDate + ' ' + q.sendTime, q])).values()].map((first) => ({ when: first, n: qs.filter((q) => q.sendDate === first.sendDate && q.sendTime === first.sendTime).length }));

  function saveQ() {
    if (!editing) return; const q = editing.q;
    const opts = q.options.map((o) => o.trim());
    if (!q.text.trim()) return setQErr('Escreva o enunciado.');
    if (opts.filter(Boolean).length < 2) return setQErr('Preencha pelo menos 2 alternativas.');
    if (!opts[q.correct]) return setQErr('Marque como correta uma alternativa preenchida.');
    if (!q.sendDate || !q.sendTime) return setQErr('Informe a data e o horário de envio.');
    const clean = { ...q, options: opts.filter(Boolean), correct: opts.slice(0, q.correct).filter(Boolean).length };
    setQs(editing.idx === null ? [...qs, clean] : qs.map((x, i) => (i === editing.idx ? clean : x)));
    setEditing(null); setQErr('');
  }
  const plan = (): CampaignPlanInput => ({ ...f, groupIds, questions: qs });
  function save(finalize: boolean) {
    setErr('');
    start(async () => {
      const r = await salvarPlano(campaignId, plan(), finalize);
      if (r.error) { setErr(r.error); setSummary(false); return; }
      router.push(finalize ? `/painel/campanhas?c=${r.id}` : '/painel/campanhas');
    });
  }
  function review() {
    setErr('');
    if (!f.name.trim() || !f.productName.trim()) return setErr('Preencha o nome e o tema da campanha.');
    if (!qs.length) return setErr('Adicione pelo menos uma pergunta.');
    if (!groupIds.length) return setErr('Escolha quem recebe a campanha.');
    setSummary(true);
  }
  const set = (k: keyof typeof f, v: string | boolean) => setF({ ...f, [k]: v });
  const gName = (id: string) => groups.find((g) => g.id === id)?.name ?? id;

  return (<>
    <div className="card"><h2>Dados da campanha</h2>
      <label>Nome da campanha<input value={f.name} onChange={(e) => set('name', e.target.value)} placeholder="Ex.: Semana 43 · Lançamento Nutri+" /></label>
      <label>Tema / produto lançamento<input value={f.productName} onChange={(e) => set('productName', e.target.value)} /></label>
      <label>Objetivo (opcional)<input value={f.objective} onChange={(e) => set('objective', e.target.value)} /></label>
      <label>Link do material de apoio (opcional)<input value={f.materialUrl} onChange={(e) => set('materialUrl', e.target.value)} placeholder="https://" /></label>
      <label style={{ fontWeight: 400 }}><input type="checkbox" checked={f.speedBonus} onChange={(e) => set('speedBonus', e.target.checked)} style={{ width: 'auto' }} /> Bônus de velocidade</label></div>

    <div className="card"><h2>Quem recebe</h2>
      {!groups.length && <p className="mu">Nenhum grupo de canais. Crie em Estrutura › Grupos de canais.</p>}
      {groups.map((g) => <label key={g.id} style={{ display: 'block', fontWeight: 400 }}><input type="checkbox" checked={groupIds.includes(g.id)} style={{ width: 'auto' }}
        onChange={(e) => setGroupIds(e.target.checked ? [...groupIds, g.id] : groupIds.filter((x) => x !== g.id))} /> {g.name}</label>)}</div>

    <div className="card"><div className="row"><h2>Perguntas ({qs.length})</h2>
      <button type="button" className="btn sm" onClick={() => { setQErr(''); setEditing({ idx: null, q: blankQ() }); }}>＋ Adicionar nova pergunta</button></div>
      <p className="mu">Cada pergunta tem a sua data e horário de envio. Perguntas com a mesma data e horário formam o mesmo quiz (até 5). Envios só entre 08:00 e 19:00, exceto domingos.</p>
      {!qs.length && <p className="mu">Nenhuma pergunta ainda.</p>}
      {sorted.map(({ q, i }, n) => <div key={i} className="row" style={{ borderTop: '1px solid var(--bd)', padding: '10px 0', alignItems: 'flex-start' }}>
        <div><b>{n + 1}. {q.text}</b><br /><span className="mu">📅 {weekday(q.sendDate)} {fmtDay(q.sendDate)} às {q.sendTime}{q.topic ? ` · ${q.topic}` : ''} · {q.options.length} alternativas · correta: {LET[q.correct]}</span></div>
        <div style={{ whiteSpace: 'nowrap' }}>
          <button type="button" className="btn sm sec" onClick={() => { setQErr(''); setEditing({ idx: i, q: { ...q, options: [...q.options, '', '', '', ''].slice(0, 4) } }); }}>Editar</button>{' '}
          <button type="button" className="btn sm sec" onClick={() => { if (confirm('Excluir esta pergunta?')) setQs(qs.filter((_, k) => k !== i)); }}>Excluir</button></div></div>)}</div>

    {err && <div className="err" role="alert">{err}</div>}
    <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 40 }}>
      <button type="button" className="btn" disabled={pending} onClick={review}>Finalizar campanha</button>
      <button type="button" className="btn sec" disabled={pending} onClick={() => save(false)}>Salvar rascunho</button></div>

    {editing && <div className="ovl"><div className="box" style={{ maxWidth: 640 }}>
      <button type="button" className="x" onClick={() => setEditing(null)} aria-label="Fechar">×</button>
      <h2 style={{ marginTop: 0 }}>{editing.idx === null ? 'Nova pergunta' : 'Editar pergunta'}</h2>
      <div className="grid"><label>Data de envio<input type="date" value={editing.q.sendDate} onChange={(e) => setEditing({ ...editing, q: { ...editing.q, sendDate: e.target.value } })} /></label>
        <label>Horário de envio<input type="time" value={editing.q.sendTime} min="08:00" max="19:00" onChange={(e) => setEditing({ ...editing, q: { ...editing.q, sendTime: e.target.value } })} /></label></div>
      <label>Pergunta<textarea rows={2} value={editing.q.text} onChange={(e) => setEditing({ ...editing, q: { ...editing.q, text: e.target.value } })} /></label>
      {LET.map((l, k) => <label key={l}>Alternativa {l}<div className="row" style={{ gap: 8 }}>
        <input value={editing.q.options[k] ?? ''} onChange={(e) => { const o = [...editing.q.options]; o[k] = e.target.value; setEditing({ ...editing, q: { ...editing.q, options: o } }); }} />
        <span style={{ whiteSpace: 'nowrap', fontWeight: 400 }}><input type="radio" name="correta" checked={editing.q.correct === k} onChange={() => setEditing({ ...editing, q: { ...editing.q, correct: k } })} style={{ width: 'auto', margin: 0 }} /> correta</span></div></label>)}
      <div className="grid"><label>Tema<input value={editing.q.topic ?? ''} onChange={(e) => setEditing({ ...editing, q: { ...editing.q, topic: e.target.value } })} /></label>
        <label>Tempo (segundos)<input type="number" min={5} value={editing.q.timeLimit ?? 30} onChange={(e) => setEditing({ ...editing, q: { ...editing.q, timeLimit: Number(e.target.value) } })} /></label></div>
      <label>Explicação da resposta (opcional)<input value={editing.q.explanation ?? ''} onChange={(e) => setEditing({ ...editing, q: { ...editing.q, explanation: e.target.value } })} /></label>
      {qErr && <div className="err" role="alert">{qErr}</div>}
      <div style={{ display: 'flex', gap: 10 }}><button type="button" className="btn" onClick={saveQ}>Salvar pergunta</button><button type="button" className="btn sec" onClick={() => setEditing(null)}>Cancelar</button></div></div></div>}

    {summary && <div className="ovl"><div className="box" style={{ maxWidth: 640 }}>
      <h2 style={{ marginTop: 0 }}>Resumo da campanha</h2>
      <p><b>{f.name}</b><br /><span className="mu">Tema: {f.productName}{f.objective ? ` · ${f.objective}` : ''}</span></p>
      <p className="mu">Recebem: {groupIds.map(gName).join(', ')}</p>
      <p className="mu">Bônus de velocidade: {f.speedBonus ? 'sim' : 'não'}</p>
      <h2>{qs.length} pergunta(s) em {quizzes.length} quiz(zes)</h2>
      <table><tbody>{quizzes.map((z, i) => <tr key={i}><td>Quiz {i + 1}</td><td>{weekday(z.when.sendDate)} {fmtDay(z.when.sendDate)} às {z.when.sendTime}</td><td>{z.n} pergunta(s)</td></tr>)}</tbody></table>
      <p className="mu">Ao confirmar, a campanha fica agendada e os avisos saem por e-mail nas datas programadas.</p>
      {err && <div className="err" role="alert">{err}</div>}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <button type="button" className="btn" disabled={pending} onClick={() => save(true)}>{pending ? 'Aguarde…' : 'Confirmar'}</button>
        <button type="button" className="btn sec" disabled={pending} onClick={() => setSummary(false)}>Voltar para edição</button></div></div></div>}
  </>);
}
