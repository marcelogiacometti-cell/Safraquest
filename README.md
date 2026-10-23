# SafraQuest

Quiz semanal gamificado para vendedores de cooperativas e revendas. O aviso vai pelo WhatsApp (Meta Cloud API) e o quiz roda no navegador.

```
npm install
cp .env.example .env            # e ajuste
createdb safraquest             # Postgres 16
npm run db:migrate && npm run db:seed && npm run db:demo
npm run dev                     # http://localhost:3000
```
Painel: `mkt@corteva.test` / `senha-forte-123` (só no seed de desenvolvimento). Sem Meta configurada, os códigos e mensagens aparecem no terminal (`[whatsapp:console]`).

- `npm test` — testes (usa o banco `safraquest_test`)
- `npm run db:generate` — gera migração após mudar `src/db/schema.ts`
- Publicação: ver `DEPLOY.md` · Piloto: ver `PILOTO.md`

## Mapa
`src/lib` regras de negócio (auth, quiz, ranking, agendador, relatórios, vencedores) · `src/app` telas (`/app` vendedor, `/rep` representante, `/painel` Corteva e gestor) · `src/app/api` webhook da Meta e cron.
