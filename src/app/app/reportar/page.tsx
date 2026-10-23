import { Form } from '@/app/forms';
import { reportar } from '@/app/actions';
export default function Reportar() {
  return (<><h1>Reportar ou sugerir</h1>
    <div className="card"><Form action={reportar} submit="Enviar">
      <label>O que aconteceu?<select name="tipo" defaultValue="ERROR">
        <option value="ERROR">Pergunta com erro</option><option value="CONFUSING">Pergunta confusa</option><option value="OUTDATED">Informação desatualizada</option>
        <option value="SUGGESTION">Sugerir uma pergunta nova</option><option value="OTHER">Outro</option></select></label>
      <label>Tema (opcional)<input name="tema" /></label>
      <label>Conte com suas palavras<textarea name="texto" rows={4} required /></label>
    </Form></div></>);
}
