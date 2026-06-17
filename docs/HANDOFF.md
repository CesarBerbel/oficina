# Prompt de continuidade — Sistema de Gestão para Oficina Mecânica

> Cole este prompt em uma nova sessão para continuar o desenvolvimento.
> Ele resume o que existe, as convenções e o que falta.
>
> ⚠️ **O estado atual é mantido em [`docs/STATUS.md`](STATUS.md)** — consulte lá a
> lista real do que está implementado, testes e CI. As notas abaixo são histórico.

---

## Contexto

Estou desenvolvendo um **sistema completo de gestão para oficina mecânica**
(substituto moderno do "MotorMind"). O código está em `C:\claude\oficina`
(Windows), versionado em Git/GitHub (`CesarBerbel/oficina`) com CI. Quero que você
continue a partir do estado atual, mantendo a arquitetura e os padrões existentes.

### Stack
- **Monorepo** pnpm workspaces + Turborepo: `apps/api` (NestJS 10), `apps/web`
  (Next.js 15 App Router), `packages/shared` (tipos/enums/schemas Zod/RBAC).
- **Backend**: NestJS + Prisma + PostgreSQL 16. Auth JWT (access + refresh
  httpOnly) com RBAC por perfil. Validação Zod (mesmos schemas no front).
- **Frontend**: Next.js + TypeScript + Tailwind + shadcn/ui + TanStack Query.
- **Multi-tenant matriz/filial**: todas as tabelas têm `tenantId`; catálogo e
  clientes compartilhados no grupo (`groupId`) e estoque por filial. Login por
  oficina (slug + e-mail + senha) e **instalação web** da matriz. Falta resolução
  por domínio próprio para virar SaaS multi-domínio.
- **Deploy**: Docker + Docker Compose + Nginx, com proxy de `/api` e `/uploads` para a API.
- **Status**: ver [`docs/STATUS.md`](STATUS.md). Em resumo: núcleo operacional
  completo + hardening (secrets, uploads, garagem), outbox transacional, auditoria
  imutável, permissões de IA granulares, índices de busca `pg_trgm`, CI com E2E de
  API e de frontend (Playwright).

### Ambiente (importante)
- Node 24, pnpm 9.15.9 (instalado via npm global), Docker Desktop.
- **Postgres dev na porta 5433** (host) e **Postgres E2E na porta 5434**
  (`docker-compose.test.yml`) para evitar conflito entre banco local e banco
  descartável de testes. `.env` na raiz é a fonte única do desenvolvimento
  (usado por compose, Prisma e Nest).
- Comandos Prisma rodam da **raiz** (`package.json` tem `prisma.schema` apontando
  para `apps/api/prisma/schema.prisma`).
- Login seed: oficina (slug) `oficina-modelo` · `admin@oficina.local` / `Admin@123`.
- Há uma **chave OpenAI válida** configurada no banco (IA funciona de verdade).
- VAPID (web push) já gerado e no `.env`.
- Subir: `docker compose up -d` + `pnpm dev` (aplica migrations pendentes, API :3333/api, Web :3000). Use `WEB_PORT=3001 pnpm --filter @oficina/web dev` no Linux/macOS, ou `$env:WEB_PORT=3001; pnpm --filter @oficina/web dev` no PowerShell, se a porta 3000 estiver ocupada.

### Convenções
- Idioma: domínio em PT-BR (OS, peça, orçamento), código/infra em EN, UI em PT-BR.
- Imports relativos no NestJS **sem** extensão `.js`; `packages/shared` compila
  para `dist` (CommonJS) e é consumido por ambos.
- Dinheiro: `Decimal(12,2)` no banco, `Number()` nos DTOs; quantidade `Decimal(12,3)`.
- Listas seguem o padrão responsivo (tabela no desktop / cards no mobile).
- Toda mutação relevante gera **auditoria**; estoque só muda via `applyStockMovement`.
- Eventos de OS disparam **notificações internas/push** e **mensagens** (templates).

---

## O que já está feito (10 fases + extras)

1. **Fundação**: monorepo, Docker, Prisma, bootstrap Nest/Next, RBAC base, logs Pino,
   filtro global de erros, rate limit, README.
2. **Auth & RBAC**: login/refresh/logout, guards (JWT + permissões), CRUD de
   funcionários, bloqueio/inativação, `LoginAttempt`, `AuditLog`. Telas de login e usuários.
