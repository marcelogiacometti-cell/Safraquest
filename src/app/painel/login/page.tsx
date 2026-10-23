import { Form } from '@/app/forms';
import { entrarPainel } from '@/app/actions';
export default function Login() {
  return (<main className="wrap"><h1>Painel SafraQuest</h1>
    <div className="card"><Form action={entrarPainel} submit="Entrar">
      <label>E-mail<input name="email" type="email" autoComplete="username" required /></label>
      <label>Senha<input name="senha" type="password" autoComplete="current-password" required /></label>
    </Form></div></main>);
}
