# Operação de Produção — Oficina

Este guia cobre a rotina mínima para tratar o sistema como produto interno estável: validar build, subir nova versão, verificar saúde, fazer backup e restaurar quando necessário.

## 1. Validação antes de publicar

No Windows PowerShell, antes de enviar para o servidor:

```powershell
Remove-Item Env:DATABASE_URL -ErrorAction SilentlyContinue
Remove-Item -Recurse -Force apps\web\.next -ErrorAction SilentlyContinue

pnpm install
pnpm ci:check
```

Com E2E:

```powershell
docker compose -f docker-compose.test.yml up -d

$env:DATABASE_URL="postgresql://oficina:oficina_test_pwd@localhost:5434/oficina_test?schema=public"

pnpm ci:e2e

Remove-Item Env:DATABASE_URL
echo $env:DATABASE_URL
```

Também pode usar:

```powershell
.\scripts\validate-build.ps1 -E2E
```

## 2. Atualização no servidor via Git

```bash
cd /caminho/do/projeto

git pull origin main

docker compose -f docker-compose.prod.yml build
docker compose -f docker-compose.prod.yml up -d   # entrypoint aplica as migrations no boot

docker compose -f docker-compose.prod.yml ps
sh scripts/monitor-prod.sh
```

> A imagem da API é distroless (sem `pnpm`/`npx`/shell): **as migrations são
> aplicadas automaticamente no boot** pelo `docker/api-entrypoint.mjs`. Para forçar
> manualmente, sem reiniciar:
> ```bash
> docker compose -f docker-compose.prod.yml exec api \
>   /nodejs/bin/node node_modules/prisma/build/index.js migrate deploy --schema prisma/schema.prisma
> ```

Se sua branch for `master`, troque `main` por `master`.

## 3. Healthchecks

A API expõe:

```text
GET /api/health/live
GET /api/health/ready
GET /api/health/version
```

O Nginx expõe:

```text
GET /healthz
```

Diferença:

- `/api/health/live`: indica que o processo da API está vivo.
- `/api/health/ready`: indica que a API consegue consultar o banco.
- `/healthz`: indica que o Nginx está respondendo.

No servidor:

```bash
curl -fsS http://127.0.0.1/healthz
curl -fsS http://127.0.0.1/api/health/ready
curl -fsS http://127.0.0.1/api/health/version
```

## 4. Monitoramento básico manual

```bash
sh scripts/monitor-prod.sh
```

O script verifica:

- containers do compose;
- health da API;
- resposta do frontend via Nginx;
- espaço livre em disco.

Variáveis opcionais:

```bash
API_HEALTH_URL=http://127.0.0.1/api/health/ready \
WEB_URL=http://127.0.0.1/ \
MIN_FREE_DISK_PERCENT=10 \
sh scripts/monitor-prod.sh
```

## 5. Backup manual

O backup salva:

- banco PostgreSQL em `backups/oficina_db_*.sql.gz` (dump com `--clean --if-exists`,
  restaurável sobre banco existente);
- uploads em `backups/oficina_uploads_*.tar.gz`, quando o volume existir;
- manifesto em `backups/oficina_manifest_*.json`.

> O restore de uploads limpa o volume por completo (inclusive arquivos ocultos)
> antes de extrair, evitando sobras de uma versão anterior.

```bash
sh scripts/backup.sh
```

Variáveis úteis:

```bash
BACKUP_DIR=backups
BACKUP_RETENTION=14
BACKUP_INCLUDE_UPLOADS=true
POSTGRES_SERVICE=postgres
UPLOADS_VOLUME=oficina_uploads
COMPOSE_PROJECT_NAME=oficina
```

Exemplo:

```bash
BACKUP_RETENTION=30 sh scripts/backup.sh
```

## 6. Backup automático diário

Instala cron diário, por padrão às 02:17:

```bash
sh scripts/install-backup-cron.sh
```

Para escolher outro horário:

```bash
CRON_TIME="30 3 * * *" sh scripts/install-backup-cron.sh
```

