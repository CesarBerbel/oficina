# Sistema de Gestão para Oficina Mecânica — Arquitetura & Roadmap

> Documento técnico base. Substitui/evolui o "MotorMind" em stack moderna.
> Status: **Proposta para aprovação** · Versão 0.1 · 2026-06-10

---

## 1. Visão geral e princípios

Objetivo: plataforma de gestão de oficina (clientes, veículos, ordens de serviço,
orçamentos, estoque, compras, mensagens, site público, acompanhamento do cliente,
relatórios) **desenhada desde o início para virar SaaS multi-oficina**.

Princípios de engenharia:

1. **Arquitetura modular limpa** — separação clara entre domínio, aplicação,
   infraestrutura e interface (ver §4).
2. **Multi-tenant desde o schema** — toda tabela de negócio carrega `tenantId`
   (oficina). No MVP roda como tenant único, mas o modelo de dados e as queries
   já isolam por tenant. Evita reescrita dolorosa depois.
3. **Tipos compartilhados** — contratos (DTOs, enums, schemas de validação) num
   pacote único consumido por backend e frontend. Uma fonte de verdade.
4. **Segurança por padrão** — RBAC, auditoria, rate limit, sanitização, uploads
   validados, segredos criptografados.
5. **Entrega em fatias verticais** — cada fase entrega algo que roda e se testa
   ponta a ponta, não camadas soltas.

---

## 2. Stack técnica (decisões)

| Camada            | Escolha                                   | Justificativa |
|-------------------|-------------------------------------------|---------------|
| Monorepo          | **pnpm workspaces + Turborepo**           | Build incremental, cache, scripts unificados |
| Frontend          | **Next.js 15 (App Router) + TypeScript**  | SSR/SSG p/ site público e SEO; RSC; PWA |
| UI                | **Tailwind CSS + shadcn/ui + Radix**      | Acessível, customizável, sem lock-in |
| Tabelas/dados     | **TanStack Table + TanStack Query**       | Tabelas desktop ricas + cache de dados |
| Formulários       | **React Hook Form + Zod**                 | Validação compartilhada com o backend |
| Backend           | **NestJS 10 + TypeScript**                | Modular, DI, testável, ecossistema maduro |
| ORM / DB          | **Prisma + PostgreSQL 16**                | Migrations, type-safety, produtividade |
| Auth              | **JWT access + refresh (cookie httpOnly)**| Stateless + rotação segura de refresh |
| Validação backend | **Zod (via nestjs-zod)**                  | Mesmos schemas do front; DTOs tipados |
| Uploads           | **Adapter Storage**: local (dev) / S3-R2  | Interface única, troca por env |
| PDF               | **pdfkit**  | PDF profissional da OS com cabeçalho e rodapé configuráveis |
| XML NF-e          | **fast-xml-parser**                       | Parser rápido, sem libs pesadas |
| Mensageria/eventos| **EventEmitter (MVP) → BullMQ/Redis**     | Eventos de OS internos; fila p/ envios |
| PWA               | **next-pwa / Serwist + Web Push (VAPID)** | Instalação + push notifications |
| Testes            | **Jest (unit) + Supertest (e2e API) + Playwright (e2e web)** | |
| Lint/format       | **ESLint + Prettier + Husky + lint-staged**| Qualidade automática em commit |
| Deploy            | **Docker + Docker Compose + Nginx**       | Reverse proxy, TLS, estático |
| Observabilidade   | **Pino (logs estruturados)** + healthcheck| JSON logs, correlação por request id |

---

## 3. Estrutura do monorepo

