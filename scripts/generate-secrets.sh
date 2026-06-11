#!/usr/bin/env sh
set -eu

if ! command -v openssl >/dev/null 2>&1; then
  echo "Erro: openssl nao encontrado." >&2
  exit 1
fi

cat <<SECRETS
# Copie estes valores para o .env de producao:
JWT_ACCESS_SECRET=$(openssl rand -base64 48 | tr -d '\n')
JWT_REFRESH_SECRET=$(openssl rand -base64 48 | tr -d '\n')
ENCRYPTION_KEY=$(openssl rand -hex 32)
SECRETS
