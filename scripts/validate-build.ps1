param(
  [switch]$E2E
)

$ErrorActionPreference = 'Stop'

Remove-Item Env:DATABASE_URL -ErrorAction SilentlyContinue
Remove-Item -Recurse -Force apps\web\.next -ErrorAction SilentlyContinue

echo 'Validando Prisma e build completo local...'
pnpm prisma:validate
pnpm prisma:generate
pnpm --filter @oficina/shared build
pnpm --filter @oficina/api typecheck
pnpm --filter @oficina/web typecheck
pnpm build

if ($E2E) {
  echo 'Subindo banco E2E e executando testes da API...'
  docker compose -f docker-compose.test.yml up -d
  $env:DATABASE_URL='postgresql://oficina:oficina_test_pwd@localhost:5434/oficina_test?schema=public'
  pnpm prisma:deploy
  pnpm --filter @oficina/api test:e2e
  Remove-Item Env:DATABASE_URL -ErrorAction SilentlyContinue
}