```
oficina/
├─ apps/
│  ├─ api/                      # NestJS (backend)
│  │  ├─ src/
│  │  │  ├─ modules/            # um módulo por bounded context
│  │  │  │  ├─ auth/
│  │  │  │  ├─ users/
│  │  │  │  ├─ tenants/
│  │  │  │  ├─ customers/
│  │  │  │  ├─ vehicles/
│  │  │  │  ├─ checkins/
│  │  │  │  ├─ service-orders/  # OS — núcleo do sistema
│  │  │  │  ├─ services/
│  │  │  │  ├─ combos/
│  │  │  │  ├─ inventory/
│  │  │  │  ├─ purchases/
│  │  │  │  ├─ quotes/          # orçamentos + aprovação
│  │  │  │  ├─ nfe-import/
│  │  │  │  ├─ pdf/
│  │  │  │  ├─ messaging/
│  │  │  │  ├─ notifications/
│  │  │  │  ├─ public-site/
│  │  │  │  ├─ blog/
│  │  │  │  ├─ audit/
│  │  │  │  ├─ settings/
│  │  │  │  ├─ ai/
│  │  │  │  └─ dashboard/
│  │  │  ├─ common/             # guards, interceptors, filters, decorators
│  │  │  ├─ infra/              # prisma, storage, mailer, queue, crypto
│  │  │  └─ main.ts
│  │  ├─ prisma/
│  │  │  ├─ schema.prisma
│  │  │  ├─ migrations/
│  │  │  └─ seed.ts
│  │  └─ test/                  # e2e
│  └─ web/                      # Next.js (frontend)
│     ├─ src/
│     │  ├─ app/
│     │  │  ├─ (auth)/login/
│     │  │  ├─ (dashboard)/     # área autenticada
│     │  │  │  ├─ dashboard/
│     │  │  │  ├─ clientes/
│     │  │  │  ├─ veiculos/
│     │  │  │  ├─ os/
│     │  │  │  ├─ kanban/
│     │  │  │  ├─ estoque/
│     │  │  │  ├─ compras/
│     │  │  │  ├─ ... 
│     │  │  │  └─ configuracoes/
│     │  │  ├─ (public)/        # site público (SSG/SSR)
│     │  │  └─ acompanhar/[token]/  # acompanhamento do cliente
│     │  ├─ components/         # ui (shadcn) + compostos
│     │  ├─ features/           # lógica por domínio (hooks, api clients)
│     │  ├─ lib/                # api client, auth, utils
│     │  └─ styles/
│     └─ public/
├─ packages/
│  ├─ shared/                   # tipos, enums, Zod schemas, constantes (DTOs)
│  ├─ ui/                       # (opcional) design system compartilhado
│  └─ config/                   # eslint, tsconfig, prettier base
├─ docker/
│  ├─ nginx/
│  ├─ Dockerfile.api
│  └─ Dockerfile.web
├─ docker-compose.yml           # dev: postgres + api + web (+ redis futuro)
├─ docker-compose.prod.yml      # prod: + nginx + builds otimizados
├─ turbo.json
├─ pnpm-workspace.yaml
└─ README.md
```

---

## 4. Arquitetura limpa por módulo (backend)

Cada módulo NestJS segue 4 camadas:

```
modules/service-orders/
├─ domain/              # entidades, value objects, regras puras, máquina de estados
│  ├─ entities/
│  ├─ value-objects/
│  └─ service-order.state-machine.ts
├─ application/         # casos de uso (use cases), portas (interfaces)
│  ├─ use-cases/
│  └─ ports/
├─ infrastructure/      # repositórios Prisma, mappers, adapters
│  └─ prisma/
└─ interface/           # controllers HTTP, DTOs, presenters
   ├─ service-orders.controller.ts
   └─ dto/
```

- **Domain** não conhece Prisma nem HTTP. Regras de negócio puras e testáveis.
- **Application** orquestra casos de uso e depende de *portas* (interfaces).
- **Infrastructure** implementa as portas com Prisma/storage/etc.
- **Interface** expõe HTTP, valida com Zod, mapeia DTO ↔ domínio.

> No MVP nem todo módulo precisa das 4 camadas plenas. A **OS** e **Estoque**
> (regras complexas) usam o padrão completo; CRUDs simples (blog, categorias)
> podem ter camada fina. Pragmatismo sobre dogma.

