import { requirePanel } from '@/lib/web';
import { env } from '@/lib/env';
import { Form } from '@/app/forms';
import { enviarTeste } from '../actions';
export const dynamic = 'force-dynamic';
export default async function Integracao() {
  const { user } = await requirePanel(['MARKETING']);
  const on = !!env.smtpHost;
  return (<><h1>Envio de e-mails</h1>
    <div className="card"><h2>Situação</h2>
      {on ? <p className="ok">E-mail ligado: <b>{env.smtpHost}</b>, remetente <b>{process.env.MAIL_FROM || process.env.SMTP_USER}</b>.</p>
        : <p className="err">E-mail ainda não configurado. Os e-mails aparecem só nos registros do servidor (modo teste) e ninguém recebe nada.</p>}
      <Form action={enviarTeste} submit={`Enviar e-mail de teste para ${user.email}`}><span /></Form></div>
    {!on && <div className="card"><h2>Como ligar (grátis)</h2>
      <p><b>Opção Brevo</b> (300 e-mails/dia): crie conta em brevo.com, valide seu e-mail remetente e, em SMTP e API, gere uma chave SMTP.</p>
      <p><b>Opção Gmail</b> (cerca de 500/dia): ative a verificação em 2 etapas e crie uma &quot;senha de app&quot; na conta Google.</p>
      <p className="mu">Depois defina no servidor: SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS e MAIL_FROM. Detalhes no DEPLOY.md.</p></div>}
  </>);
}
