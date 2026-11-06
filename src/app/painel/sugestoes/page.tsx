import { requirePanel } from '@/lib/web';
import { Form } from '@/app/forms';
import { enviarSugestao } from '../actions';
export const dynamic = 'force-dynamic';
export default async function Sugestoes() {
  await requirePanel();
  return (<><h1>Enviar sugestão</h1>
    <p className="mu">Conte o que podemos melhorar na plataforma ou nas campanhas. Só o time de Marketing vê as mensagens enviadas.</p>
    <div className="card"><Form action={enviarSugestao} submit="Enviar">
      <label>Tipo<select name="tipo" defaultValue="SUGGESTION"><option value="SUGGESTION">Sugestão</option><option value="OTHER">Problema ou dúvida</option></select></label>
      <label>Tema (opcional)<input name="tema" /></label>
      <label>Sua mensagem<textarea name="texto" rows={5} required maxLength={1500} /></label></Form></div></>);
}