---

## 5. Modelo de dados (Prisma — visão consolidada)

Resumo das principais entidades e relações. O schema completo será detalhado na
implementação; aqui ficam as decisões estruturais.

### 5.1 Núcleo / acesso
- **Tenant** (oficina) — raiz multi-tenant. `id, nome, cnpj, ...`
- **User** — funcionários. `tenantId, nome, email, passwordHash, role, ativo`
- **Role** (enum): `ADMIN | ATENDENTE | TECNICO | ESTOQUISTA`
  - O **Cliente** não é User: acessa por **token público**, sem login.
- **RefreshToken** — rotação, revogação, device/ip.
- **LoginAttempt** — auditoria de tentativas (sucesso/falha, ip, ua).
- **AuditLog** — `userId, action, module, entity, entityId, before(JSON), after(JSON), ip, ua, createdAt`.
- **Permission/RolePermission** — RBAC granular (ações por módulo). Guard lê isto.

### 5.2 Cadastros
- **Customer** — PF/PJ, contatos, endereço, categorias, observações.
- **Vehicle** — `customerId, placa, fabricante, modelo, anoModelo, cor, combustível, motor, câmbio, kmAtual, obs`.
- **Checkin** — `vehicleId, customerId, km, nivelCombustivel, dataEntrada, itensPresentes(JSON), avarias(JSON), obs, assinaturaUrl`, com **CheckinPhoto[]**.

### 5.3 Catálogo
- **Service** — `nome, categoria, descrição, precoVenda, custo, tempoEstimado, ativo` + **ServiceDefaultPart[]** (peças padrão com qtd).
- **Combo** — `nome, descrição, valor, ativo` + **ComboService[]** (serviços incluídos; herda peças padrão).
- **Part** (peça/insumo) — `nome, sku, ean, tipo, categoria, marca, unidade, estoqueAtual, estoqueMinimo, precoCusto, precoVenda, fornecedorId, descrição, ativo`.
- **Category**, **Brand**, **Supplier** — auxiliares.

### 5.4 Ordem de Serviço (núcleo)
- **ServiceOrder** — `numero (sequencial por tenant), customerId, vehicleId, km, dataAbertura, dataPrevista, tecnicoId, problemaRelatado, diagnostico, observacoes, status, totalServicos, totalPecas, totalDesconto, totalGeral`.
- **ServiceOrderItemService** — serviço aplicado na OS (snapshot de preço/desc).
- **ServiceOrderItemPart** — peça aplicada na OS (snapshot de preço, baixa de estoque).
- **ServiceOrderItemCombo** — combo aplicado (expande em serviços + peças).
- **ServiceOrderStatusHistory** — timeline (`status, userId, at, nota`).
- **Quote** (orçamento) vinculado à OS — `token público, status, observacoes`.
  - **QuoteItem** — aprovação parcial por item (`aprovado/recusado/pendente`).
  - **QuoteDecision** — `tipo (total/parcial/recusa), ip, ua, assinatura, at`.

### 5.5 Estoque e compras
- **StockMovement** — `partId, tipo (ENTRADA|SAIDA|AJUSTE|CONSUMO_OS|COMPRA|ESTORNO), quantidade, custoUnit, origem (osId/purchaseId), userId, at`. Toda mudança de estoque passa por aqui (event sourcing leve).
- **PurchaseOrder** — `fornecedorId, status, dataPrevista, osId?`, + **PurchaseOrderItem[]**.
- **NfeImport** — registro de importação de XML + itens conferidos.

