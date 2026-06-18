# Deploy em produção

Stack: **PostgreSQL + API (NestJS) + Web (Next.js) + Nginx** via Docker Compose.
O Nginx faz reverse proxy: `/api` e `/uploads` → API, restante → Web (mesma origem).

> **Instalando do zero numa VPS Hostinger (Ubuntu puro), com subdomínio por
> oficina?** Veja o runbook passo a passo:
> [`INSTALL_VPS_HOSTINGER.md`](INSTALL_VPS_HOSTINGER.md) — Ubuntu + Nginx + certbot,
> com curinga de subdomínios.

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
- `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET` (≥32 chars, **distintos**, sem placeholders): `openssl rand -hex 32`
- `ENCRYPTION_KEY` (32 bytes em hex → 64 chars): `openssl rand -hex 32`
- `WEB_ORIGIN` (ex.: `https://suaoficina.com`) — também valida a origem do `/auth/refresh`
- `APP_URL` (ex.: `https://suaoficina.com`) — base pública confiável para URLs
  absolutas (ex.: links de upload). Vazio = URLs relativas.
- `NEXT_PUBLIC_API_URL` (padrão `/api` — mesma origem via Nginx)
- `AUTH_COOKIE_SECURE=true` com HTTPS. Para teste HTTP local, use `AUTH_COOKIE_SECURE=false`.
- **E-mail**: com `MAIL_DRIVER=smtp`, são obrigatórios `SMTP_HOST`, `SMTP_USER`,
  `SMTP_PASS` (o boot falha se faltarem). Sem SMTP, use `MAIL_DRIVER=log`.
- **`GARAGE_JWT_SECRET`** (≥32 chars, **obrigatório em produção**, distinto dos
  JWT) — segredo dedicado dos tokens da garagem. Gere com `scripts/generate-secrets.sh`.
- (Opcional) `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` + `NEXT_PUBLIC_VAPID_PUBLIC_KEY`
  (build do web) para push: `npx web-push generate-vapid-keys`.
- (Opcional) `RATE_LIMIT_TTL` / `RATE_LIMIT_MAX` / `AUTH_LOGIN_RATE_LIMIT`.

> Validação no boot: em produção o app recusa subir com segredos fracos/iguais,
> `ENCRYPTION_KEY` só-zeros, `AUTH_COOKIE_SECURE` desligado, SMTP incompleto ou
> `GARAGE_JWT_SECRET` ausente/fraco.

> **Domínios próprios.** Cadastre em Configurações › Domínios e **verifique** cada
> um — em produção só domínios verificados resolvem o site (`TenantDomain`). O
> Nginx sobrescreve `X-Forwarded-Host` com o host real (anti-spoof), então a
> resolução por domínio depende do host que chega no proxy.

> **Volumes** têm nomes fixos (`oficina_pgdata`, `oficina_uploads`) independentes
> do `COMPOSE_PROJECT_NAME`, para os scripts de backup/restore encontrá-los.

> A `NEXT_PUBLIC_API_URL` é **embutida no build** do front (build arg). O SSR usa
> `API_INTERNAL_URL=http://api:3333/api` (definido no compose, rede interna).

## 3. Build e subida

```bash
docker compose -f docker-compose.prod.yml up -d --build
```

Isso sobe `postgres`, `api`, `web` e `nginx` (porta 80). A API aplica as
migrations automaticamente no boot (`prisma migrate deploy`, via `docker/api-entrypoint.mjs`)
e persiste uploads no volume `oficina_uploads`.

> **Imagens enxutas (distroless + non-root).** Os runtimes da API e do Web são
> `gcr.io/distroless/nodejs22-debian12:nonroot` (uid 65532): só dependências de
> produção, **sem shell, sem `npm`/`npx`, sem `ts-node`**. A API roda via entrypoint
> JS; o Web usa o `server.js` do build *standalone* do Next. O healthcheck do compose
> usa `node` (exec), não shell. Comandos manuais que dependiam de `npx`/`pnpm`/shell
> mudaram — veja abaixo.

Para aplicar migrations manualmente (ex.: sem reiniciar a API), chame o Prisma
pelo `node` (não há `npx` na imagem):
```bash
docker compose -f docker-compose.prod.yml exec api \
  /nodejs/bin/node node_modules/prisma/build/index.js migrate deploy --schema prisma/schema.prisma
```
Na prática, basta `up -d` (ou `restart api`): o entrypoint aplica as migrations no boot.

## 4. Seed inicial (primeira vez)
Cria a oficina e o usuário administrador. **Atenção:** a imagem final da API é
prod-only (sem `ts-node`), então o seed **não roda dentro do container `api`**.
Rode-o num container `node` descartável anexado à rede do compose, a partir do
código-fonte (a rede padrão é `oficina_default`; o host do banco é `postgres`):

