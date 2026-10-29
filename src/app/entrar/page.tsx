import { Form } from '../forms';
import { pedirCodigo } from '../actions';
export default function Entrar() {
  return (<main className="wrap">
    <h1>🌱 SafraQuest</h1>
    <p className="mu">Digite o e-mail cadastrado. Enviaremos um código de 6 dígitos.</p>
    <div className="card"><Form action={pedirCodigo} submit="Receber código">
      <label htmlFor="email">E-mail</label>
      <input id="email" name="email" type="email" autoComplete="email" placeholder="voce@empresa.com.br" required />
    </Form></div>
    <p className="mu">Ainda não tem cadastro? Peça o link ao gestor da sua loja. <a href="/painel/login">Acesso do painel</a></p>
  </main>);
}