### 5.6 Comunicação / conteúdo
- **MessageTemplate** — `evento, canal (whatsapp/email/sms), corpo com variáveis`.
- **MessageLog** — `templateId, customerId, osId?, canal, status, payload`.
- **Notification** — interna: `userId, tipo, titulo, corpo, lida, link, entity`.
- **PushSubscription** — VAPID por usuário.
- **SitePage / SiteSettings** — conteúdo institucional editável.
- **BlogPost** — `titulo, slug, resumo, conteudo, imagem, autor, status, publishedAt, seoTitle, seoDescription`.
- **AiConfig** — `provider (openai/gemini), apiKeyEnc (criptografada), instruções por campo`.
- **AppSettings/SiteSettings** — dados da oficina, capacidade, logos (oficina/PDF), maps, redes e rodapé do PDF.

---

## 6. Máquina de estados da OS (regra central)

A OS usa uma máquina de estados explícita e testável. A matriz de domínio fica em
`packages/shared/src/enums/service-order-status.ts`; a validação autoritativa,
com guardas de contexto, fica em
`apps/api/src/modules/service-orders/domain/service-order.state-machine.ts`.

Fluxo principal:

```
ENTRADA → DIAGNOSTICO_PRONTO → ORCAMENTO → ORCAMENTO_APROVADO
        → EM_EXECUCAO → EM_TESTE → PRONTA → PRONTO_RETIRAR → ENTREGUE
```

Ramos/estados laterais:

```
ORCAMENTO → ORCAMENTO_RECUSADO → ORCAMENTO | CANCELADA
ORCAMENTO → AGUARDANDO_PECA → ORCAMENTO_APROVADO | EM_EXECUCAO | CANCELADA
qualquer etapa permitida pela matriz → CANCELADA
```

Separação importante:

- `SERVICE_ORDER_TRANSITIONS`: matriz completa de domínio, incluindo transições
  feitas por orçamento, compra, recebimento e sistema.
- `SERVICE_ORDER_MANUAL_TRANSITIONS`: ações manuais expostas em
  `POST /api/service-orders/:id/status`.
- `GET /api/service-orders/:id/transitions`: retorna as próximas ações manuais
  com label, descrição, flags de confirmação/destrutiva e `disabledReason`.
- `GET /api/service-orders/board`: retorna o kanban técnico sem OS canceladas,
  entregues ou recusadas, e cada card já traz `availableTransitions` para ações
  rápidas de mudança de status pelo frontend. O quadro ocupa a área útil da tela
  sem rolagem externa; quando houver muitos cards, apenas a coluna correspondente
  rola verticalmente. A ação de cancelamento não é exibida no Kanban;
  cancelamento continua disponível apenas no detalhe da OS.

Regras invioláveis (validadas no domínio, não só na UI):

1. `DIAGNOSTICO_PRONTO` exige diagnóstico técnico persistido.
2. `DIAGNOSTICO_PRONTO → ORCAMENTO` ocorre pelo fluxo de orçamento, não pelo
   endpoint genérico de status.
3. Aprovação/recusa manual de orçamento exige orçamento enviado.
4. Aprovação de orçamento reserva peças; se houver falta, a OS entra em
   `AGUARDANDO_PECA`; se houver estoque, entra em `ORCAMENTO_APROVADO`.
5. Recebimento total de compra vinculada pode avançar automaticamente
   `AGUARDANDO_PECA → ORCAMENTO_APROVADO`.
6. Entrar em `EM_EXECUCAO` baixa as peças reservadas uma única vez.
7. OS `ENTREGUE` ou `CANCELADA` é terminal e não pode ser editada.
8. OS `ORCAMENTO_APROVADO` ou `AGUARDANDO_PECA` é somente leitura; para editar,
   o orçamento deve ser reaberto pelo fluxo de orçamento.
9. Toda transição grava `ServiceOrderStatusHistory` e `AuditLog`.
10. Transição inválida lança erro de domínio e retorna `422`.

A página de detalhe da OS consome `availableTransitions` retornado pela API;
assim, a UI não duplica a regra e não oferece botões incompatíveis com o estado
real da OS.

---

## 7. Autenticação, permissões e segurança