3. **Clientes & Veículos**: CRUD completo, detalhe do cliente com veículos, listas responsivas.
4. **OS (núcleo)**: máquina de estados pura e testada, com matriz compartilhada
   (`SERVICE_ORDER_TRANSITIONS`), ações manuais (`SERVICE_ORDER_MANUAL_TRANSITIONS`),
   endpoint `GET /service-orders/:id/transitions`, guardas de domínio e retorno
   `availableTransitions` no detalhe da OS. Itens com snapshot de preço, totais
   automáticos, travas de edição, timeline e **Kanban técnico** em tela cheia, sem rolagem externa, com rolagem apenas
   dentro das colunas quando houver muitos cards, sem OS canceladas/entregues/
   recusadas e com botões de ação rápida por card, sem botão de cancelamento
   no quadro. Tela da OS rica.
5. **Catálogo & Estoque**: serviços (com peças padrão), **combos** (expandem nos
   serviços na OS, sem aparecer como combo), peças/insumos, movimentações + histórico,
   baixa/estorno de estoque na OS.
6. **Orçamento, Acompanhamento & PDF**: orçamento com aprovação total/parcial por
   item + recusa (IP/assinatura), página pública por token (`/acompanhar/[token]`),
   **PDF da OS** (pdfkit) usando logo, dados da oficina e rodapé configurável.
7. **Compras & NF-e**: fornecedores, pedidos de compra (manual + "de peças em falta"),
   recebimento que dá entrada no estoque, **importador de NF-e XML/ZIP** com tela de
   conferência editável.
8. **Dashboard, Central de Ações & Notificações**: métricas reais, pendências por
   prioridade, sino + página de notificações + **push PWA (VAPID)**.
9. **Mensagens, Site Público & Blog**: templates com variáveis e **envio automático
   por evento** (adapter mock/log), site público com SEO + painel, menu mobile, endereço clicável para Google Maps/Waze no mobile, home responsiva, blog, **Central de Pré-atendimento** do site.
10. **Configurações, Auditoria, IA & Relatórios**: hub de configurações, visualização
    de auditoria, módulo de IA (provider + **chave criptografada AES-GCM**), relatórios
    (faturamento, OS por status, top serviços/peças).
11. **Hardening & Produção**: e2e (Supertest + Playwright scaffold), sanitização
    anti-XSS do Maps embed, PWA instalável, split URL interna/pública, **build da stack
    de produção validado via Nginx**, `docs/DEPLOY.md`.
- **Extras**: upload de imagens (storage local, `/uploads`); **IA generativa real** —
  assistente para diagnóstico/observações da OS e relato na abertura, corpo de
  mensagens, e geração de artigo de blog a partir do assunto.
- **Check-in do veículo** (item 7 do spec): modelo `VehicleCheckin` (KM, nível de
  combustível, **avarias** marcadas sobre diagrama clicável, **checklist** de
  inspeção, **fotos** múltiplas e **assinatura** em canvas), permissão
  `checkins:write` (ADMIN/ATENDENTE). Módulo `checkins` na API (`POST/GET /checkins`),
  telas `/check-in` (lista), `/check-in/novo` e `/check-in/[id]`, item no menu e
  atalho "Fazer check-in" na OS. **Sempre vinculado a uma OS** (`serviceOrderId`
  obrigatório, `onDelete: Cascade`); o veículo é derivado da OS. No `/check-in/novo`
  a OS é escolhida num **combobox com busca**. Ao registrar, atualiza
  `vehicle.currentKm` e o KM da OS se vazio.
- **Combobox com busca** reutilizável (`components/ui/searchable-select.tsx`): usado
  nos seletores de adicionar serviço/combo/peça da OS (`os-catalog-picker`, antes
  `<select>` nativo estreito) e na escolha de OS do check-in. Painel largo, sem truncar.
- **Estoque nunca negativo**: `applyStockMovement` (`stock.helper.ts`) rejeita saídas/
  consumos sem saldo e ajustes para valor negativo (`BadRequestException` com a
  quantidade disponível). Vale para baixa na OS, ajustes e saídas manuais.
