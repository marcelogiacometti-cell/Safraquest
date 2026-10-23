import { Form } from '../../forms';
import { confirmarCodigo, pedirCodigo } from '../../actions';
import { formatPhone } from '@/lib/phone';
export default async function Codigo({ searchParams }: { searchParams: Promise<{ tel?: string }> }) {
  const { tel = '' } = await searchParams;
  return (<main className="wrap">
    <h1>Digite o código</h1>
    <p className="mu">Enviamos 6 dígitos para {formatPhone(tel)} no WhatsApp. Vale por 10 minutos.</p>
    <div className="card"><Form action={confirmarCodigo} submit="Entrar">
      <input type="hidden" name="tel" value={tel} />
      <input name="codigo" inputMode="numeric" autoComplete="one-time-code" maxLength={6} placeholder="000000" required style={{ fontSize: 28, letterSpacing: 8, textAlign: 'center' }} />
    </Form></div>
    <div className="card"><Form action={pedirCodigo} submit="Reenviar código"><input type="hidden" name="tel" value={tel} /></Form></div>
  </main>);
}