- **Login** → access token (JWT curto, ~15min) + refresh token (cookie httpOnly,
  rotacionado, revogável). Logout revoga refresh.
- **Guards**: `JwtAuthGuard` (autenticação) + `PermissionsGuard` (RBAC por ação).
  Decorator `@RequirePermission('os:update')` nos controllers.
- **Matriz de permissões por perfil** (resumo):

| Módulo / ação        | Admin | Atendente | Técnico | Estoquista | Cliente(token) |
|----------------------|:-----:|:---------:|:-------:|:----------:|:--------------:|
| Usuários/permissões  |  ✅   |     —     |    —    |     —      |       —        |
| Clientes/Veículos    |  ✅   |    ✅     |   👁    |     👁     |       —        |
| OS (criar/editar)    |  ✅   |    ✅     |   ⚙*    |     👁     |       —        |
| Diagnóstico/Kanban   |  ✅   |    👁     |   ✅    |     —      |       —        |
| Estoque/Compras/NF-e |  ✅   |    👁     |   👁    |     ✅     |       —        |
| Orçamento (aprovar)  |  ✅   |    ✅     |    —    |     —      |   ✅(próprio)  |
| Acompanhar OS        |  —    |     —     |    —    |     —      |   ✅(token)    |
| Configurações/IA/Site|  ✅   |     —     |    —    |     —      |       —        |

(⚙* técnico edita diagnóstico/status/itens técnicos, não dados cadastrais.)

- **Acompanhamento do cliente**: token opaco assinado por OS, sem login, escopo
  somente-leitura + ação de aprovar orçamento. Rate limit + expiração opcional.
- **Hardening**: Helmet, CORS restrito, rate limit (login e rotas públicas),
  validação Zod em todo input, sanitização de HTML (campos ricos do blog/site),
  uploads com validação de mime/extensão/tamanho e nomes randômicos, segredos de
  IA criptografados (AES-GCM com chave de ambiente), logs sem dados sensíveis.

---

## 8. Frontend — UX responsiva

Regra única de apresentação de listas (componente `ResponsiveList`):
- **Desktop**: TanStack Table — colunas completas, ordenação, filtros, busca,
  ações por linha, paginação, cabeçalho fixo.
- **Tablet**: menos colunas, filtros recolhidos, ações secundárias em menu.
- **Mobile**: cada linha vira **card** (título, status, metadados essenciais,
  ação principal; secundárias em menu kebab). Sem scroll horizontal, sem fonte/
  botão minúsculos.

Padrões visuais:
- Layout com sidebar colapsável + topbar (sino de notificações, busca, perfil).
- Dashboard e Central de ações com cards de prioridade e atalhos.
- OS com **capa + cards + timeline + resumo financeiro + ações** organizadas;
  relato/diagnóstico/observações empilhados verticalmente.
- Tema claro/escuro via CSS variables (shadcn).
- PWA instalável + push.

---

## 9. Integrações e serviços transversais

- **Storage adapter**: `StoragePort` → `LocalStorage` (dev) / `S3Storage` (R2/S3).
- **PDF**: serviço `PdfService` usa pdfkit. Logo: usa `logoPdfUrl` se houver,
  senão `logoUrl`; cabeçalho usa nome, endereço, telefones/e-mail da oficina e
  rodapé configurável em `SiteSettings.pdfFooterText`.
- **NF-e**: pipeline `upload (.xml/.zip) → parse → mapeamento → tela de conferência
  editável → confirmar (só cadastrar/atualizar OU + entrada de estoque)`.
- **Eventos de OS**: emitidos no domínio (`OsStatusChanged`, etc.) → listeners de
  mensageria (cria MessageLog/Notification). Canais reais (WhatsApp/email/SMS)
  via adapters plugáveis (no MVP: registra/loga; produção: conecta provider).
- **Notificações**: internas (sino + página) + Web Push; clicar no push marca lida.

---

## 10. Testes e qualidade

