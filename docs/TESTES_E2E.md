# Testes E2E

Os testes E2E da API sobem a aplicação NestJS real, usam PostgreSQL real e truncam as tabelas entre cenários. Por segurança, eles exigem que `DATABASE_URL` aponte para um banco claramente descartável, como `oficina_test`.

O banco de desenvolvimento local usa a porta `5433` no `.env.example`. O banco de teste local usa a porta `5434` por padrão em `docker-compose.test.yml`, evitando conflito quando os dois ambientes existem na mesma máquina.

## Subir banco de teste local

### Windows PowerShell

```powershell
docker compose -f docker-compose.test.yml up -d
```

### Linux/macOS/Git Bash

```bash
docker compose -f docker-compose.test.yml up -d
```

## Preparar schema

### Windows PowerShell

```powershell
$env:DATABASE_URL="postgresql://oficina:oficina_test_pwd@localhost:5434/oficina_test?schema=public"
corepack enable
corepack prepare pnpm@9.15.9 --activate
pnpm install --frozen-lockfile
pnpm prisma:validate
pnpm prisma:generate
pnpm prisma:deploy
```

> O script `pnpm --filter @oficina/api test:e2e` também executa `prisma migrate deploy` automaticamente antes do Jest. O comando acima continua útil para validar o schema manualmente ou preparar o banco antes de uma depuração.

### Linux/macOS/Git Bash

```bash
export DATABASE_URL="postgresql://oficina:oficina_test_pwd@localhost:5434/oficina_test?schema=public"
corepack enable
corepack prepare pnpm@9.15.9 --activate
pnpm install --frozen-lockfile
pnpm prisma:validate
pnpm prisma:generate
pnpm prisma:deploy
```

> O script `pnpm --filter @oficina/api test:e2e` também executa `prisma migrate deploy` automaticamente antes do Jest. O comando acima continua útil para validar o schema manualmente ou preparar o banco antes de uma depuração.

## Rodar E2E da API

### Windows PowerShell

```powershell
$env:DATABASE_URL="postgresql://oficina:oficina_test_pwd@localhost:5434/oficina_test?schema=public"
pnpm --filter @oficina/api test:e2e
```

### Linux/macOS/Git Bash

```bash
export DATABASE_URL="postgresql://oficina:oficina_test_pwd@localhost:5434/oficina_test?schema=public"
pnpm --filter @oficina/api test:e2e
```

## Limpar variável de ambiente antes do desenvolvimento

No PowerShell, a variável definida com `$env:DATABASE_URL=...` continua ativa na sessão. Antes de rodar `pnpm dev`, limpe a variável para o projeto voltar a usar o `.env` normal.

```powershell
Remove-Item Env:DATABASE_URL
echo $env:DATABASE_URL
```

Depois suba o ambiente de desenvolvimento normalmente:

```powershell
docker compose up -d
pnpm prisma:generate
pnpm prisma:deploy
pnpm dev
```

## Resetar o banco de teste

Use quando precisar apagar todo o banco descartável dos E2E.

```powershell
docker compose -f docker-compose.test.yml down -v
docker compose -f docker-compose.test.yml up -d
```

## Resetar o banco local de desenvolvimento

Use somente se puder apagar os dados locais de desenvolvimento.

```powershell
docker compose down -v
docker compose up -d
```

## Erro P1000 Authentication failed

Se ocorrer `P1000 Authentication failed`, verifique primeiro se `DATABASE_URL` da sessão está sobrescrevendo o `.env`:

```powershell
echo $env:DATABASE_URL
```

Se estiver apontando para o banco de teste, limpe:

```powershell
Remove-Item Env:DATABASE_URL
```

Se a variável estiver correta, o volume Docker pode ter sido criado com senha antiga. Nesse caso, resete o banco correspondente conforme as seções acima.

## Cobertura atual

A suíte cobre:

- health check com banco;
- login inválido, login válido, usuário inativo, refresh token com rotação, logout e `/auth/me`;
- bloqueio de rotas sem autenticação;
- RBAC dos perfis ADMIN, TECNICO e ESTOQUISTA;
- isolamento multi-tenant entre oficinas;
- criação de cliente, veículo e OS;
- validações da máquina de estados da OS;
- diagnóstico técnico por permissão `os:diagnose`;
- geração de orçamento;
- aprovação pública de orçamento;
- falta de peça, reserva de estoque, geração de pedido de compra, recebimento parcial e total;
- baixa de estoque em execução;
- entrega da OS e bloqueio de edição após encerramento;
- site público por slug/header;
- lead público;
- upload seguro com bloqueio de SVG/MIME forjado e aceitação por assinatura real.
