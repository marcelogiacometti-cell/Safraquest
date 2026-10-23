import { requireMember } from '@/lib/web';
import { sellerRankings, topAndMe, type RankedPerson } from '@/lib/stats';
export const dynamic = 'force-dynamic';
function Board({ title, list, meId }: { title: string; list: RankedPerson[]; meId: string }) {
  const v = topAndMe(list, meId, 5);
  const rows = [...v.top, ...(v.me && !v.top.some((x) => x.id === meId) ? v.near : [])];
  const seen = new Set<string>();
  return (<div className="card"><h2>{title}</h2><table><tbody>
    {rows.filter((r) => !seen.has(r.id) && seen.add(r.id)).map((r) => (
      <tr key={r.id} className={r.id === meId ? 'me' : ''}><td>{r.pos}º</td><td>{r.id === meId ? 'Você' : r.name}</td><td style={{ textAlign: 'right' }}>{r.points} pts</td></tr>))}
    {!rows.length && <tr><td className="mu">Ainda sem pontuação.</td></tr>}
  </tbody></table></div>);
}
export default async function Rankings() {
  const u = await requireMember();
  const rk = await sellerRankings(u.id, { kind: 'season' });
  return (<>
    <h1>Rankings</h1>
    <Board title="Geral" list={rk.general} meId={u.id} />
    <Board title="Na minha loja" list={rk.inDistributor} meId={u.id} />
    <Board title="Na minha unidade" list={rk.inUnit} meId={u.id} />
    <div className="card"><h2>Lojas (média por vendedor)</h2><table><tbody>
      {rk.distributors.slice(0, 8).map((d) => <tr key={d.id} className={d.id === rk.myDistributorStanding?.id ? 'me' : ''}><td>{d.pos || '—'}º</td><td>{d.name}</td><td style={{ textAlign: 'right' }}>{d.avgPoints} pts</td></tr>)}
    </tbody></table></div>
  </>);
}
