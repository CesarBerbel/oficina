# Oficina — Sistema de Gestão para Oficina Mecânica

Plataforma moderna de gestão de oficina (clientes, veículos, ordens de serviço,
orçamentos, estoque, compras, mensagens, site público e acompanhamento do
cliente), desenhada para evoluir como **SaaS multi-oficina**.

- **Frontend:** Next.js 15 (App Router) + TypeScript + Tailwind + shadcn/ui
- **Backend:** NestJS 10 + TypeScript
- **Banco:** PostgreSQL 16 · **ORM:** Prisma
- **Auth:** JWT (access + refresh httpOnly) · RBAC por perfil
- **Monorepo:** pnpm workspaces + Turborepo
- **Deploy:** Docker + Docker Compose + Nginx

> 📐 A arquitetura, o modelo de dados e o roadmap por fases estão em
> [`docs/ARQUITETURA.md`](docs/ARQUITETURA.md). **Status atual: fases 0 a 10
> concluídas, com hardening, CI e E2E da API ativos.**

---

## Estrutura

```
oficina/
├─ apps/
│  ├─ api/      # Backend NestJS (Prisma, auth, módulos de negócio)
│  └─ web/      # Frontend Next.js (App Router, Tailwind, shadcn)
├─ packages/
│  └─ shared/   # Tipos, enums, schemas Zod e RBAC compartilhados
├─ docker/      # Dockerfiles + Nginx
├─ scripts/     # Backup, utilitários
└─ docs/        # Arquitetura e documentação
```

---

## Pré-requisitos

- **Node.js** ≥ 20 (recomendado 22)
- **pnpm** ≥ 9 — instale com `npm install -g pnpm`
- **Docker** + Docker Compose

---

## Setup de desenvolvimento

```bash
# 1) Variáveis de ambiente
cp .env.example .env            # Windows: copy .env.example .env
# Antes de produção, gere novos JWT_*_SECRET e ENCRYPTION_KEY:
./scripts/generate-secrets.sh

# 2) Dependências
corepack enable
corepack prepare pnpm@9.15.9 --activate
pnpm install --frozen-lockfile

# 3) Subir o banco (PostgreSQL via Docker)
docker compose up -d

# 4) Migrations + Prisma Client
pnpm prisma:migrate             # cria o schema no banco
pnpm prisma:seed                # cria oficina padrão + usuário admin
# ou, para criar uma oficina personalizada:
pnpm seed -- --oficina "Auto Mecânica Bandeirantes" --slug automec-band --user adm@adm.com --senha 321654

# 5) Rodar tudo (API + Web) em modo dev
pnpm dev
```

- **Web:** http://localhost:3000
- **API:** http://localhost:3333/api  ·  healthcheck: `GET /api/health`

### Dados de acesso da seed

A tela de login exige o identificador da oficina porque o sistema é multi-tenant.
Após rodar `pnpm prisma:seed`, use:

| Campo | Valor |
| --- | --- |
| Oficina | `oficina-modelo` |
| E-mail | `admin@oficina.local` |
| Senha | `Admin@123` |

Para criar uma oficina personalizada sem editar o `.env`, use:

```bash
pnpm seed -- --oficina "Auto Mecânica Bandeirantes" --slug automec-band --user adm@adm.com --senha 321654
```

O seed também aceita as variáveis `SEED_TENANT_NAME`, `SEED_TENANT_SLUG`,
`SEED_ADMIN_EMAIL` e `SEED_ADMIN_PASSWORD`. Os argumentos de linha de comando
têm prioridade sobre as variáveis do `.env`.

Também há um botão na página `/login` para preencher os dados de demonstração automaticamente.

> Os comandos Prisma acima já executam a partir da raiz via scripts do monorepo.
> Para rodar diretamente no workspace da API, use `pnpm --filter @oficina/api prisma:migrate`,
> `pnpm --filter @oficina/api prisma:seed` e `pnpm --filter @oficina/api prisma:generate`.

---

## Scripts (raiz do monorepo)

