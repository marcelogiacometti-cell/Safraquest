'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { salvarPlano, importarPlanilha } from '../../actions';
import type { CampaignPlanInput, PlanQuestion } from '@/lib/admin';

const LET = ['A', 'B', 'C', 'D'];
const blankQ = (): PlanQuestion & { options: string[] } => ({ sendDate: '', sendTime: '', text: '', options: ['', '', '', ''], correct: 0, explanation: '', topic: '', timeLimit: 30 });
const fmtDay = (d: string) => (d ? d.split('-').reverse().join('/') : '—');
const weekday = (d: string) => (d ? ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'][new Date(d + 'T12:00:00Z').getUTCDay()] : '');

type J = { sendDate: string; sendTime: string; qs: PlanQuestion[] };
const MAXQ = 5;
const groupJ = (qs: PlanQuestion[]): J[] => {
  const m = new Map<string, J>();
  for (const q of qs) { const k = q.sendDate + ' ' + q.sendTime; if (!m.has(k)) m.set(k, { sendDate: q.sendDate, sendTime: q.sendTime, qs: [] }); m.get(k)!.qs.push(q); }
  return [...m.values()].sort((a, b) => (a.sendDate + a.sendTime).localeCompare(b.sendDate + b.sendTime));
};
const flat = (js: J[]): PlanQuestion[] => js.flatMap((j) => j.qs.map((q) => ({ ...q, sendDate: j.sendDate, sendTime: j.sendTime })));
type Reg = { id: string; name: string }; type Dist = { id: string; name: string; type: 'COOPERATIVA' | 'REVENDA'; regionalId: string; sellers: number };
const TYPES: ['COOPERATIVA' | 'REVENDA', string][] = [['COOPERATIVA', 'Cooperativas'], ['REVENDA', 'Revendas']];

type Rep = { id: string; name: string; diretoria: string; distrito: string; territorio: string };
export function Builder({ regionals, dists, reps, initial, campaignId }: { regionals: Reg[]; dists: Dist[]; reps: Rep[]; initial: CampaignPlanInput; campaignId: string | null }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [f, setF] = useState({ name: initial.name, productName: initial.productName, objective: initial.objective ?? '', materialUrl: initial.materialUrl ?? '', speedBonus: !!initial.speedBonus });
  const [regs, setRegs] = useState<string[]>(initial.audience.regionalIds);
  const [types, setTypes] = useState<('COOPERATIVA' | 'REVENDA')[]>(initial.audience.types);
  const [picked, setPicked] = useState<string[]>(initial.audience.distributorIds);
  const [find, setFind] = useState('');
  const [dirs, setDirs] = useState<string[]>(initial.audience.diretorias ?? []);
  const [diss, setDiss] = useState<string[]>(initial.audience.distritos ?? []);
  const [ters, setTers] = useState<string[]>(initial.audience.territorios ?? []);
  const [repPicked, setRepPicked] = useState<string[]>(initial.audience.repIds ?? []);
  const [findRep, setFindRep] = useState('');
  const [js, setJs] = useState<J[]>(groupJ(initial.questions));
  const [editing, setEditing] = useState<{ j: number; idx: number | null; q: PlanQuestion } | null>(null);
  const [editJ, setEditJ] = useState<{ idx: number | null; sendDate: string; sendTime: string } | null>(null);
  const [jErr, setJErr] = useState('');
  const qs = flat(js);
  const [qErr, setQErr] = useState('');
  const [summary, setSummary] = useState(false);
  const [err, setErr] = useState('');
  const [imp, setImp] = useState<{ errors?: string[]; warnings?: string[]; ok?: string }>({});
  function doImport(file: File | undefined) {
    if (!file) return; setImp({});
    const fd = new FormData(); fd.set('arquivo', file);
    start(async () => {
      const r = await importarPlanilha(fd);
      if (r.error) return setImp({ errors: [r.error] });
      if (!r.plan) return setImp({ errors: r.errors, warnings: r.warnings });
      const pl = r.plan;
      setF({ name: pl.name, productName: pl.productName, objective: pl.objective ?? '', materialUrl: pl.materialUrl ?? '', speedBonus: !!pl.speedBonus });
      setRegs(pl.audience.regionalIds); setTypes(pl.audience.types); setPicked(pl.audience.distributorIds);
      setDirs(pl.audience.diretorias ?? []); setDiss(pl.audience.distritos ?? []); setTers(pl.audience.territorios ?? []); setRepPicked(pl.audience.repIds ?? []); setJs(groupJ(pl.questions));
      setImp({ warnings: r.warnings, ok: `Planilha importada: ${pl.questions.length} pergunta(s), ${pl.audience.distributorIds.length} canal(is) e ${(pl.audience.repIds ?? []).length} representante(s). Revise abaixo e clique em Finalizar campanha.` });
    });
  }


  function saveQ() {
    if (!editing) return; const q = editing.q;
    const opts = q.options.map((o) => o.trim());
    if (!q.text.trim()) return setQErr('Escreva o enunciado.');
    if (opts.filter(Boolean).length < 2) return setQErr('Preencha pelo menos 2 alternativas.');
    if (!opts[q.correct]) return setQErr('Marque como correta uma alternativa preenchida.');
    const clean = { ...q, options: opts.filter(Boolean), correct: opts.slice(0, q.correct).filter(Boolean).length };
    setJs(js.map((j, ji) => (ji !== editing.j ? j : { ...j, qs: editing.idx === null ? [...j.qs, clean] : j.qs.map((x, i) => (i === editing.idx ? clean : x)) })));
    setEditing(null); setQErr('');
  }
  function saveJ() {
    if (!editJ) return;
    if (!editJ.sendDate || !editJ.sendTime) return setJErr('Informe a data e o horário de disparo.');
    if (editJ.sendTime < '08:00' || editJ.sendTime > '19:00') return setJErr('O horário precisa estar entre 08:00 e 19:00.');
    if (new Date(editJ.sendDate + 'T12:00:00Z').getUTCDay() === 0) return setJErr('Não há disparos aos domingos.');
    if (js.some((j, i) => i !== editJ.idx && j.sendDate === editJ.sendDate && j.sendTime === editJ.sendTime)) return setJErr('Já existe uma jornada nesse dia e horário.');
    const next = editJ.idx === null ? [...js, { sendDate: editJ.sendDate, sendTime: editJ.sendTime, qs: [] }] : js.map((j, i) => (i === editJ.idx ? { ...j, sendDate: editJ.sendDate, sendTime: editJ.sendTime } : j));
    setJs(next.sort((a, b) => (a.sendDate + a.sendTime).localeCompare(b.sendDate + b.sendTime))); setEditJ(null); setJErr('');
  }
  const inRegs = (d: Dist) => !regs.length || regs.includes(d.regionalId);
  const inTypes = (d: Dist) => !types.length || types.includes(d.type);
  const matching = dists.filter((d) => inRegs(d) && inTypes(d));
  const visible = matching.filter((d) => !find.trim() || d.name.toLowerCase().includes(find.trim().toLowerCase()));
  const chosen = dists.filter((d) => picked.includes(d.id));
  const reach = chosen.reduce((n, d) => n + d.sellers, 0);
  // mudar região ou segmento remarca todos os canais que combinam com o filtro
  const reselect = (r: string[], t: ('COOPERATIVA' | 'REVENDA')[]) => setPicked(dists.filter((d) => (!r.length || r.includes(d.regionalId)) && (!t.length || t.includes(d.type))).map((d) => d.id));
  const toggleReg = (id: string) => { const r = regs.includes(id) ? regs.filter((x) => x !== id) : [...regs, id]; setRegs(r); reselect(r, types); };
  const toggleType = (t: 'COOPERATIVA' | 'REVENDA') => { const n = types.includes(t) ? types.filter((x) => x !== t) : [...types, t]; setTypes(n); reselect(regs, n); };
  // representantes Corteva: Diretoria › Distrito › Território, também encadeados
  const uq = (a: string[]) => [...new Set(a.filter(Boolean))].sort((x, y) => x.localeCompare(y, 'pt-BR'));
  const repIn = (r: Rep, d: string[], s: string[], t: string[]) => (!d.length || d.includes(r.diretoria)) && (!s.length || s.includes(r.distrito)) && (!t.length || t.includes(r.territorio));
  const repMatching = reps.filter((r) => repIn(r, dirs, diss, ters));
  const repVisible = repMatching.filter((r) => !findRep.trim() || r.name.toLowerCase().includes(findRep.trim().toLowerCase()));
  const repReselect = (d: string[], s: string[], t: string[]) => setRepPicked(reps.filter((r) => repIn(r, d, s, t)).map((r) => r.id));
  const tog = (a: string[], v: string) => (a.includes(v) ? a.filter((x) => x !== v) : [...a, v]);
  const toggleDir = (v: string) => { const d = tog(dirs, v); const s = diss.filter((x) => reps.some((r) => (!d.length || d.includes(r.diretoria)) && r.distrito === x)); const t = ters.filter((x) => reps.some((r) => (!d.length || d.includes(r.diretoria)) && (!s.length || s.includes(r.distrito)) && r.territorio === x)); setDirs(d); setDiss(s); setTers(t); repReselect(d, s, t); };
  const toggleDis = (v: string) => { const s = tog(diss, v); const t = ters.filter((x) => reps.some((r) => (!dirs.length || dirs.includes(r.diretoria)) && (!s.length || s.includes(r.distrito)) && r.territorio === x)); setDiss(s); setTers(t); repReselect(dirs, s, t); };
  const toggleTer = (v: string) => { const t = tog(ters, v); setTers(t); repReselect(dirs, diss, t); };
  const plan = (): CampaignPlanInput => ({ ...f, audience: { regionalIds: regs, types, distributorIds: picked, diretorias: dirs, distritos: diss, territorios: ters, repIds: repPicked }, questions: qs });
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
    if (!js.length) return setErr('Crie pelo menos uma jornada.');
    const empty = js.findIndex((j) => !j.qs.length);
    if (empty >= 0) return setErr(`A jornada ${empty + 1} está sem perguntas. Adicione perguntas ou exclua a jornada.`);
    if (!picked.length && !repPicked.length) return setErr('Escolha pelo menos um canal ou um representante para receber a campanha.');
    setSummary(true);
  }
  const set = (k: keyof typeof f, v: string | boolean) => setF({ ...f, [k]: v });

  return (<>
    <div className="card"><h2>Importar de Excel</h2>
      <p className="mu">Cadastre a campanha inteira numa planilha: baixe o modelo, preencha e envie. Você revisa tudo aqui antes de finalizar.</p>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
        <a className="btn sm sec" href="/painel/campanhas/modelo">⬇ Baixar modelo (.xlsx)</a>
        <label className="btn sm" style={{ cursor: 'pointer', margin: 0 }}>{pending ? 'Lendo…' : '⬆ Enviar planilha preenchida'}
          <input type="file" accept=".xlsx" style={{ display: 'none' }} disabled={pending} onChange={(e) => { doImport(e.target.files?.[0]); e.target.value = ''; }} /></label></div>
      {imp.ok && <p className="ok" style={{ marginTop: 10 }}>{imp.ok}</p>}
      {imp.warnings?.map((w, i) => <p key={i} className="mu" style={{ margin: '4px 0' }}>⚠ {w}</p>)}
      {!!imp.errors?.length && <div className="err" style={{ marginTop: 10 }}><b>Corrija a planilha e envie de novo:</b><ul style={{ margin: '6px 0 0 18px' }}>{imp.errors.map((e, i) => <li key={i}>{e}</li>)}</ul></div>}</div>

    <div className="card"><h2>Dados da campanha</h2>
      <label>Nome da campanha<input value={f.name} onChange={(e) => set('name', e.target.value)} placeholder="Ex.: Semana 43 · Lançamento Nutri+" /></label>
      <label>Tema / produto lançamento<input value={f.productName} onChange={(e) => set('productName', e.target.value)} /></label>
      <label>Objetivo (opcional)<input value={f.objective} onChange={(e) => set('objective', e.target.value)} /></label>
      <label>Link do material de apoio (opcional)<input value={f.materialUrl} onChange={(e) => set('materialUrl', e.target.value)} placeholder="https://" /></label>
      <label style={{ fontWeight: 400 }}><input type="checkbox" checked={f.speedBonus} onChange={(e) => set('speedBonus', e.target.checked)} style={{ width: 'auto' }} /> Bônus de velocidade</label></div>

    <div className="card"><h2>Quem recebe</h2>
      <p className="mu">Os filtros são ligados: a região e o segmento limitam a lista de canais, e os canais marcados são o público da campanha.</p>
      <div style={{ fontWeight: 600, fontSize: 14, margin: '8px 0 4px' }}>1. Região de disparo <span className="mu" style={{ fontWeight: 400 }}>(nenhuma marcada = todas)</span></div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {regionals.map((r) => { const n = dists.filter((d) => d.regionalId === r.id && inTypes(d)).length; const on = regs.includes(r.id); return (
          <button key={r.id} type="button" onClick={() => toggleReg(r.id)} className={'btn sm' + (on ? '' : ' sec')} disabled={!n && !on}>{r.name} · {n}</button>); })}</div>
      <div style={{ fontWeight: 600, fontSize: 14, margin: '14px 0 4px' }}>2. Segmentação de canais <span className="mu" style={{ fontWeight: 400 }}>(nenhuma marcada = todas)</span></div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {TYPES.map(([t, label]) => { const n = dists.filter((d) => d.type === t && inRegs(d)).length; const on = types.includes(t); return (
          <button key={t} type="button" onClick={() => toggleType(t)} className={'btn sm' + (on ? '' : ' sec')} disabled={!n && !on}>{label} · {n}</button>); })}</div>
      <div className="row" style={{ margin: '14px 0 4px', alignItems: 'flex-end', flexWrap: 'wrap' }}>
        <div style={{ fontWeight: 600, fontSize: 14 }}>3. Clientes (canais) <span className="mu" style={{ fontWeight: 400 }}>— {matching.length} na seleção</span></div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <input value={find} onChange={(e) => setFind(e.target.value)} placeholder="Buscar pelo nome" style={{ margin: 0, width: 200 }} />
          <button type="button" className="btn sm sec" onClick={() => setPicked([...new Set([...picked, ...visible.map((d) => d.id)])])}>Marcar todos</button>
          <button type="button" className="btn sm sec" onClick={() => setPicked(picked.filter((id) => !visible.some((d) => d.id === id)))}>Limpar</button></div></div>
      <div style={{ maxHeight: 260, overflowY: 'auto', border: '1px solid var(--bd)', borderRadius: 10, padding: '4px 12px' }}>
        {!visible.length && <p className="mu">Nenhum canal nesta seleção.</p>}
        {visible.map((d) => <label key={d.id} style={{ display: 'flex', gap: 8, alignItems: 'center', fontWeight: 400, padding: '5px 0' }}>
          <input type="checkbox" checked={picked.includes(d.id)} style={{ width: 'auto', margin: 0 }} onChange={(e) => setPicked(e.target.checked ? [...picked, d.id] : picked.filter((x) => x !== d.id))} />
          <span style={{ flex: 1 }}>{d.name}</span><span className="mu">{regionals.find((r) => r.id === d.regionalId)?.name} · {d.type === 'COOPERATIVA' ? 'Cooperativa' : 'Revenda'} · {d.sellers} vendedor(es)</span></label>)}</div>
      <p style={{ margin: '10px 0 0' }}><b>{chosen.length}</b> canal(is) selecionado(s) · <b>{reach}</b> vendedor(es) ativo(s) hoje</p></div>

    <div className="card"><h2>Representantes Corteva</h2>
      <p className="mu">Mesmo modelo dos canais: escolha a Diretoria, depois o Distrito e o Território, e marque quem recebe. Sem ninguém marcado, nenhum representante recebe a campanha.</p>
      {!reps.length ? <p className="mu">Nenhum representante ativo cadastrado ainda (Usuários › Adicionar usuários).</p> : <>
      <div style={{ fontWeight: 600, fontSize: 14, margin: '8px 0 4px' }}>1. Diretoria <span className="mu" style={{ fontWeight: 400 }}>(nenhuma marcada = todas)</span></div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>{uq(reps.map((r) => r.diretoria)).map((v) => <button key={v} type="button" onClick={() => toggleDir(v)} className={'btn sm' + (dirs.includes(v) ? '' : ' sec')}>{v} · {reps.filter((r) => r.diretoria === v).length}</button>)}</div>
      <div style={{ fontWeight: 600, fontSize: 14, margin: '14px 0 4px' }}>2. Distrito <span className="mu" style={{ fontWeight: 400 }}>(nenhum marcado = todos)</span></div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>{uq(reps.filter((r) => !dirs.length || dirs.includes(r.diretoria)).map((r) => r.distrito)).map((v) => <button key={v} type="button" onClick={() => toggleDis(v)} className={'btn sm' + (diss.includes(v) ? '' : ' sec')}>{v}</button>)}</div>
      <div style={{ fontWeight: 600, fontSize: 14, margin: '14px 0 4px' }}>3. Território <span className="mu" style={{ fontWeight: 400 }}>(nenhum marcado = todos)</span></div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>{uq(reps.filter((r) => (!dirs.length || dirs.includes(r.diretoria)) && (!diss.length || diss.includes(r.distrito))).map((r) => r.territorio)).map((v) => <button key={v} type="button" onClick={() => toggleTer(v)} className={'btn sm' + (ters.includes(v) ? '' : ' sec')}>{v}</button>)}</div>
      <div className="row" style={{ margin: '14px 0 4px', alignItems: 'flex-end', flexWrap: 'wrap' }}>
        <div style={{ fontWeight: 600, fontSize: 14 }}>4. Representantes <span className="mu" style={{ fontWeight: 400 }}>— {repMatching.length} na seleção</span></div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <input value={findRep} onChange={(e) => setFindRep(e.target.value)} placeholder="Buscar pelo nome" style={{ margin: 0, width: 200 }} />
          <button type="button" className="btn sm sec" onClick={() => setRepPicked([...new Set([...repPicked, ...repVisible.map((r) => r.id)])])}>Marcar todos</button>
          <button type="button" className="btn sm sec" onClick={() => setRepPicked(repPicked.filter((id) => !repVisible.some((r) => r.id === id)))}>Limpar</button></div></div>
      <div style={{ maxHeight: 240, overflowY: 'auto', border: '1px solid var(--bd)', borderRadius: 10, padding: '4px 12px' }}>
        {!repVisible.length && <p className="mu">Nenhum representante nesta seleção.</p>}
        {repVisible.map((r) => <label key={r.id} style={{ display: 'flex', gap: 8, alignItems: 'center', fontWeight: 400, padding: '5px 0' }}>
          <input type="checkbox" checked={repPicked.includes(r.id)} style={{ width: 'auto', margin: 0 }} onChange={(e) => setRepPicked(e.target.checked ? [...repPicked, r.id] : repPicked.filter((x) => x !== r.id))} />
          <span style={{ flex: 1 }}>{r.name}</span><span className="mu">{r.diretoria} › {r.distrito} › {r.territorio}</span></label>)}</div></>}
      <p style={{ margin: '10px 0 0' }}><b>{repPicked.length}</b> representante(s) selecionado(s)</p></div>

    <div className="card"><div className="row"><h2>Jornadas ({js.length})</h2>
      <button type="button" className="btn sm" onClick={() => { setJErr(''); setEditJ({ idx: null, sendDate: '', sendTime: '09:00' }); }}>＋ Nova jornada</button></div>
      <p className="mu">A campanha é um conjunto de jornadas. Cada jornada é um bloco de até {MAXQ} perguntas, enviado de uma vez na data e horário programados (08:00–19:00, exceto domingos).</p>
      {!js.length && <p className="mu">Nenhuma jornada ainda.</p>}
      {js.map((j, ji) => <div key={j.sendDate + j.sendTime} className="jcard" style={{ border: '1px solid var(--bd)', borderRadius: 12, padding: '12px 14px', margin: '12px 0' }}>
        <div className="row" style={{ alignItems: 'flex-start' }}>
          <div><b>Jornada {ji + 1}</b><br /><span className="mu">📅 {weekday(j.sendDate)} {fmtDay(j.sendDate)} às {j.sendTime} · {j.qs.length}/{MAXQ} pergunta(s)</span></div>
          <div style={{ whiteSpace: 'nowrap' }}>
            <button type="button" className="btn sm sec" onClick={() => { setJErr(''); setEditJ({ idx: ji, sendDate: j.sendDate, sendTime: j.sendTime }); }}>Data/horário</button>{' '}
            <button type="button" className="btn sm sec" onClick={() => { if (confirm('Excluir esta jornada e todas as suas perguntas?')) setJs(js.filter((_, k) => k !== ji)); }}>Excluir jornada</button></div></div>
        {j.qs.map((q, i) => <div key={i} className="row" style={{ borderTop: '1px solid var(--bd)', padding: '8px 0', alignItems: 'flex-start', marginTop: i === 0 ? 8 : 0 }}>
          <div><b>{i + 1}. {q.text}</b><br /><span className="mu">{q.topic ? `${q.topic} · ` : ''}{q.options.length} alternativas · correta: {LET[q.correct]}</span></div>
          <div style={{ whiteSpace: 'nowrap' }}>
            <button type="button" className="btn sm sec" onClick={() => { setQErr(''); setEditing({ j: ji, idx: i, q: { ...q, options: [...q.options, '', '', '', ''].slice(0, 4) } }); }}>Editar</button>{' '}
            <button type="button" className="btn sm sec" onClick={() => { if (confirm('Excluir esta pergunta?')) setJs(js.map((x, k) => (k === ji ? { ...x, qs: x.qs.filter((_, n) => n !== i) } : x))); }}>Excluir</button></div></div>)}
        <button type="button" className="btn sm" style={{ marginTop: 8 }} disabled={j.qs.length >= MAXQ} onClick={() => { setQErr(''); setEditing({ j: ji, idx: null, q: blankQ() }); }}>＋ Adicionar pergunta</button></div>)}</div>

    {err && <div className="err" role="alert">{err}</div>}
    <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 40 }}>
      <button type="button" className="btn" disabled={pending} onClick={review}>Finalizar campanha</button>
      <button type="button" className="btn sec" disabled={pending} onClick={() => save(false)}>Salvar rascunho</button></div>

    {editJ && <div className="ovl"><div className="box" style={{ maxWidth: 480 }}>
      <button type="button" className="x" onClick={() => setEditJ(null)} aria-label="Fechar">×</button>
      <h2 style={{ marginTop: 0 }}>{editJ.idx === null ? 'Nova jornada' : 'Data e horário da jornada'}</h2>
      <div className="grid"><label>Data de disparo<input type="date" value={editJ.sendDate} onChange={(e) => setEditJ({ ...editJ, sendDate: e.target.value })} /></label>
        <label>Horário de disparo<input type="time" value={editJ.sendTime} min="08:00" max="19:00" onChange={(e) => setEditJ({ ...editJ, sendTime: e.target.value })} /></label></div>
      {jErr && <div className="err" role="alert">{jErr}</div>}
      <div style={{ display: 'flex', gap: 10 }}><button type="button" className="btn" onClick={saveJ}>Salvar jornada</button><button type="button" className="btn sec" onClick={() => setEditJ(null)}>Cancelar</button></div></div></div>}

    {editing && <div className="ovl"><div className="box" style={{ maxWidth: 640 }}>
      <button type="button" className="x" onClick={() => setEditing(null)} aria-label="Fechar">×</button>
      <h2 style={{ marginTop: 0 }}>{editing.idx === null ? `Nova pergunta · Jornada ${editing.j + 1}` : `Editar pergunta · Jornada ${editing.j + 1}`}</h2>
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
      <p className="mu">Recebem: {repPicked.length} representante(s) Corteva · {chosen.length} canal(is), {reach} vendedor(es) ativo(s){regs.length ? ` · região: ${regs.map((id) => regionals.find((r) => r.id === id)?.name).join(', ')}` : ' · todas as regiões'}{types.length ? ` · ${types.map((t) => (t === 'COOPERATIVA' ? 'cooperativas' : 'revendas')).join(' e ')}` : ' · cooperativas e revendas'}</p>
      <p className="mu">Bônus de velocidade: {f.speedBonus ? 'sim' : 'não'}</p>
      <h2>{js.length} jornada(s) · {qs.length} pergunta(s)</h2>
      <table><tbody>{js.map((j, i) => <tr key={i}><td>Jornada {i + 1}</td><td>{weekday(j.sendDate)} {fmtDay(j.sendDate)} às {j.sendTime}</td><td>{j.qs.length} pergunta(s)</td></tr>)}</tbody></table>
      <p className="mu">Ao confirmar, a campanha fica agendada e os avisos saem por e-mail nas datas programadas.</p>
      {err && <div className="err" role="alert">{err}</div>}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <button type="button" className="btn" disabled={pending} onClick={() => save(true)}>{pending ? 'Aguarde…' : 'Confirmar'}</button>
        <button type="button" className="btn sec" disabled={pending} onClick={() => setSummary(false)}>Voltar para edição</button></div></div></div>}
  </>);
}
