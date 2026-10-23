import { eq } from 'drizzle-orm';
import { db, schema } from '@/db';
import { checkInvite } from '@/lib/auth';
import { Form } from '../../forms';
import { cadastrar } from '../../actions';
export default async function Cadastro({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const c = await checkInvite(token);
  if (!c.ok) return (<main className="wrap"><h1>Link indisponível</h1>
    <div className="err">{c.reason === 'EXPIRED' ? 'Este link venceu.' : c.reason === 'FULL' ? 'Este link já atingiu o limite de cadastros.' : 'Link não encontrado.'}</div>
    <p className="mu">Peça um novo link ao seu gestor.</p></main>);
  const inv = c.invite;
  const [d] = inv.distributorId ? await db.select().from(schema.distributors).where(eq(schema.distributors.id, inv.distributorId)) : [];
  const units = inv.distributorId && !inv.unitId ? await db.select().from(schema.units).where(eq(schema.units.distributorId, inv.distributorId)) : [];
  return (<main className="wrap">
    <h1>Cadastro no SafraQuest</h1>
    {d && <p className="mu">{d.name}</p>}
    <div className="card"><Form action={cadastrar} submit="Enviar cadastro">
      <input type="hidden" name="token" value={token} />
      <label>Nome e sobrenome<input name="nome" autoComplete="name" required /></label>
      <label>WhatsApp com DDD<input name="tel" inputMode="tel" autoComplete="tel" required /></label>
      {units.length > 0 && <label>Sua unidade<select name="unidade" required defaultValue=""><option value="" disabled>Escolha…</option>{units.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</select></label>}
      <label style={{ display: 'flex', gap: 8, fontWeight: 400 }}><input type="checkbox" name="aceite" style={{ width: 'auto' }} />
        <span>Aceito receber mensagens do SafraQuest no WhatsApp sobre as missões semanais. Posso sair a qualquer momento respondendo SAIR.</span></label>
    </Form></div>
  </main>);
}
