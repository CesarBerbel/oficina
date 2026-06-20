# Status real do projeto

> Fonte única do estado atual do sistema. Atualizado em 2026-06-20.

## Visão geral

Sistema de gestão para oficina mecânica (monorepo). Em uso/funcional, com
versionamento Git + GitHub e CI automatizado.

- **Monorepo**: pnpm workspaces + Turborepo — `apps/api` (NestJS 10 + Prisma +
  PostgreSQL 16), `apps/web` (Next.js 15 App Router), `packages/shared`
  (tipos/enums/schemas Zod/RBAC).
- **Repositório**: GitHub `CesarBerbel/oficina`. Branch padrão `main` protegida
  (exige 1 aprovação de PR). CI roda em todo push/PR.

## Implementado

### Núcleo operacional
- **Multi-tenant matriz/filial**: catálogo (serviços/combos/peças) e clientes/
  veículos compartilhados no grupo (`groupId`); **estoque por filial** (`PartStock`).
- **Instalação web**: assistente que cria a matriz (dados da oficina + admin),
  popula categorias e marcas de autopeças, e um super usuário com acesso global.
- **OS (ordem de serviço)**: ciclo completo (entrada → diagnóstico → orçamento →
  aprovação → compra → execução → entrega), timeline de eventos, criação inline
  de cliente/veículo/peça/serviço/categoria nos formulários.
- **Orçamento**: geração, envio, aprovação total/parcial e recusa via link público
  com token expirável; reenvio exige motivo, renova o prazo do link e bloqueia após aprovação.
  Permite desconto percentual por item do orçamento, além do desconto geral da OS.
- **Estoque/compras**: movimentações com baixa **atômica** (sem venda a descoberto),
  reservas, pedidos de compra e recebimento (parcial/total), importação de NF-e.
- **Financeiro**: contas a receber/pagar geradas a partir de OS/compras, baixa e
  resumo por período.
- **Garagem do cliente**: consulta pública por placa com código de acesso de uso
  curto (TTL 15 min).
- **Site público + blog + CRM/recepção (leads)** e relatórios/dashboard.

### Plataforma e segurança
- **RBAC** por perfil (ADMIN/ATENDENTE/TÉCNICO/ESTOQUISTA) com permissões
  granulares — inclui `uploads:write` e IA (`ai:read` / `ai:use` / `ai:manage`).
- **Auditoria** imutável (UPDATE bloqueado por trigger) com captura automática de
  IP/User-Agent via contexto de request.
- **Outbox transacional** para mensagens de OS/orçamento (entrega ao-menos-uma-vez,
  backoff exponencial, recuperação de itens presos).
- **Hardening de secrets**: em produção exige segredos JWT fortes/distintos, sem
  placeholders, `ENCRYPTION_KEY` válida e cookies seguros. Login por host/conta
  evita ambiguidade de e-mail entre filiais e exige seleção explícita quando necessário.
- **Busca**: índices GIN `pg_trgm` nas colunas pesquisadas (clientes, veículos,
  peças, serviços, fornecedores, usuários).
- **IA**: assistente de texto e geração de artigos (provedor configurável por tenant).
- **Mensageria**: e-mail por SMTP (driver real) ou `log` (simulado) via env.

## Testes

- **Unitários (API)**: 53 testes (Jest).
- **E2E da API**: suíte ampla contra Postgres real — inclui multi-tenant,
  concorrência de estoque, ciclo completo OS→orçamento→estoque→financeiro e outbox.
  Consulte `apps/api/test` para a contagem efetiva atual.
- **E2E de frontend (Playwright)**: login, navegação e cadastro pela UI — validado
  contra a stack real (API + Web).

## CI (GitHub Actions)

Pipeline em jobs paralelos: `static` (lint + typecheck + build), `unit`,
`api-e2e` (Postgres) e `web-e2e` (sobe API + Web e roda o Playwright de verdade).
Action composta `.github/actions/setup` (Node + pnpm + cache).

## Ambiente

- Node 20+ (CI usa 20; dev local em 24), pnpm 9.15.9, Docker.
- Postgres **dev :5433**, Postgres **E2E :5434** (`docker-compose.test.yml`).
- Comandos Prisma rodam da raiz (`prisma.schema` → `apps/api/prisma/schema.prisma`).
- Subir dev: `docker compose up -d` + `pnpm dev` (aplica migrations, API :3333, Web :3000).
- Seed: oficina `oficina-modelo` · `admin@oficina.local` / `Admin@123`.

## Lacunas conhecidas / próximos passos

- **Serviços grandes**: `leads`, `service-orders`, `quotes` e alguns painéis web
  ainda concentram lógica relevante. A decomposição para use cases/componentes
  menores deve continuar de forma incremental e coberta por testes.
- **WhatsApp/SMS**: ainda sem provedor real plugado (e-mail já é real via SMTP).
- **SaaS multi-domínio**: `TenantDomain` resolve o site por domínio próprio (em
  produção só **verificado**). A verificação é **automática por DNS**: o admin
  publica um registro **TXT** em `_oficina-verify.<domínio>` e a API confere o
  token (com diagnóstico de DNS na tela de domínios).
- **Quotas SaaS**: limites mensais usam contadores transacionais; `STORAGE_MB` é
  aplicado pelo uso real de `UploadAsset.sizeBytes`; criação de OS/upload consome
  quota dentro da transação efetiva.

## Segurança (resumo do que já existe)

- Segredos validados no boot (prod); auditoria imutável; outbox transacional.
- `/auth/refresh` valida origem (CSRF) e **detecta reuse de refresh revogado**
  (invalida a família de sessões).
- Resolução pública trava overrides `X-Public-*`/`tenantSlug` em produção (lead
  público inclusive); Nginx sobrescreve `X-Forwarded-Host`; domínios exigem
  verificação em produção.
- IA com timeout (AbortController) e limites de uso por tenant/usuário.
- **Métricas + alertas ativos**: `/api/metrics` reúne outbox, ledger, IA, SMTP,
  backup (heartbeat) e saúde; um monitor periódico notifica os admins
  (in-app + Web Push; e-mail nos críticos) com cooldown para não repetir.


## Últimas correções relevantes

Ver [`docs/CORRECOES_2026_06_20.md`](CORRECOES_2026_06_20.md) para a lista consolidada de correções de login multi-filial, quotas, expiração de token público, headers de segurança, Caddyfile por variável e desconto percentual por item do orçamento.
