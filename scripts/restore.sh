#!/usr/bin/env sh
set -eu

COMPOSE_FILE=${COMPOSE_FILE:-docker-compose.prod.yml}
ENV_FILE=${ENV_FILE:-.env}
POSTGRES_SERVICE=${POSTGRES_SERVICE:-postgres}
UPLOADS_VOLUME=${UPLOADS_VOLUME:-oficina_uploads}
PROJECT_NAME=${COMPOSE_PROJECT_NAME:-oficina}
RESTORE_UPLOADS=${RESTORE_UPLOADS:-false}

if [ $# -lt 1 ]; then
  echo "Uso: $0 backups/oficina_db_AAAAMMDD_HHMMSS.sql.gz [backups/oficina_uploads_AAAAMMDD_HHMMSS.tar.gz]" >&2
  exit 1
fi

DB_BACKUP=$1
UPLOADS_BACKUP=${2:-}

if [ ! -f "$DB_BACKUP" ]; then
  echo "Arquivo de backup do banco nao encontrado: $DB_BACKUP" >&2
  exit 1
fi

if [ -f "$ENV_FILE" ]; then
  set -a
  # shellcheck disable=SC1090
  . "$ENV_FILE"
  set +a
fi

: "${POSTGRES_USER:?POSTGRES_USER nao definido}"
: "${POSTGRES_DB:?POSTGRES_DB nao definido}"

echo "ATENCAO: este restore vai substituir dados do banco $POSTGRES_DB."
echo "Defina CONFIRM_RESTORE=SIM para executar."

if [ "${CONFIRM_RESTORE:-}" != "SIM" ]; then
  echo "Restore cancelado." >&2
  exit 1
fi

cat "$DB_BACKUP" | gzip -dc | docker compose -f "$COMPOSE_FILE" exec -T "$POSTGRES_SERVICE" \
  psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -v ON_ERROR_STOP=1

echo "Banco restaurado a partir de: $DB_BACKUP"

if [ "$RESTORE_UPLOADS" = "true" ] && [ -n "$UPLOADS_BACKUP" ]; then
  if [ ! -f "$UPLOADS_BACKUP" ]; then
    echo "Arquivo de uploads nao encontrado: $UPLOADS_BACKUP" >&2
    exit 1
  fi
  RESOLVED_UPLOADS_VOLUME=$(docker volume ls --format '{{.Name}}' | grep -E "(^${PROJECT_NAME}_${UPLOADS_VOLUME}$|^${UPLOADS_VOLUME}$)" | head -n 1 || true)
  if [ -z "$RESOLVED_UPLOADS_VOLUME" ]; then
    echo "Volume de uploads nao encontrado." >&2
    exit 1
  fi
  docker run --rm \
    -v "$RESOLVED_UPLOADS_VOLUME:/data" \
    -v "$(pwd)/$(dirname "$UPLOADS_BACKUP"):/backup:ro" \
    alpine:3.20 \
    sh -c "rm -rf /data/* && cd /data && tar -xzf /backup/$(basename "$UPLOADS_BACKUP")"
  echo "Uploads restaurados a partir de: $UPLOADS_BACKUP"
fi

echo "Restore finalizado. Reinicie os containers se necessario."
