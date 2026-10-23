import { db, schema } from '@/db';
import { requirePanel } from '@/lib/web';
import { env } from '@/lib/env';
import { Form } from '@/app/forms';
import { salvarIntegracao, sincronizarModelos } from '../actions';
export const dynamic = 'force-dynamic';
export default async function Integracao() {
  await requirePanel(['MARKETING']);
  const [c] = await db.select().from(schema.waConfig); const tpls = await db.select().from(schema.waTemplates);
  return (<><h1>Integração com o WhatsApp (Meta)</h1>
    <p className="mu">Modo atual: <b>{env.waProvider}</b> {env.waProvider === 'console' && '(não envia de verdade — defina WHATSAPP_PROVIDER=meta)'}</p>
    <div className="card"><h2>Webhook</h2><p>URL: <code>{env.appUrl}/api/webhooks/whatsapp</code></p><p>Token de verificação: <code>{c?.verifyToken ?? '(salve a configuração para gerar)'}</code></p></div>
    <div className="card"><h2>Credenciais</h2><Form action={salvarIntegracao} submit="Salvar">
      <label>ID da conta WhatsApp Business (WABA)<input name="waba" defaultValue={c?.wabaId ?? ''} /></label>
      <label>ID do número de telefone<input name="phone" defaultValue={c?.phoneNumberId ?? ''} /></label>
      <label>Nome de exibição<input name="nome" defaultValue={c?.displayName ?? ''} /></label>
      <label>Token de acesso {c?.tokenEnc && '(já salvo; preencha só para trocar)'}<input name="token" type="password" autoComplete="off" /></label>
      <label>App Secret {c?.appSecretEnc && '(já salvo; preencha só para trocar)'}<input name="segredo" type="password" autoComplete="off" /></label>
      <div className="grid"><label>Enviar a partir de<input name="de" defaultValue={c?.sendFrom ?? '08:00'} /></label><label>até<input name="ate" defaultValue={c?.sendUntil ?? '19:00'} /></label>
        <label>Máx. mensagens/semana<input name="max" type="number" defaultValue={c?.maxPerWeek ?? 4} /></label></div></Form></div>
    <div className="card"><div className="row"><h2>Modelos de mensagem</h2><form action={sincronizarModelos}><button className="btn sm sec">Sincronizar status</button></form></div>
      <table><tbody>{tpls.map((t) => <tr key={t.id}><td><code>{t.name}</code><br /><span className="mu">{t.usedIn}</span></td><td><span className={'pill' + (t.status === 'APPROVED' ? '' : t.status === 'REJECTED' ? ' rd' : ' am')}>{t.status}</span></td></tr>)}</tbody></table>
      <p className="mu">Cadastre cada modelo no Gerenciador do WhatsApp com o mesmo nome e o texto abaixo; só os aprovados são usados.</p>
      <details><summary>Ver textos</summary>{tpls.map((t) => <p key={t.id}><code>{t.name}</code>: {t.body}</p>)}</details></div></>);
}