```bash
pnpm dev          # build shared + prisma generate/deploy + API/Web em watch
pnpm build        # build de todos os pacotes/apps
pnpm test         # testes (Jest na API)
pnpm lint         # ESLint em todos os workspaces
pnpm typecheck    # checagem de tipos
pnpm format       # Prettier --write
pnpm seed         # executa seed; aceita argumentos após --
```

Por workspace (ex.: só a API):

```bash
pnpm --filter @oficina/api dev
WEB_PORT=3001 pnpm --filter @oficina/web dev  # porta customizada no Linux/macOS
# No Windows PowerShell: $env:WEB_PORT=3001; pnpm --filter @oficina/web dev
pnpm --filter @oficina/web dev
pnpm --filter @oficina/api test
```

---

## Banco de dados (Prisma)

```bash
pnpm prisma:migrate             # dev: cria/aplica migrations
pnpm prisma:seed                # popula dados iniciais padrão
pnpm seed -- --oficina "Auto Mecânica Bandeirantes" --slug automec-band --user adm@adm.com --senha 321654
pnpm --filter @oficina/api prisma:studio   # GUI do banco
pnpm prisma:generate            # regenera o client
```

### Banco de teste E2E

O banco E2E local usa `docker-compose.test.yml` e, por padrão, expõe o PostgreSQL
na porta **5434** para não disputar a porta **5433** usada pelo banco de
desenvolvimento no `.env.example`.

No Windows PowerShell:

```powershell
docker compose -f docker-compose.test.yml up -d
$env:DATABASE_URL="postgresql://oficina:oficina_test_pwd@localhost:5434/oficina_test?schema=public"
pnpm prisma:validate
pnpm prisma:generate
pnpm prisma:deploy             # opcional: o test:e2e também aplica migrations
pnpm --filter @oficina/api test:e2e
Remove-Item Env:DATABASE_URL
```

---

## Máquina de estados da OS

A OS possui uma matriz explícita de estados em `packages/shared` e validação
autoritativa no backend. O detalhe da OS retorna `availableTransitions`, e o
endpoint `GET /api/service-orders/:id/transitions` expõe as próximas ações
manuais já com label, descrição, confirmação, flag destrutiva e motivo de
bloqueio (`disabledReason`). Transições sistêmicas, como geração de orçamento,
aprovação pública, recebimento de compra e reabertura de orçamento, continuam
acontecendo nos módulos próprios.

---

## Produção (Docker)

```bash
# Build e subida completa (postgres + api + web + nginx)
docker compose -f docker-compose.prod.yml up -d --build

# Aplicar migrations em produção
pnpm prisma:deploy
```

A aplicação fica acessível via Nginx em `http://localhost` (porta 80), que roteia
`/api` e `/uploads` para a API e o restante para o frontend.

Seed inicial (primeira vez): `docker compose -f docker-compose.prod.yml exec api npx prisma db seed`

Seed inicial com dados personalizados:

```bash
docker compose -f docker-compose.prod.yml exec api npx prisma db seed -- --oficina "Auto Mecânica Bandeirantes" --slug automec-band --user adm@adm.com --senha 321654
```

> **Guia completo de deploy** (env, HTTPS, backup, seed, S3): [`docs/DEPLOY.md`](docs/DEPLOY.md).
> Antes do deploy, configure os segredos no `.env` (JWT, `ENCRYPTION_KEY`,
> credenciais do banco, `WEB_ORIGIN`).

---

## Backup

```bash
./scripts/backup.sh              # pg_dump compactado em ./backups (retém 14)
```

Agende via cron para backups automáticos.

---

## Qualidade

- **ESLint + Prettier** com Husky + lint-staged (formata no commit).
- **Validação** com **Zod** — schemas compartilhados entre frontend e backend.
- **Tratamento global de erros**, **logs estruturados** (Pino), **rate limit**,
  **Helmet**, **CORS** restrito e cookies httpOnly.
- **Testes**: unitários e de integração com Jest/Supertest (e2e web com
  Playwright nas fases seguintes).

