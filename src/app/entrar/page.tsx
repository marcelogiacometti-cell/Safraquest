import { Form } from '../forms';
import { pedirCodigo } from '../actions';
export default function Entrar() {
  return (<main className="wrap">
    <h1>🌱 SafraQuest</h1>
    <p className="mu">Digite o WhatsApp cadastrado. Enviaremos um código de 6 dígitos.</p>
    <div className="card"><Form action={pedirCodigo} submit="Receber código">
      <label htmlFor="tel">WhatsApp com DDD</label>
      <input id="tel" name="tel" inputMode="tel" autoComplete="tel" placeholder="(54) 99999-0000" required />
    </Form></div>
    <p className="mu">Ainda não tem cadastro? Peça o link ao gestor da sua loja. <a href="/painel/login">Acesso do painel</a></p>
  </main>);
}
