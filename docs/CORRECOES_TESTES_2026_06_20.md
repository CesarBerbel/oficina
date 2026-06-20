# Testes adicionados — 2026-06-20

Este pacote adiciona testes para as funcionalidades implementadas na correção anterior, sem alterar migrations nem regras de negócio.

## Coberturas novas

### Orçamento

Arquivo: `apps/api/test/quote-discount-public-token.e2e-spec.ts`

- geração de orçamento com desconto percentual por item;
- persistência de `discountPercent` e `discountAmount` nos itens do orçamento;
- recálculo de `totalServices`, `totalParts` e `total` considerando descontos por item;
- exposição dos descontos no endpoint público de acompanhamento;
- aprovação parcial recalculando a OS somente com os itens aprovados;
- rejeição de desconto acima de 100%;
- rejeição de desconto para item inexistente;
- bloqueio de acompanhamento e decisão pública quando o token expirou.

### Login multi-filial e reset de senha

Arquivo: `apps/api/test/host-login.e2e-spec.ts`

- login em conta com múltiplas filiais e mesmo e-mail em mais de uma filial;
- login padrão pela filial resolvida pelo host;
- login explícito por `tenantSlug` da filial;
- link de recuperação de senha usando o domínio confiável da requisição.

### Quotas SaaS

Arquivo: `apps/api/test/saas-domains-quotas.e2e-spec.ts`

- quota mensal de OS sem criar registro extra quando o limite estoura;
- quota real de armazenamento `STORAGE_MB` antes de persistir upload;
- quota mensal de uploads com contador transacional;
- verificação de uso em `/api/billing/usage` após bloqueios.

### Testes unitários e estáticos

Arquivos:

- `apps/api/src/common/utils/public-token.spec.ts`;
- `apps/api/src/modules/quotes/quote.schema.spec.ts`;
- `apps/api/src/infra/config/deployment-security.spec.ts`.

Coberturas:

- TTL padrão e override de expiração de token público;
- schema `generateQuoteSchema` com `itemDiscounts`;
- Caddyfile parametrizado por `PLATFORM_BASE_DOMAIN`;
- lint do build Docker web habilitado por padrão;
- headers básicos de segurança no `next.config.mjs`.

## Como rodar

### Testes unitários da API

```powershell
pnpm --filter @oficina/api test
```

### E2E da API

```powershell
$env:DATABASE_URL="postgresql://oficina:oficina_test_pwd@localhost:5434/oficina_test?schema=public"
docker compose -f docker-compose.test.yml down -v
docker compose -f docker-compose.test.yml up -d
pnpm prisma:deploy
pnpm --filter @oficina/api test:e2e
Remove-Item Env:DATABASE_URL
```

### Validação completa recomendada

```powershell
corepack enable
pnpm install --frozen-lockfile
pnpm prisma:generate
pnpm prisma:validate
pnpm lint
pnpm typecheck
pnpm build
pnpm --filter @oficina/api test
$env:DATABASE_URL="postgresql://oficina:oficina_test_pwd@localhost:5434/oficina_test?schema=public"
docker compose -f docker-compose.test.yml down -v
docker compose -f docker-compose.test.yml up -d
pnpm prisma:deploy
pnpm --filter @oficina/api test:e2e
Remove-Item Env:DATABASE_URL
```

## Observação

Não houve migration Prisma nova nesta etapa. Os testes assumem a migration já existente de desconto por item e expiração de token público.
