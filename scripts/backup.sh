#!/usr/bin/env sh
set -eu

COMPOSE_FILE=${COMPOSE_FILE:-docker-compose.prod.yml}
RETENTION=${BACKUP_RETENTION:-14}
BACKUP_DIR=${BACKUP_DIR:-backups}
ENV_FILE=${ENV_FILE:-.env}

if [ -f "$ENV_FILE" ]; then
  set -a
  # shellcheck disable=SC1090
  . "$ENV_FILE"
  set +a
fi

: "${POSTGRES_USER:?POSTGRES_USER nao definido}"
: "${POSTGRES_DB:?POSTGRES_DB nao definido}"

mkdir -p "$BACKUP_DIR"
STAMP=$(date +%Y%m%d_%H%M%S)
OUT="$BACKUP_DIR/oficina_${STAMP}.sql.gz"

docker compose -f "$COMPOSE_FILE" exec -T postgres \
  pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB" | gzip > "$OUT"

# Mantem apenas os backups mais recentes.
find "$BACKUP_DIR" -name 'oficina_*.sql.gz' -type f | sort -r | awk "NR>${RETENTION}" | xargs -r rm -f

echo "Backup criado: $OUT"
