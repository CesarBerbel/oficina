#!/usr/bin/env sh
set -eu

COMPOSE_FILE=${COMPOSE_FILE:-docker-compose.prod.yml}
RETENTION=${BACKUP_RETENTION:-14}
BACKUP_DIR=${BACKUP_DIR:-backups}
ENV_FILE=${ENV_FILE:-.env}
INCLUDE_UPLOADS=${BACKUP_INCLUDE_UPLOADS:-true}
POSTGRES_SERVICE=${POSTGRES_SERVICE:-postgres}
UPLOADS_VOLUME=${UPLOADS_VOLUME:-oficina_uploads}
PROJECT_NAME=${COMPOSE_PROJECT_NAME:-oficina}

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
DB_OUT="$BACKUP_DIR/oficina_db_${STAMP}.sql.gz"
UPLOADS_OUT="$BACKUP_DIR/oficina_uploads_${STAMP}.tar.gz"
MANIFEST_OUT="$BACKUP_DIR/oficina_backup_${STAMP}.txt"

echo "Iniciando backup em $STAMP"

docker compose -f "$COMPOSE_FILE" exec -T "$POSTGRES_SERVICE" \
  pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB" | gzip > "$DB_OUT"

echo "Banco salvo em: $DB_OUT"

if [ "$INCLUDE_UPLOADS" = "true" ]; then
  RESOLVED_UPLOADS_VOLUME=$(docker volume ls --format '{{.Name}}' | grep -E "(^${PROJECT_NAME}_${UPLOADS_VOLUME}$|^${UPLOADS_VOLUME}$)" | head -n 1 || true)
  if [ -n "$RESOLVED_UPLOADS_VOLUME" ]; then
    docker run --rm \
      -v "$RESOLVED_UPLOADS_VOLUME:/data:ro" \
      -v "$(pwd)/$BACKUP_DIR:/backup" \
      alpine:3.20 \
      sh -c "cd /data && tar -czf /backup/$(basename "$UPLOADS_OUT") ."
    echo "Uploads salvos em: $UPLOADS_OUT"
  else
    echo "Volume de uploads nao encontrado. Pulei backup de uploads." >&2
  fi
fi

{
  echo "backup_at=$STAMP"
  echo "compose_file=$COMPOSE_FILE"
  echo "postgres_service=$POSTGRES_SERVICE"
  echo "postgres_db=$POSTGRES_DB"
  echo "database_file=$DB_OUT"
  echo "uploads_file=$UPLOADS_OUT"
  echo "retention=$RETENTION"
} > "$MANIFEST_OUT"

echo "Manifesto salvo em: $MANIFEST_OUT"

# Mantem apenas os backups mais recentes de cada tipo.
find "$BACKUP_DIR" -name 'oficina_db_*.sql.gz' -type f | sort -r | awk "NR>${RETENTION}" | xargs -r rm -f
find "$BACKUP_DIR" -name 'oficina_uploads_*.tar.gz' -type f | sort -r | awk "NR>${RETENTION}" | xargs -r rm -f
find "$BACKUP_DIR" -name 'oficina_backup_*.txt' -type f | sort -r | awk "NR>${RETENTION}" | xargs -r rm -f

echo "Backup finalizado com sucesso."
