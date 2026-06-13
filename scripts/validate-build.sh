#!/usr/bin/env bash
set -euo pipefail

unset DATABASE_URL
rm -rf apps/web/.next

echo 'Validando Prisma e build completo local...'
pnpm prisma:validate
pnpm prisma:generate
pnpm --filter @oficina/shared build
pnpm --filter @oficina/api typecheck
pnpm --filter @oficina/web typecheck
pnpm build

if [[ "${1:-}" == "--e2e" ]]; then
  echo 'Subindo banco E2E e executando testes da API...'
  docker compose -f docker-compose.test.yml up -d
  export DATABASE_URL='postgresql://oficina:oficina_test_pwd@localhost:5434/oficina_test?schema=public'
  pnpm prisma:deploy
  pnpm --filter @oficina/api test:e2e
  unset DATABASE_URL
fi