Ver crontab:

```bash
crontab -l
```

Ver log:

```bash
tail -f backups/backup.log
```

## 7. Restore

O restore é destrutivo. Exige confirmação explícita:

```bash
CONFIRM_RESTORE=SIM sh scripts/restore.sh backups/oficina_db_AAAAMMDD_HHMMSS.sql.gz
```

Para restaurar uploads junto:

```bash
CONFIRM_RESTORE=SIM RESTORE_UPLOADS=true \
sh scripts/restore.sh \
  backups/oficina_db_AAAAMMDD_HHMMSS.sql.gz \
  backups/oficina_uploads_AAAAMMDD_HHMMSS.tar.gz
```

Depois do restore:

```bash
docker compose -f docker-compose.prod.yml restart api web nginx
sh scripts/monitor-prod.sh
```

## 8. Logs úteis

```bash
docker compose -f docker-compose.prod.yml logs -f api
docker compose -f docker-compose.prod.yml logs -f web
docker compose -f docker-compose.prod.yml logs -f nginx
```

Últimas linhas:

```bash
docker compose -f docker-compose.prod.yml logs --tail=100 api
```

## 9. Checklist diário rápido

```bash
cd /caminho/do/projeto
sh scripts/monitor-prod.sh
ls -lh backups | tail
```

## 10. Checklist antes de migration

```bash
sh scripts/backup.sh
docker compose -f docker-compose.prod.yml up -d   # migrations aplicadas no boot da api
sh scripts/monitor-prod.sh
```

> Se precisar aplicar migrations sem reiniciar a api (imagem distroless, sem `pnpm`/`npx`):
> ```bash
> docker compose -f docker-compose.prod.yml exec api \
>   /nodejs/bin/node node_modules/prisma/build/index.js migrate deploy --schema prisma/schema.prisma
> ```

## 11. PWA e notificações push

A área restrita usa `manifest.webmanifest`, `sw.js` e os ícones em `apps/web/public/icons`. O app instalado abre direto em `/dashboard`.

Para ativar Web Push em produção, gere chaves VAPID:

```bash
npx web-push generate-vapid-keys
```

Configure no `.env` do servidor:

```bash
VAPID_PUBLIC_KEY=CHAVE_PUBLICA
VAPID_PRIVATE_KEY=CHAVE_PRIVADA
VAPID_SUBJECT=mailto:admin@seudominio.com.br
```

Depois faça rebuild/restart da API e do Web:

```bash
docker compose -f docker-compose.prod.yml build api web
docker compose -f docker-compose.prod.yml up -d api web nginx
```

O botão de sino com bloqueio/liberação no topo da área restrita ativa ou desativa o push no dispositivo atual. Navegadores móveis exigem HTTPS e permissão explícita do usuário.

A Recepção também gera push operacional para:

- cliente perto de chegar;
- cliente atrasado com baixa pendente;
- cliente que chegou e ainda não virou OS.

## 12. Domínios próprios e resolução por host

Cada oficina pode apontar um domínio próprio para o site público:

1. **Configurações › Domínios**: cadastre o domínio. Ele entra como **não verificado**.
2. Publique no DNS o registro **TXT** mostrado (`_oficina-verify.<domínio>` = token).
3. Clique em **Verificar** — a API consulta o TXT e marca como verificado.
4. Faça o DNS do domínio (A/AAAA/CNAME) apontar para o servidor.

Em **produção**:

- só **domínios verificados** resolvem o site (segurança);
- a resolução usa o **host real**. O Nginx sobrescreve `X-Forwarded-Host` com o
  host da requisição (anti-spoof) e o SSR do Next repassa esse host para a API;
- overrides de oficina por `?tenantSlug=` e headers `X-Public-*` são **ignorados**
  (controlado por `NODE_ENV=production` ou `PUBLIC_STRICT_HOST=true`). A rota
  explícita `GET /api/public/site/by-slug/:slug` continua disponível.
