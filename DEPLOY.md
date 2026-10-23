# Publicar o SafraQuest

Precisa de: um Postgres, um lugar para rodar o Next.js e um agendador que chame `/api/cron/dispatch` a cada 10 minutos.

## Opção recomendada: Railway (app + Postgres + cron no mesmo lugar)
1. Crie um projeto, adicione **PostgreSQL** e faça deploy deste repositório (usa o `Dockerfile`).
2. Variáveis do app: `DATABASE_URL` (referência ao Postgres), `SESSION_SECRET` (`openssl rand -hex 32`), `APP_URL` (domínio público com https), `CRON_SECRET` (outro valor aleatório), `WHATSAPP_PROVIDER=console` por enquanto.
3. Defina também `ADMIN_EMAIL` e `ADMIN_PASSWORD`. Ao iniciar, o app aplica as migrações, cria os 8 modelos de mensagem e o usuário Marketing sozinho (não precisa de terminal).
4. Em Cron Jobs: a cada 10 min, `curl -fsS -H "Authorization: Bearer $CRON_SECRET" $APP_URL/api/cron/dispatch`.

## Alternativa: Vercel + Neon
Banco no Neon; app na Vercel; `vercel.json` já traz o cron. **Atenção:** o plano Hobby só aceita cron diário. Use o plano Pro ou chame o endereço acima de um agendador externo (ex.: cron-job.org) a cada 10 min. Defina `ADMIN_EMAIL`/`ADMIN_PASSWORD`; o app prepara o banco ao iniciar.

## Ligar o WhatsApp (Meta)
1. No Meta Business, crie o app WhatsApp e anote **WABA ID**, **Phone Number ID**, **token permanente** (usuário do sistema) e **App Secret**.
2. No painel: **Integração** → preencha e salve (token e segredo ficam criptografados).
3. Na Meta: Webhooks → URL `APP_URL/api/webhooks/whatsapp`, token de verificação = o que aparece em Integração, assine `messages`.
4. Cadastre os 8 modelos no Gerenciador do WhatsApp **com o mesmo nome** (textos em Integração → Ver textos). O código de acesso é categoria *Authentication*; os demais *Utility*. Aguarde aprovação.
5. Troque `WHATSAPP_PROVIDER=meta`, reinicie e clique em **Sincronizar status** em Integração.

## Segurança já embutida
Cookies httpOnly/sameSite; sessão de 30 dias (vendedor) e 12 h (painel); código de 6 dígitos com 10 min, 3 tentativas e 3 pedidos/15 min; assinatura HMAC no webhook; segredos AES-256-GCM; cada tela confere o papel no servidor.