- **Nova OS**: ao escolher o cliente, o **primeiro veículo** dele já vem selecionado.
- **Vínculo peça→serviço na OS**: ao adicionar um serviço (avulso ou via combo), suas
  peças padrão ficam vinculadas a ele (`ServiceOrderItem.parentItemId`; espelhado em
  `QuoteItem.parentItemId`). A peça mostra um selo "↳ {serviço}" na OS. Na **aprovação
  do orçamento** a decisão é **atômica por grupo** (serviço + peças vinculadas): recusar
  qualquer membro recusa o grupo inteiro — enforçado no servidor (`quotes.service`) e
  refletido na página pública `/acompanhar/[token]` (checkbox arrasta o grupo).
  **UI manual**: no painel de Peças da OS, cada peça tem um select "↳ serviço" para
  vincular/desvincular a qualquer serviço da OS (via `PATCH /service-orders/:id/items/:itemId`
  com `parentItemId`; valida que só peças vinculam e que o alvo é um serviço da mesma OS).

Menu lateral dividido em seções (Atendimento, Estoque & Compras, Gestão, Sistema);
itens de configuração ficam só dentro do hub `/configuracoes`.

---

## O que falta / próximos passos

### Pendências de escopo conhecidas (parcialmente feitas)
- **WhatsApp/E-mail/SMS reais**: hoje é adapter mock (status "Simulado"). Plugar
  provider real (ex.: SMTP para e-mail, API de WhatsApp).
- **Aniversário do cliente**: evento de mensagem existe, falta o **disparo agendado**
  (cron) — não há campo de data de nascimento no cliente nem job agendado.
- **Categorias/Marcas gerenciáveis**: hoje são texto livre nos cadastros; o spec
  pede listas configuráveis.
- ~~**IA**: faltam logs de uso e instruções por campo~~ **feito** — ver
  "Melhorias recentes — IA" abaixo (instruções por campo + logs de uso/tokens).
- **Aprovação parcial do orçamento**: registra as decisões por item, mas a **remoção
  automática** dos itens recusados na OS é manual (estorno de estoque já existe).
- **Logo no PDF**: embute PNG/JPEG; SVG/WebP não são suportados pelo pdfkit. O rodapé
  do PDF é **rich text** (negrito/itálico/sublinhado/listas), editável em Site público.

### Hardening/produção a finalizar
- **TLS/HTTPS** no Nginx (hoje só porta 80) + `AUTH_COOKIE_SECURE=true`.
- **Cobertura de testes** maior (mais unit/integração; rodar Playwright de fato —
  precisa `playwright install`).
- **Storage S3/R2** em produção para escala/HA; hoje o deploy usa volume Docker persistente `oficina_uploads`.
- **Seed de produção**: a imagem final é prod-only (distroless, sem `ts-node`), então
  `prisma db seed` **não roda no container** — rode via container `node` descartável
  na rede do compose (passo documentado em `docs/DEPLOY.md` §4).

### Melhorias sugeridas
- Edição inline de quantidade dos itens da OS reajustando estoque.
- Vincular pedido de compra a uma OS específica (modelo já permite `osId`).
- Relatórios com filtro por período e export (CSV/PDF).
- Multi-oficina (SaaS): o **login já é por slug de oficina**; falta o **cadastro/
  onboarding de novas oficinas**, a **resolução automática por domínio/subdomínio**
  e a UI de gestão de tenants (o `tenantId` já está em todas as tabelas).
- ~~Otimizar imagens Docker~~ **feito**. Tamanhos: **API 1.61GB→443MB**, **Web 1.94GB→334MB**.
  - **Deps de produção**: API usa `pnpm deploy --prod` (árvore self-contained, só
    dependencies, Prisma Client regerado); Web usa Next.js `output: 'standalone'` (file-tracing).
  - **Runtime distroless + nonroot** (`gcr.io/distroless/nodejs22-debian12:nonroot`,
    uid 65532): glibc para os prebuilds nativos (argon2) e o engine do Prisma (libssl).
    Como distroless não tem shell, a API roda via `docker/api-entrypoint.mjs` (migrate
    deploy + boot); o Web usa o `server.js` do standalone. Validado end-to-end contra
    Postgres (migrate + health `db:up`).
  - **Atenção**: o runtime da API é prod-only, sem `ts-node`/`typescript` — o seed de
    produção (`prisma db seed`, que usa ts-node) **não roda no container final**; rode-o
    a partir de uma imagem de build/dev ou compile o seed para JS. `prisma` passou de
    devDependency para dependency (usado no `migrate deploy` em runtime).

---

## Como rodar e testar

### Desenvolvimento no Windows PowerShell