```bash
docker run --rm --network oficina_default -v "$PWD:/repo" -w /repo \
  -e DATABASE_URL="postgresql://$POSTGRES_USER:$POSTGRES_PASSWORD@postgres:5432/$POSTGRES_DB?schema=public" \
  node:22-slim sh -c "corepack enable && pnpm install --frozen-lockfile && pnpm prisma:generate && pnpm prisma:seed"
```

Login: `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD` (definidos no `.env`).
**Troque a senha do admin após o primeiro acesso.**

> O seed principal já cria os **templates de mensagem** (WhatsApp + E-mail) de todos
> os eventos, incluindo o de **aniversário** (`CUSTOMER_BIRTHDAY`, ativo e com
> *autoSend*). Para (re)semear **apenas os templates** numa instalação existente
> (ex.: adicionar templates novos sem mexer no resto), o script é idempotente:
> ```bash
> docker run --rm --network oficina_default -v "$PWD:/repo" -w /repo \
>   -e DATABASE_URL="postgresql://$POSTGRES_USER:$POSTGRES_PASSWORD@postgres:5432/$POSTGRES_DB?schema=public" \
>   node:22-slim sh -c "corepack enable && pnpm install --frozen-lockfile && pnpm prisma:generate && pnpm --filter @oficina/api prisma:seed:templates"
> ```
> Em dev: `pnpm --filter @oficina/api prisma:seed:templates` (semeia todos os tenants).

## 5. Verificação
```bash
curl http://localhost/api/health      # {"status":"ok","db":"up"}
curl -I http://localhost/             # 200 (frontend)
```

## 6. HTTPS (recomendado)

Já existe um override pronto: `docker-compose.tls.yml` (HTTP→HTTPS, HTTPS na 443 com
HSTS, `AUTH_COOKIE_SECURE=true` automático). Precisa apenas dos certificados.

1. **Gerar os certificados** (Let's Encrypt via certbot, com a porta 80 livre):
   ```bash
   sudo certbot certonly --standalone -d suaoficina.com
   # copie para a pasta lida pelo Nginx:
   mkdir -p docker/nginx/certs
   sudo cp /etc/letsencrypt/live/suaoficina.com/fullchain.pem docker/nginx/certs/
   sudo cp /etc/letsencrypt/live/suaoficina.com/privkey.pem  docker/nginx/certs/
   ```
2. **Subir com TLS** (combina os dois arquivos de compose):
   ```bash
   docker compose -f docker-compose.prod.yml -f docker-compose.tls.yml up -d
   ```
3. **Renovação**: renove com `certbot renew`, recopie os `.pem` para
   `docker/nginx/certs/` e rode `docker compose ... restart nginx`.

> Alternativa: um terminador TLS automático na frente (Caddy/Traefik) — nesse caso
> mantenha o `docker-compose.prod.yml` puro e exponha o app só para o proxy.
>
> Com HTTPS, `AUTH_COOKIE_SECURE=true` (o override já define) — os cookies de
> autenticação passam a exigir conexão segura.

## 7. Backup e restore
Backup (banco + uploads + manifesto), cron sugerido diário:
```bash
sh scripts/backup.sh   # gera backups/oficina_db_*.sql.gz, oficina_uploads_*.tar.gz e oficina_manifest_*.json
```
- O dump usa `--clean --if-exists`, então **restaura sobre um banco existente**.
- Retenção padrão de 30 dias (`BACKUP_RETENTION`); uploads inclusos quando o volume existe.
- Cron automático: `sh scripts/install-backup-cron.sh`.

Restore (destrutivo — exige confirmação explícita):
```bash
# Só o banco:
CONFIRM_RESTORE=SIM sh scripts/restore.sh backups/oficina_db_AAAAMMDD_HHMMSS.sql.gz

# Banco + uploads (limpa o volume, inclusive arquivos ocultos, antes de extrair):
CONFIRM_RESTORE=SIM RESTORE_UPLOADS=true sh scripts/restore.sh \
  backups/oficina_db_AAAAMMDD_HHMMSS.sql.gz \
  backups/oficina_uploads_AAAAMMDD_HHMMSS.tar.gz
```
Depois do restore, reinicie a stack: `docker compose -f docker-compose.prod.yml restart api web nginx`.

Detalhes da rotina diária/cron em [`docs/OPERACAO_PRODUCAO.md`](OPERACAO_PRODUCAO.md).

## 8. Uploads
Em produção os uploads vão para o volume Docker `oficina_uploads`, montado em `/app/apps/api/uploads` no container da API e exposto pelo Nginx em `/uploads`. Para escala/HA, implemente o adapter S3/R2 antes de rodar múltiplas réplicas da API.

> **Volume + non-root.** A API roda como uid **65532**. Em um volume novo o dono é
> herdado da imagem (já correto). Mas se você está **migrando de um deploy antigo**
> (volume criado como root), ajuste o dono uma vez para o usuário não-root conseguir
> gravar:
> ```bash
> docker run --rm -v oficina_uploads:/u busybox chown -R 65532:65532 /u
> ```

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
