import { asc, eq } from 'drizzle-orm';
import { notFound } from 'next/navigation';
import { db, schema } from '@/db';
import { requirePanel, fmtDate } from '@/lib/web';
import { campaignChecklist, campaignReach } from '@/lib/admin';
import { campaignEffectiveness } from '@/lib/effectiveness';
import { Form } from '@/app/forms';
import { salvarPergunta, apagarPergunta, definirGrupos, agendar, fecharApuracao, publicarVencedores } from '../../actions';
export const dynamic = 'force-dynamic';
export default async function Campanha({ params }: { params: Promise<{ id: string }> }) {
  const { actor, user } = await requirePanel(); const { id } = await params;
  const [c] = await db.select().from(schema.campaigns).where(eq(schema.campaigns.id, id)); if (!c) notFound();
  const mkt = user.role === 'MARKETING';
  const missions = await db.select().from(schema.missions).where(eq(schema.missions.campaignId, id)).orderBy(asc(schema.missions.number));
  const qs = await db.select().from(schema.questions).orderBy(asc(schema.questions.position));
  const groups = await db.select().from(schema.channelGroups);
  const chosen = new Set((await db.select().from(schema.campaignGroups).where(eq(schema.campaignGroups.campaignId, id))).map((g) => g.groupId));
  const chk = await campaignChecklist(id); const reach = await campaignReach(id);
  const eff = c.status !== 'DRAFT' ? await campaignEffectiveness(actor, { campaignId: id }) : null;
  const [closure] = await db.select().from(schema.closures).where(eq(schema.closures.campaignId, id));
  return (<>
    <h1>{c.name} <span className="pill">{c.status}</span></h1>
    <p className="mu">Produto: {c.productName} · alcance previsto: {JSON.stringify(reach)}</p>
    {eff && <div className="grid"><div className="card"><div className="kpi">{eff.kpis.reached}</div><span className="mu">vendedores</span></div>
      <div className="card"><div className="kpi">{eff.kpis.participationNow ?? '—'}%</div><span className="mu">participação atual</span></div>
      <div className="card"><div className="kpi">{eff.kpis.hitRate ?? '—'}%</div><span className="mu">acerto médio</span></div></div>}
    {mkt && <>
      <div className="card"><h2>Quem recebe</h2><form action={definirGrupos}><input type="hidden" name="campanha" value={id} />
        {groups.map((g) => <label key={g.id} style={{ display: 'block', fontWeight: 400 }}><input type="checkbox" name="grupos" value={g.id} defaultChecked={chosen.has(g.id)} style={{ width: 'auto' }} /> {g.name}</label>)}
        <button className="btn sm">Salvar grupos</button></form></div>
      <div className="card"><h2>Antes de agendar</h2>{chk.items.map((i, k) => <p key={k}>{i.ok ? '✅' : '⚠️'} {i.text}</p>)}
        {c.status === 'DRAFT' && <form action={agendar}><input type="hidden" name="campanha" value={id} /><button className="btn" disabled={!chk.ok}>Agendar campanha</button></form>}</div></>}
    {missions.map((m) => { const mq = qs.filter((q) => q.missionId === m.id); return (
      <div className="card" key={m.id}><div className="row"><h2>Missão {m.number}</h2><span className="mu">{fmtDate(m.opensAt)} → {fmtDate(m.closesAt)}</span></div>
        {mq.map((q) => <div key={q.id} className="row" style={{ borderTop: '1px solid var(--bd)', padding: '6px 0' }}><span>{q.text} <span className="pill">{q.topic}</span></span>
          {mkt && <form action={apagarPergunta}><input type="hidden" name="id" value={q.id} /><input type="hidden" name="campanha" value={id} /><button className="btn sm sec">Apagar</button></form>}</div>)}
        {mkt && mq.length < 5 && <details><summary>Adicionar pergunta ({mq.length}/5)</summary><Form action={salvarPergunta} submit="Salvar pergunta">
          <input type="hidden" name="missao" value={m.id} /><input type="hidden" name="campanha" value={id} />
          <label>Pergunta<textarea name="texto" rows={2} required /></label>
          {['a', 'b', 'c', 'd'].map((k, i) => <label key={k}>Alternativa {k.toUpperCase()}<input name={k} required={i < 2} /></label>)}
          <label>Correta<select name="certa"><option value="0">A</option><option value="1">B</option><option value="2">C</option><option value="3">D</option></select></label>
          <label>Tema<input name="tema" /></label><label>Explicação<input name="explicacao" /></label><label>Tempo (s)<input name="tempo" type="number" defaultValue={30} /></label>
        </Form></details>}</div>); })}
    {mkt && (c.status === 'ACTIVE' || c.status === 'CLOSED') && <div className="card"><h2>Vencedores</h2>
      {!closure && <form action={fecharApuracao}><input type="hidden" name="campanha" value={id} /><button className="btn">Fechar apuração</button><p className="mu">Só funciona depois da última missão. O resultado não muda depois.</p></form>}
      {closure && <><pre style={{ whiteSpace: 'pre-wrap', fontSize: 13 }}>{JSON.stringify(closure.payload, null, 2).slice(0, 3000)}</pre>
        {!closure.publishedAt ? <form action={publicarVencedores}><input type="hidden" name="campanha" value={id} /><button className="btn">Publicar vencedores</button></form> : <p className="ok">Publicado em {fmtDate(closure.publishedAt)}.</p>}</>}</div>}
  </>);
}
