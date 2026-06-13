# Deploy em produção

Stack: **PostgreSQL + API (NestJS) + Web (Next.js) + Nginx** via Docker Compose.
O Nginx faz reverse proxy: `/api` e `/uploads` → API, restante → Web (mesma origem).

## 1. Pré-requisitos
- Docker + Docker Compose no servidor.
- Domínio apontando para o servidor (para TLS) — opcional para um primeiro teste.

## 2. Variáveis de ambiente
Copie `.env.example` para `.env` e ajuste **com segredos fortes**:

```bash
cp .env.example .env
```

Obrigatórias em produção:
- `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB`
- `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET` (strings longas e aleatórias)
- `ENCRYPTION_KEY` (32 bytes em hex → 64 chars): `openssl rand -hex 32`
- `WEB_ORIGIN` (ex.: `https://suaoficina.com`)
- `NEXT_PUBLIC_API_URL` (padrão `/api` — mesma origem via Nginx)
- `AUTH_COOKIE_SECURE=true` com HTTPS. Para teste HTTP local, use `AUTH_COOKIE_SECURE=false`.
- (Opcional) `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` para push: `npx web-push generate-vapid-keys`

> A `NEXT_PUBLIC_API_URL` é **embutida no build** do front (build arg). O SSR usa
> `API_INTERNAL_URL=http://api:3333/api` (definido no compose, rede interna).

## 3. Build e subida

```bash
docker compose -f docker-compose.prod.yml up -d --build
```

Isso sobe `postgres`, `api`, `web` e `nginx` (porta 80). A API aplica as
migrations automaticamente no boot (`prisma migrate deploy`) e persiste uploads no volume `oficina_uploads`.

Para aplicar migrations manualmente (ex.: deploy sem rebuild da API):
```bash
docker compose -f docker-compose.prod.yml exec api npx prisma migrate deploy
```

## 4. Seed inicial (primeira vez)
Cria a oficina e o usuário administrador:
```bash
docker compose -f docker-compose.prod.yml exec api npx prisma db seed
```
Login: `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD` (definidos no `.env`).
**Troque a senha do admin após o primeiro acesso.**

## 5. Verificação
```bash
curl http://localhost/api/health      # {"status":"ok","db":"up"}
curl -I http://localhost/             # 200 (frontend)
```

## 6. HTTPS (recomendado)
Coloque um terminador TLS na frente (Caddy/Traefik) ou configure certificados no
Nginx (`docker/nginx/default.conf`) montando os certs e adicionando um `server`
na porta 443. Com HTTPS, defina `AUTH_COOKIE_SECURE=true`.

## 7. Backup
Backup do banco (cron sugerido, diário):
```bash
./scripts/backup.sh    # pg_dump compactado em ./backups (retém os 14 últimos)
```
Restore:
```bash
gunzip -c backups/oficina_AAAAMMDD_HHMMSS.sql.gz | \
  docker compose -f docker-compose.prod.yml exec -T postgres \
  psql -U "$POSTGRES_USER" -d "$POSTGRES_DB"
```

## 8. Uploads
Em produção os uploads vão para o volume Docker `oficina_uploads`, montado em `/app/apps/api/uploads` no container da API e exposto pelo Nginx em `/uploads`. Para escala/HA, implemente o adapter S3/R2 antes de rodar múltiplas réplicas da API.

## 9. Logs e operação
```bash
docker compose -f docker-compose.prod.yml logs -f api
docker compose -f docker-compose.prod.yml ps
docker compose -f docker-compose.prod.yml down        # parar (mantém volume)
```

## Testes
- Unitários/integração (API): `pnpm test`
- E2E API (Supertest, requer DB + seed): `pnpm --filter @oficina/api test:e2e`
- E2E Web (Playwright, requer API+Web rodando):
  ```bash
  pnpm --filter @oficina/web exec playwright install --with-deps
  pnpm --filter @oficina/web test:e2e
  ```


## Pós-deploy obrigatório

Depois de atualizar containers em produção, rode:

```bash
sh scripts/monitor-prod.sh
```

Antes de qualquer migration em produção, rode:

```bash
sh scripts/backup.sh
```

Para instalar backup automático diário no servidor:

```bash
sh scripts/install-backup-cron.sh
```

O guia completo está em [`docs/OPERACAO_PRODUCAO.md`](OPERACAO_PRODUCAO.md).
