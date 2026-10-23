import Link from 'next/link';
import { eq } from 'drizzle-orm';
import { db, schema } from '@/db';
import { currentUser } from '@/lib/web';
import { redirect } from 'next/navigation';
import { loadActor } from '@/lib/access';
import { campaignEffectiveness } from '@/lib/effectiveness';
import { sair } from '../actions';
export const dynamic = 'force-dynamic';
export default async function Rep() {
  const u = await currentUser();
  if (!u || u.role !== 'REPRESENTANTE') redirect('/entrar');
  const actor = (await loadActor(u.id))!;
  const camps = await db.select().from(schema.campaigns).where(eq(schema.campaigns.status, 'ACTIVE'));
  const eff = camps[0] ? await campaignEffectiveness(actor, { campaignId: camps[0].id }) : null;
  return (<main className="wrap"><h1>Meus canais</h1>
    {!eff ? <div className="card">Nenhuma campanha ativa agora.</div> : <>
      <p className="mu">{eff.campaign.name}</p>
      <div className="grid"><div className="card"><div className="kpi">{eff.kpis.participationNow ?? '—'}%</div><span className="mu">participação na última missão</span></div>
        <div className="card"><div className="kpi">{eff.kpis.hitRate ?? '—'}%</div><span className="mu">acerto médio</span></div></div>
      <div className="card"><table><thead><tr><th>Canal</th><th>Vendedores</th><th>Participação</th></tr></thead><tbody>
        {eff.channels.map((c) => <tr key={c.id}><td>{c.name}</td><td>{c.sellers}</td><td><span className={'pill' + (c.participation < 40 ? ' rd' : '')}>{c.participation}%</span></td></tr>)}
      </tbody></table></div></>}
    <Link className="btn block" href="/app">Fazer a missão da semana</Link>
    <form action={sair}><button className="btn sec block" style={{ marginTop: 8 }}>Sair</button></form>
  </main>);
}
