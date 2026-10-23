import Link from 'next/link';
import { desc } from 'drizzle-orm';
import { db, schema } from '@/db';
import { requirePanel } from '@/lib/web';
import { Form } from '@/app/forms';
import { criarCampanha } from '../actions';
export const dynamic = 'force-dynamic';
export default async function Campanhas() {
  const { user } = await requirePanel();
  const list = await db.select().from(schema.campaigns).orderBy(desc(schema.campaigns.createdAt));
  return (<><h1>Campanhas</h1>
    <div className="card"><table><tbody>{list.map((c) => <tr key={c.id}><td><Link href={`/painel/campanhas/${c.id}`}>{c.name}</Link><br /><span className="mu">{c.productName}</span></td><td><span className="pill">{c.status}</span></td></tr>)}
      {!list.length && <tr><td className="mu">Nenhuma campanha ainda.</td></tr>}</tbody></table></div>
    {user.role === 'MARKETING' && <div className="card"><h2>Nova campanha</h2><Form action={criarCampanha} submit="Criar e continuar">
      <label>Nome<input name="nome" required /></label><label>Produto<input name="produto" required /></label>
      <label>Objetivo<input name="objetivo" /></label>
      <div className="grid"><label>Início (segunda)<input name="inicio" type="date" required /></label><label>Fim<input name="fim" type="date" required /></label></div>
      <label style={{ fontWeight: 400 }}><input type="checkbox" name="bonus" style={{ width: 'auto' }} /> Bônus de velocidade</label></Form></div>}
  </>);
}
