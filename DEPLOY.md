# Publicar o SafraQuest

Precisa de: um Postgres, um lugar para rodar o Next.js e um agendador que chame `/api/cron/dispatch` a cada 10 minutos.

## Opção recomendada: Railway (app + Postgres + cron no mesmo lugar)
1. Crie um projeto, adicione **PostgreSQL** e faça deploy deste repositório (usa o `Dockerfile`).
2. Variáveis do app: `DATABASE_URL` (referência ao Postgres), `SESSION_SECRET` (`openssl rand -hex 32`), `APP_URL` (domínio público com https), `CRON_SECRET` (outro valor aleatório), `WHATSAPP_PROVIDER=console` por enquanto.
3. Defina também `ADMIN_EMAIL` e `ADMIN_PASSWORD`. Ao iniciar, o app aplica as migrações, cria os 8 modelos de mensagem e o usuário Marketing sozinho (não precisa de terminal).
4. Em Cron Jobs: a cada 10 min, `curl -fsS -H "Authorization: Bearer $CRON_SECRET" $APP_URL/api/cron/dispatch`.

## Alternativa: Vercel + Neon
Banco no Neon; app na Vercel; `vercel.json` já traz o cron. **Atenção:** o plano Hobby só aceita cron diário. Use o plano Pro ou chame o endereço acima de um agendador externo (ex.: cron-job.org) a cada 10 min. Defina `ADMIN_EMAIL`/`ADMIN_PASSWORD`; o app prepara o banco ao iniciar.

## Ligar o e-mail (grátis)
O acesso (código de 6 dígitos) e os avisos semanais vão por e-mail via SMTP. Escolha um provedor:
- **Brevo** (300 e-mails/dia): crie conta, valide o e-mail remetente em *Remetentes*, gere uma chave em *SMTP e API*. `SMTP_HOST=smtp-relay.brevo.com`, `SMTP_PORT=587`, `SMTP_USER` = login SMTP mostrado, `SMTP_PASS` = a chave, `MAIL_FROM="SafraQuest <e-mail validado>"`.
- **Gmail** (cerca de 500/dia): ative a verificação em 2 etapas e crie uma *senha de app*. `SMTP_HOST=smtp.gmail.com`, `SMTP_PORT=587`, `SMTP_USER` = seu Gmail, `SMTP_PASS` = a senha de app.

Defina as variáveis no servidor e reinicie. No painel, **E-mail → Enviar e-mail de teste** confirma que chegou. Cada e-mail traz o link *Parar de receber*.

> O envio por WhatsApp (Meta) continua no código, desligado. Para usá-lo no futuro, defina `WHATSAPP_PROVIDER=meta` e siga o roteiro da Meta; os modelos passam a depender de aprovação.

## Segurança já embutida
Cookies httpOnly/sameSite; sessão de 30 dias (vendedor) e 12 h (painel); código de 6 dígitos com 10 min, 3 tentativas e 3 pedidos/15 min; segredos AES-256-GCM; cada tela confere o papel no servidor.