- **Unit (domínio)**: máquina de estados da OS, cálculo de totais, regras de
  estoque, mapeamento NF-e. Alta cobertura aqui — é onde mora o risco.
- **Integração (API)**: Supertest sobre módulos críticos (auth, OS, estoque).
- **E2E (web)**: Playwright nos fluxos-chave (login, criar OS, aprovar orçamento).
- **CI**: lint + typecheck + test em cada push (GitHub Actions sugerido).

---

## 11. Deploy

- **Dev**: `docker compose up -d` (postgres) + `pnpm dev` (gera Prisma, aplica migrations pendentes e sobe api+web via turbo).
- **Prod**: `docker-compose.prod.yml` (postgres, api, web, nginx). Nginx faz
  reverse proxy, TLS, serve estáticos e roteia `/api` → NestJS, resto → Next.
- **Migrations**: `prisma migrate deploy` no boot do container de api.
- **Backup**: script `pg_dump` agendado (cron) + retenção; documentado no README.

---

## 12. Roadmap por fases (entregas que rodam)

> Cada fase termina com algo executável e testável. OS priorizada conforme pedido.

**Fase 0 — Fundação** *(infra que tudo usa)*
- Monorepo (pnpm+turbo), tsconfig/eslint/prettier/husky.
- Docker Compose (postgres), `.env`, Prisma inicial, healthcheck.
- NestJS bootstrap (config, logger Pino, filtro global de erros, Zod pipe).
- Next.js bootstrap (Tailwind, shadcn, layout base, tema, PWA manifest).
- `packages/shared` com enums/DTOs base.
- README com todos os comandos exigidos.

**Fase 1 — Auth & Usuários & RBAC**
- Login/logout, JWT+refresh, guards, matriz de permissões, seed de admin.
- CRUD de funcionários, bloqueio/inativação, LoginAttempt, AuditLog base.
- Telas: login, lista/edição de usuários.

**Fase 2 — Cadastros base**
- CRUD Clientes + Veículos (com `ResponsiveList`, busca, filtros, paginação).
- Históricos vinculados. Categorias/Marcas.

**Fase 3 — OS núcleo** ⭐ *(profundidade aqui)*
- Máquina de estados + domínio + casos de uso (abrir, mudar status, add serviço/
  peça/combo, calcular totais, travas de edição, auditoria).
- Tela da OS (capa, cards, timeline, resumo financeiro, ações).
- Kanban técnico + registro de diagnóstico.

**Fase 4 — Serviços, Combos & Estoque**
- Catálogo de serviços + peças padrão; combos.
- CRUD de peças/insumos + movimentações + histórico. Integração com baixa na OS.

**Fase 5 — Orçamento, Acompanhamento do cliente & PDF**
- Orçamento na OS, aprovação total/parcial, link público, decisão registrada.
- Página pública `acompanhar/[token]`. Botão "Gerar PDF" + template profissional.

**Fase 6 — Compras & Importação NF-e**
- Pedidos de compra (manual + automático por falta de peça), recebimento → estoque.
- Importador XML/ZIP com tela de conferência editável.

**Fase 7 — Dashboard, Central de ações & Notificações**
- Dashboard (todos os indicadores), Central de ações, sino + push PWA.

**Fase 8 — Mensagens, Site público, Blog**
- Templates + variáveis + eventos automáticos. Site público (SEO) + painel admin.
- Header público com menu mobile, ações de WhatsApp/área restrita, endereço clicável
  para Google Maps/Waze no mobile e home responsiva com seções principais sempre
  visíveis, mesmo sem serviços/blog cadastrados.
  Blog CRUD.

**Fase 9 — Configurações, Auditoria (telas), IA, Relatórios**
- Área de configurações completa. Visualização de auditoria. Módulo IA
  (provider, chave criptografada, instruções, logs). Relatórios operacionais.