```powershell
cd C:\claude\oficina
Remove-Item Env:DATABASE_URL -ErrorAction SilentlyContinue
docker compose up -d            # Postgres dev via .env, normalmente porta 5433
corepack enable
corepack prepare pnpm@9.15.9 --activate
pnpm install --frozen-lockfile
pnpm prisma:generate
pnpm prisma:deploy
pnpm prisma:seed                # cria oficina "oficina-modelo" + admin
pnpm dev                        # API :3333/api + Web :3000
# Login: Oficina = oficina-modelo · admin@oficina.local / Admin@123
```

### E2E da API no Windows PowerShell

```powershell
docker compose -f docker-compose.test.yml up -d   # Postgres E2E, porta 5434
$env:DATABASE_URL="postgresql://oficina:oficina_test_pwd@localhost:5434/oficina_test?schema=public"
pnpm prisma:validate
pnpm prisma:generate
pnpm prisma:deploy
pnpm --filter @oficina/api test:e2e
Remove-Item Env:DATABASE_URL
```

### Qualidade/build

```powershell
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

### Produção

```powershell
docker compose -f docker-compose.prod.yml up -d --build
```

Documentos de referência: `docs/ARQUITETURA.md` (arquitetura/roadmap) e
`docs/DEPLOY.md` (deploy).
### Melhorias recentes — OS, Kanban e produtividade

- **Timeline da OS**: a OS agora possui `ServiceOrderEvent`, registrando alterações de status, notas técnicas, checklist, fotos, eventos sistêmicos e visibilidade interna/pública. O endpoint `GET /api/service-orders/:id/timeline` retorna a linha do tempo operacional e o detalhe da OS também inclui `events`.
- **Notificações automáticas**: eventos relevantes da OS disparam notificações internas para atendimento/administração e mensagens automáticas por templates (`OS_OPENED`, `DIAGNOSIS_READY`, `QUOTE_SENT`, `QUOTE_APPROVED`, `OS_IN_EXECUTION`, `OS_READY`, `CUSTOMER_NOTIFIED`, `VEHICLE_DELIVERED`). O seed cria templates WhatsApp simulados com `autoSend` ativo.
- **Modo técnico mobile**: o detalhe da OS possui painel para o técnico registrar checklist, observações e fotos. Fotos usam o endpoint seguro `/uploads`; atualizações podem ser marcadas como públicas para aparecerem na consulta do cliente.
- **Kanban com drag-and-drop**: além dos botões rápidos, o card pode ser arrastado para outra coluna quando existir transição rápida válida. Cancelamento continua oculto no Kanban.
- **Dashboard de produtividade**: novo endpoint `GET /api/dashboard/productivity` calcula ciclo médio, tempo médio por etapa e produtividade por técnico nos últimos 30 dias.



### Central de Pré-atendimento

A tela `/leads` foi evoluída para Central de Pré-atendimento: busca cliente por nome/telefone/e-mail, procura veículo pela placa, alerta em amarelo quando a placa pertence a outro cliente, registra resultado de ligação/WhatsApp/e-mail e permite converter o contato em cliente, veículo e OS.

### Melhorias recentes — UX, PDF, Endereço, IA e Docker

**UX / Frontend**
- **Confirmações estilizadas**: `useConfirm`/`<ConfirmProvider>` (`components/ui/confirm-dialog.tsx`)
  substituíram todos os `confirm()` nativos (exclusões, transições de OS, reabrir orçamento).
- **Detalhe da OS em abas** (desktop e mobile): topo com linha do tempo de estados
  (compacta, sem cabeçalho) + próximas ações; abaixo, abas **Resumo · Itens ·
  Orçamento · Histórico**. Componente único `features/service-orders/os-detail-view.tsx`
  parametrizado por `variant` (`useMediaQuery`/`useIsDesktop` em `lib/use-media-query.ts`).
- **Página do técnico** (`/os/[id]/tecnico`, aberta pelos cards do Kanban): versão
  enxuta para o chão da oficina — sem entradas de estados, sem resumo financeiro,
  sem orçamento; abas **Resumo · Itens · Técnico · Histórico**. A tela completa
  (`/os/[id]`) **não tem** a aba Técnico.
- **Itens da OS viram cards no mobile**; **Kanban** mostra colunas a partir de `lg`
  (antes `xl`), melhor em tablet.
- **Aprovação pública do orçamento** (`/acompanhar/[token]`): total **recalculado ao
  vivo** ao marcar/desmarcar itens; cada linha mostra serviço · qtd · valor unitário ·
  total; linhas de serviço com fundo destacado; linha do tempo removida.

**PDF da OS** (`apps/api/src/modules/pdf/service-order-pdf.renderer.ts`)
- Redesenho profissional, compacto (alvo de 1 página): cabeçalho à esquerda em linhas
  (nome / rua, número, complemento, bairro / CEP - cidade/UF / tel - whats / cnpj - email),
  caixa da OS, cards Cliente/Veículo, **só Diagnóstico** (relato removido), tabela única
  de itens com **peças agrupadas sob o serviço** (via `parentItemId`) e **resumo
  financeiro horizontal**. Rodapé é **rich text** (HTML) renderizado com negrito/
  itálico/sublinhado/listas; espaçamento de linhas reduzido. (`↳` não existe na fonte
  WinAnsi do pdfkit; use `»`/`•`.)

**Endereço estruturado da oficina** (Site público)
- `SiteSettings` ganhou `addressZip/Street/Number/Complement/District/City/State`
  (migration `20260616120000_site_structured_address`). O campo `address` (string única)
  é **recomposto no servidor** a partir das partes, então site público/PDF seguem
  funcionando. Form com busca por **CEP (ViaCEP)**. Util `composeAddress`/`sanitizeRichHtml`
  em `packages/shared`. Editor rich text do rodapé: `components/ui/rich-text-editor.tsx`.

**IA — instruções por campo + logs de uso**
- **Instruções por campo**: registro `AI_FIELDS` (relato/diagnóstico/observações da OS,
  corpo de mensagem, artigo de blog) com defaults; override por tenant em
  `AiConfig.fieldInstructions` (JSON, migration `20260616160000_ai_field_instructions`).
  A instrução do campo entra no *system prompt*; `AiAssistButton` passa `field`.
  Configurável em Configurações › IA.
- **Logs de uso**: modelo `AiUsageLog` (migration `20260616170000_ai_usage_logs`) grava
  cada chamada (tipo, campo, provedor, sucesso/erro, chars, **tokens**). Provider retorna
  tokens (OpenAI `usage`, Gemini `usageMetadata`). Endpoint `GET /api/ai-config/usage`
  e seção "Uso recente da IA" na página de IA (totais de 30 dias + últimas chamadas).

**Docker / Produção**
- Imagens otimizadas (**API 1.61GB→443MB, Web 1.94GB→334MB**): `pnpm deploy --prod`
  (API) e Next `output: 'standalone'` (Web, opt-in via `NEXT_OUTPUT_STANDALONE`, ligado
  só no Dockerfile — evita quebra de symlink no Windows). Runtime **distroless + non-root**.
- **Healthcheck corrigido**: distroless não tem shell → `docker-compose.prod.yml` usa
  `CMD` (exec) com `/nodejs/bin/node`, não `CMD-SHELL`. Sem isso, api/web ficavam
  `unhealthy` e a stack não subia.

**Segurança (HTTPS), Aniversário e Testes**
- **HTTPS/TLS**: `docker/nginx/default-tls.conf` (HTTP→HTTPS + 443 com HSTS) +
  override `docker-compose.tls.yml` (publica 80/443, monta `docker/nginx/certs`,
  `AUTH_COOKIE_SECURE=true`). Subir com `-f docker-compose.prod.yml -f docker-compose.tls.yml`.
  Passos de certbot em `docs/DEPLOY.md` §6. Rota `/healthz` adicionada ao Nginx.
- **Aniversário (cron)**: campo `Customer.birthDate` (migration
  `20260616180000_customer_birthdate` + form de cliente). `@nestjs/schedule` +
  `BirthdayCronService` roda diário (08:00 America/Sao_Paulo), busca aniversariantes
  e dispara `CUSTOMER_BIRTHDAY` via `MessagingService.dispatchCustomerBirthday`
  (idempotente no dia). A remoção automática de itens recusados no orçamento **já
  existia** (quotes.service).
- **Seed de templates dedicado**: `apps/api/prisma/seed-templates.ts`
  (`seedMessageTemplates(prisma, tenantId)`, idempotente) com todos os eventos +
  **template de aniversário** (ativo, autoSend). O `seed.ts` principal chama essa
  função. Standalone: `pnpm --filter @oficina/api prisma:seed:templates` (todos os tenants).
- **Testes novos**: `composeAddress`, `sanitizeRichHtml`, `aiFieldDefault`
  (`apps/api/src/modules/{site,ai}/*.spec.ts`). Suíte da API: 11 suites / 53 testes.
