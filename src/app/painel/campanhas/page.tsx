import Link from 'next/link';
import { desc } from 'drizzle-orm';
import { db, schema } from '@/db';
import { requirePanel } from '@/lib/web';
import { campaignEffectiveness } from '@/lib/effectiveness';
import { Detalhe } from './detalhe';
export const dynamic = 'force-dynamic';
const ST: Record<string, [string, string]> = { ACTIVE: ['ativa', ''], SCHEDULED: ['agendada', ' am'], CLOSED: ['encerrada', ' cz'], DRAFT: ['rascunho', ' lg2'] };
const day = (d: Date | null) => (d ? new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric' }).format(d) : '—');
export default async function Campanhas({ searchParams }: { searchParams: Promise<{ c?: string }> }) {
  const { user, actor } = await requirePanel(); const sp = await searchParams;
  const list = await db.select().from(schema.campaigns).orderBy(desc(schema.campaigns.createdAt));
  const qs = await db.select({ campaignId: schema.questions.campaignId }).from(schema.questions);
  const cards = [];
  for (const c of list) {
    const eff = c.status === 'ACTIVE' || c.status === 'CLOSED' ? await campaignEffectiveness(actor, { campaignId: c.id }) : null;
    cards.push({ c, n: qs.filter((q) => q.campaignId === c.id).length, part: eff?.kpis.participationNow ?? null, hit: eff?.kpis.hitRate ?? null, showBars: !!eff });
  }
  const mkt = user.role === 'MARKETING';
  return (<>
    <div className="row" style={{ alignItems: 'flex-start', flexWrap: 'wrap' }}>
      <div><h1 style={{ margin: '4px 0' }}>Campanhas</h1><p className="mu" style={{ margin: 0, fontSize: 16 }}>Perguntas semanais enviadas por e-mail</p></div>
      {mkt && <Link href="/painel/campanhas/nova" className="btn">＋ Nova campanha</Link>}</div>
    <div className="cgrid">
      {cards.map(({ c, n, part, hit, showBars }) => { const [label, cls] = ST[c.status] ?? [c.status, '']; return (
        <Link key={c.id} href={c.status === 'DRAFT' && mkt ? `/painel/campanhas/nova?id=${c.id}` : `/painel/campanhas?c=${c.id}`} className="ccard">
          <div className="row"><span className={'pill' + cls}>{label}</span><span className="mu">📅 {day(c.startDate ?? c.createdAt)}</span></div>
          <h3>{c.name}</h3><div className="mu">{c.productName} · {n} pergunta{n === 1 ? '' : 's'}</div>
          {showBars && <>
            <div className="mrow"><span>Participação</span><b>{part === null ? '—' : part + '%'}</b></div><div className="bar t"><i style={{ width: (part ?? 0) + '%' }} /></div>
            <div className="mrow"><span>Acerto</span><b>{hit === null ? '—' : hit + '%'}</b></div><div className="bar t"><i style={{ width: (hit ?? 0) + '%' }} /></div></>}
        </Link>); })}
      {!cards.length && <p className="mu">Nenhuma campanha ainda. {mkt && 'Clique em “Nova campanha” para começar.'}</p>}</div>
    {sp.c && <Detalhe id={sp.c} />}
  </>);
}
