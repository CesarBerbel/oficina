# Prompt de continuidade — Sistema de Gestão para Oficina Mecânica

> Cole este prompt em uma nova sessão para continuar o desenvolvimento.
> Ele resume o que existe, as convenções e o que falta.

---

## Contexto

Estou desenvolvendo um **sistema completo de gestão para oficina mecânica**
(substituto moderno do "MotorMind"), já com 10 fases entregues. O código está em
`C:\claude\oficina` (Windows, sem git inicializado). Quero que você continue a
partir do estado atual, mantendo a arquitetura e os padrões existentes.

### Stack
- **Monorepo** pnpm workspaces + Turborepo: `apps/api` (NestJS 10), `apps/web`
  (Next.js 15 App Router), `packages/shared` (tipos/enums/schemas Zod/RBAC).
- **Backend**: NestJS + Prisma + PostgreSQL 16. Auth JWT (access + refresh
  httpOnly) com RBAC por perfil. Validação Zod (mesmos schemas no front).
- **Frontend**: Next.js + TypeScript + Tailwind + shadcn/ui + TanStack Query.
- **Multi-tenant**: todas as tabelas têm `tenantId`. O **login já é por oficina**
  (campo "Oficina" = `slug` do tenant + e-mail + senha); falta o fluxo de cadastro
  de novas oficinas e resolução por domínio para virar SaaS completo.
- **Deploy**: Docker + Docker Compose + Nginx, com proxy de `/api` e `/uploads` para a API.

### Ambiente (importante)
- Node 24, pnpm 9.15.9 (instalado via npm global), Docker Desktop.
- **Postgres dev na porta 5433** (host) para não colidir com um Postgres 18
  nativo na 5432. `.env` na raiz é a fonte única (usado por compose, Prisma e Nest).
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
4. **OS (núcleo)**: máquina de estados pura e testada, itens com snapshot de preço,
   totais automáticos, travas de edição, timeline, **Kanban técnico**. Tela da OS rica.
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
   por evento** (adapter mock/log), site público com SEO + painel, blog, **leads** do site.
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
- **IA**: configuração + geração de texto/artigo prontas; faltam **logs de uso** e
  instruções específicas por campo/módulo (hoje há instrução global).
- **Aprovação parcial do orçamento**: registra as decisões por item, mas a **remoção
  automática** dos itens recusados na OS é manual (estorno de estoque já existe).
- **Logo no PDF**: embute PNG/JPEG; SVG/WebP não são suportados pelo pdfkit. O texto de rodapé do PDF é configurável em Site público.

### Hardening/produção a finalizar
- **TLS/HTTPS** no Nginx (hoje só porta 80) + `AUTH_COOKIE_SECURE=true`.
- **Cobertura de testes** maior (mais unit/integração; rodar Playwright de fato —
  precisa `playwright install`).
- **Storage S3/R2** em produção para escala/HA; hoje o deploy usa volume Docker persistente `oficina_uploads`.
- Seed de produção é manual (`prisma db seed` no container) — ok, documentado.

### Melhorias sugeridas
- Edição inline de quantidade dos itens da OS reajustando estoque.
- Vincular pedido de compra a uma OS específica (modelo já permite `osId`).
- Relatórios com filtro por período e export (CSV/PDF).
- Multi-oficina (SaaS): o **login já é por slug de oficina**; falta o **cadastro/
  onboarding de novas oficinas**, a **resolução automática por domínio/subdomínio**
  e a UI de gestão de tenants (o `tenantId` já está em todas as tabelas).
- Otimizar imagens Docker (hoje copiam node_modules cheio).

---

## Como rodar e testar
```bash
cd C:\claude\oficina
docker compose up -d            # Postgres (porta 5433)
corepack enable
corepack prepare pnpm@9.15.9 --activate
pnpm install --frozen-lockfile
pnpm prisma:migrate             # da raiz
pnpm prisma:seed                # cria oficina "oficina-modelo" + admin
pnpm dev                        # gera Prisma, aplica migrations pendentes, API :3333/api + Web :3000
# Login: Oficina = oficina-modelo · admin@oficina.local / Admin@123
pnpm test                       # unit/API + testes configurados
pnpm --filter @oficina/api test:e2e   # e2e backend (6)
# Produção:
docker compose -f docker-compose.prod.yml up -d --build
```

Documentos de referência: `docs/ARQUITETURA.md` (arquitetura/roadmap) e
`docs/DEPLOY.md` (deploy).
