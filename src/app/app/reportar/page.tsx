import { Form } from '@/app/forms';
import { reportar } from '@/app/actions';
export default function Reportar() {
  return (<><h1>Sugestões e problemas</h1>
    <p className="mu">Conte o que podemos melhorar: perguntas novas, erros, dúvidas ou ideias. O time de Marketing lê tudo.</p>
    <div className="card"><Form action={reportar} submit="Enviar">
      <label>Tipo<select name="tipo" defaultValue="SUGGESTION"><option value="SUGGESTION">Sugestão</option><option value="OTHER">Problema ou dúvida</option></select></label>
      <label>Tema (opcional)<input name="tema" placeholder="Ex.: produto, quiz, ranking" /></label>
      <label>Sua mensagem<textarea name="texto" rows={5} required maxLength={1500} /></label>
    </Form></div></>);
}