---

## Roadmap (resumo)

| Fase | Entrega | Status |
|------|---------|--------|
| 0 | Fundação (monorepo, Docker, Prisma, NestJS, Next.js, RBAC base) | ✅ |
| 1 | Auth, usuários e permissões (JWT+refresh, RBAC, auditoria, login/usuários) | ✅ |
| 2 | Clientes e veículos (CRUD, listas responsivas, detalhe do cliente) | ✅ |
| 3 | **Ordens de Serviço (núcleo)**: máquina de estados com ações disponíveis pela API, guardas de domínio, itens, totais, timeline, travas + Kanban técnico em tela cheia com rolagem somente nas colunas e ações rápidas sem cancelamento pelo quadro | ✅ |
| 4 | Serviços (peças padrão), combos (expandem na OS), estoque + movimentações + baixa na OS | ✅ |
| 5 | Orçamento (aprovação total/parcial), acompanhamento público por token e PDF da OS | ✅ |
| 6 | Fornecedores, pedidos de compra (+ recebimento → estoque) e importador de NF-e XML/ZIP | ✅ |
| 7 | Dashboard (métricas reais), central de ações e notificações internas + push PWA (VAPID) | ✅ |
| 8 | Mensagens (templates+eventos automáticos), site público com SEO, menu mobile, endereço clicável para Google Maps/Waze, home responsiva, blog e Central de Pré-atendimento | ✅ |
| 9 | Configurações (hub), auditoria, IA (chave criptografada) e relatórios | ✅ |
| 10 | Hardening e produção: e2e, anti-XSS, PWA, Docker prod validado, deploy docs | ✅ |

**Extras entregues:** upload de imagens (storage local persistido em volume Docker e servido em `/uploads`) nos campos de imagem (blog, logos do site), PDF da OS com cabeçalho e rodapé configuráveis · **IA generativa integrada** (OpenAI/Gemini com a chave criptografada): assistente para diagnóstico/observações da OS e corpo de mensagens, e geração de artigo de blog completo a partir do assunto.

Detalhes completos em [`docs/ARQUITETURA.md`](docs/ARQUITETURA.md).
### Melhorias recentes — OS, Kanban e produtividade

- **Timeline da OS**: a OS agora possui `ServiceOrderEvent`, registrando alterações de status, notas técnicas, checklist, fotos, eventos sistêmicos e visibilidade interna/pública. O endpoint `GET /api/service-orders/:id/timeline` retorna a linha do tempo operacional e o detalhe da OS também inclui `events`.
- **Notificações automáticas**: eventos relevantes da OS disparam notificações internas para atendimento/administração e mensagens automáticas por templates (`OS_OPENED`, `DIAGNOSIS_READY`, `QUOTE_SENT`, `QUOTE_APPROVED`, `OS_IN_EXECUTION`, `OS_READY`, `CUSTOMER_NOTIFIED`, `VEHICLE_DELIVERED`). O seed cria templates WhatsApp simulados com `autoSend` ativo.
- **Modo técnico mobile**: o detalhe da OS possui painel para o técnico registrar checklist, observações e fotos. Fotos usam o endpoint seguro `/uploads`; atualizações podem ser marcadas como públicas para aparecerem na consulta do cliente.
- **Kanban com drag-and-drop**: além dos botões rápidos, o card pode ser arrastado para outra coluna quando existir transição rápida válida. Cancelamento continua oculto no Kanban.
- **Dashboard de produtividade**: novo endpoint `GET /api/dashboard/productivity` calcula ciclo médio, tempo médio por etapa e produtividade por técnico nos últimos 30 dias.



### Central de Pré-atendimento

A tela `/leads` foi evoluída para Central de Pré-atendimento: busca cliente por nome/telefone/e-mail, procura veículo pela placa, alerta em amarelo quando a placa pertence a outro cliente, registra resultado de ligação/WhatsApp/e-mail e permite converter o contato em cliente, veículo e OS.