**Fase 10 — Hardening & Produção**
- Rate limits finos, testes e2e, docker-compose.prod + nginx, backup,
  documentação de deploy, otimizações de performance e PWA.

---

## 13. Decisões confirmadas (2026-06-10)

1. **Multi-tenant agora** — ✅ `tenantId` em todas as tabelas de negócio, tenant único no MVP.
2. **Gerenciador de pacotes** — ✅ **pnpm + workspaces** (scripts documentados com `pnpm ...`).
3. **WhatsApp/Email/SMS** — ✅ **adapter mock/log** plugável no MVP; provider real depois sem mexer no núcleo.
4. **Idioma** — ✅ **domínio em PT-BR** (OS, peça, orçamento), **infra/código técnico em EN**, UI em PT-BR.

## 14. Ambiente da máquina (verificado)

- Node v24.15.0 · npm 11.14.1 · pnpm 9.15.9 (instalado via npm global) · Docker 29.4.2 · git 2.45.1 (Windows).
### Melhorias recentes — OS, Kanban e produtividade

- **Timeline da OS**: a OS agora possui `ServiceOrderEvent`, registrando alterações de status, notas técnicas, checklist, fotos, eventos sistêmicos e visibilidade interna/pública. O endpoint `GET /api/service-orders/:id/timeline` retorna a linha do tempo operacional e o detalhe da OS também inclui `events`.
- **Notificações automáticas**: eventos relevantes da OS disparam notificações internas para atendimento/administração e mensagens automáticas por templates (`OS_OPENED`, `DIAGNOSIS_READY`, `QUOTE_SENT`, `QUOTE_APPROVED`, `OS_IN_EXECUTION`, `OS_READY`, `CUSTOMER_NOTIFIED`, `VEHICLE_DELIVERED`). O seed cria templates WhatsApp simulados com `autoSend` ativo.
- **Modo técnico mobile**: o detalhe da OS possui painel para o técnico registrar checklist, observações e fotos. Fotos usam o endpoint seguro `/uploads`; atualizações podem ser marcadas como públicas para aparecerem na consulta do cliente.
- **Kanban com drag-and-drop**: além dos botões rápidos, o card pode ser arrastado para outra coluna quando existir transição rápida válida. Cancelamento continua oculto no Kanban.
- **Dashboard de produtividade**: novo endpoint `GET /api/dashboard/productivity` calcula ciclo médio, tempo médio por etapa e produtividade por técnico nos últimos 30 dias.


## Central de Pré-atendimento

Os contatos recebidos pelo site público entram na Central de Pré-atendimento (`/leads`) antes de serem convertidos em cliente, veículo e OS. O objetivo é evitar cadastros duplicados e erros operacionais com placa/cliente.

Fluxo implementado:

1. o formulário público registra nome, telefone, e-mail, placa, veículo informado e mensagem;
2. o backend procura clientes por nome, telefone, WhatsApp e e-mail;
3. o backend procura veículo pela placa normalizada;
4. a tela mostra alerta verde quando cliente e veículo conferem, amarelo quando a placa existe para outro cliente e cinza quando não há dados suficientes;
5. o atendente pode vincular cliente existente, vincular veículo existente, registrar contatos telefônicos/WhatsApp/e-mail e converter o lead em OS;
6. cada contato e ação relevante gera histórico próprio do pré-atendimento.

Principais tabelas:

- `leads`: dados originais do site, status de triagem, vínculos sugeridos/convertidos e alerta de conferência;
- `lead_contact_attempts`: tentativas de contato, canal, resultado, observação e data de retorno;
- `lead_events`: timeline operacional do pré-atendimento.

Endpoints principais:

- `GET /api/leads`
- `GET /api/leads/:id`
- `POST /api/leads/:id/status`
- `POST /api/leads/:id/contact-attempts`
- `POST /api/leads/:id/link-customer`
- `POST /api/leads/:id/link-vehicle`
- `POST /api/leads/:id/convert-to-os`
