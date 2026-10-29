import { Form } from '../../forms';
import { confirmarCodigo, pedirCodigo } from '../../actions';
export default async function Codigo({ searchParams }: { searchParams: Promise<{ email?: string }> }) {
  const { email = '' } = await searchParams;
  return (<main className="wrap">
    <h1>Digite o código</h1>
    <p className="mu">Enviamos 6 dígitos para {email}. Vale por 10 minutos. Veja também a caixa de spam.</p>
    <div className="card"><Form action={confirmarCodigo} submit="Entrar">
      <input type="hidden" name="email" value={email} />
      <input name="codigo" inputMode="numeric" autoComplete="one-time-code" maxLength={6} placeholder="000000" required style={{ fontSize: 28, letterSpacing: 8, textAlign: 'center' }} />
    </Form></div>
    <div className="card"><Form action={pedirCodigo} submit="Reenviar código"><input type="hidden" name="email" value={email} /></Form></div>
  </main>);
}
