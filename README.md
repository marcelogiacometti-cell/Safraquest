# SafraQuest

Quiz semanal gamificado para vendedores de cooperativas e revendas. O aviso e o código de acesso vão por e-mail (SMTP) e o quiz roda no navegador.

```
npm install
cp .env.example .env            # e ajuste
createdb safraquest             # Postgres 16
npm run db:migrate && npm run db:seed && npm run db:demo
npm run dev                     # http://localhost:3000
```
Painel: `mkt@corteva.test` / `senha-forte-123` (só no seed de desenvolvimento). Sem SMTP configurado, os e-mails aparecem no terminal (`[whatsapp:console]`).

- `npm test` — testes (usa o banco `safraquest_test`)
- `npm run db:generate` — gera migração após mudar `src/db/schema.ts`
- Publicação: ver `DEPLOY.md` · Piloto: ver `PILOTO.md`

## Mapa
`src/lib` regras de negócio (auth, quiz, ranking, agendador, relatórios, vencedores) · `src/app` telas (`/app` vendedor, `/rep` representante, `/painel` Corteva e gestor) · `src/app/api` webhook da Meta e cron.
