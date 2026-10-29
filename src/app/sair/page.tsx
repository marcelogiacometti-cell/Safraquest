import { Form } from '../forms';
import { confirmarSaidaEmail } from '../actions';
export default async function Sair({ searchParams }: { searchParams: Promise<{ e?: string; s?: string }> }) {
  const { e = '', s = '' } = await searchParams;
  return (<main className="wrap"><h1>Parar de receber e-mails?</h1>
    <p className="mu">{e}</p>
    <div className="card"><Form action={confirmarSaidaEmail} submit="Sim, parar de receber">
      <input type="hidden" name="e" value={e} /><input type="hidden" name="s" value={s} />
    </Form></div></main>);
}
