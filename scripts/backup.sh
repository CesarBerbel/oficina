#!/usr/bin/env sh
set -eu

# Backup de produção: dump do banco (restaurável em banco existente via
# --clean --if-exists), arquivo dos uploads e um manifesto JSON. Os nomes
# casam com o esperado por restore.sh (oficina_db_* e oficina_uploads_*).

COMPOSE_FILE=${COMPOSE_FILE:-docker-compose.prod.yml}
RETENTION=${BACKUP_RETENTION:-14}
BACKUP_DIR=${BACKUP_DIR:-backups}
ENV_FILE=${ENV_FILE:-.env}
POSTGRES_SERVICE=${POSTGRES_SERVICE:-postgres}
UPLOADS_VOLUME=${UPLOADS_VOLUME:-oficina_uploads}
PROJECT_NAME=${COMPOSE_PROJECT_NAME:-oficina}

if [ -f "$ENV_FILE" ]; then
  set -a
  # O `.` do POSIX busca o arquivo no PATH quando o nome nao tem barra (sh=dash),
  # entao garantimos um caminho relativo  para carregar do diretorio atual.
  # shellcheck disable=SC1090
  case "$ENV_FILE" in
    */*) . "$ENV_FILE" ;;  
    *) . "./$ENV_FILE" ;;
  esac
  set +a
fi

: "${POSTGRES_USER:?POSTGRES_USER nao definido}"
: "${POSTGRES_DB:?POSTGRES_DB nao definido}"

mkdir -p "$BACKUP_DIR"
STAMP=$(date +%Y%m%d_%H%M%S)
DB_OUT="$BACKUP_DIR/oficina_db_${STAMP}.sql.gz"
UPLOADS_OUT="$BACKUP_DIR/oficina_uploads_${STAMP}.tar.gz"
MANIFEST_OUT="$BACKUP_DIR/oficina_manifest_${STAMP}.json"

# ── Banco ──────────────────────────────────────────────────────────────────
# --clean --if-exists: o dump remove os objetos antes de recriar, permitindo
# restaurar por cima de um banco já existente sem erro de "já existe".
docker compose -f "$COMPOSE_FILE" exec -T "$POSTGRES_SERVICE" \
  pg_dump --clean --if-exists -U "$POSTGRES_USER" "$POSTGRES_DB" | gzip >"$DB_OUT"
echo "Banco: $DB_OUT"

# ── Uploads (volume) ────────────────────────────────────────────────────────
RESOLVED_UPLOADS_VOLUME=$(docker volume ls --format '{{.Name}}' \
  | grep -E "(^${PROJECT_NAME}_${UPLOADS_VOLUME}$|^${UPLOADS_VOLUME}$)" | head -n 1 || true)
UPLOADS_INCLUDED=false
if [ -n "$RESOLVED_UPLOADS_VOLUME" ]; then
  docker run --rm \
    -v "$RESOLVED_UPLOADS_VOLUME:/data:ro" \
    -v "$(cd "$BACKUP_DIR" && pwd):/backup" \
    alpine:3.20 \
    sh -c "cd /data && tar -czf /backup/$(basename "$UPLOADS_OUT") ."
  UPLOADS_INCLUDED=true
  echo "Uploads: $UPLOADS_OUT"
else
  echo "AVISO: volume de uploads ($UPLOADS_VOLUME) nao encontrado; pulando." >&2
fi

# ── Manifesto ───────────────────────────────────────────────────────────────
size_of() { if [ -f "$1" ]; then wc -c <"$1" | tr -d ' '; else echo 0; fi; }
cat >"$MANIFEST_OUT" <<EOF
{
  "createdAt": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "stamp": "${STAMP}",
  "appVersion": "${APP_VERSION:-unknown}",
  "database": {
    "name": "${POSTGRES_DB}",
    "file": "$(basename "$DB_OUT")",
    "bytes": $(size_of "$DB_OUT"),
    "pgDumpFlags": "--clean --if-exists"
  },
  "uploads": {
    "included": ${UPLOADS_INCLUDED},
    "file": "$(basename "$UPLOADS_OUT")",
    "bytes": $(size_of "$UPLOADS_OUT")
  }
}
EOF
echo "Manifesto: $MANIFEST_OUT"

# ── Heartbeat (para métricas/alertas) ────────────────────────────────────────
# Grava o instante do último backup bem-sucedido. Best-effort: não falha o
# backup se o banco/tabela não estiver disponível.
docker compose -f "$COMPOSE_FILE" exec -T "$POSTGRES_SERVICE" \
  psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c \
  "INSERT INTO ops_heartbeat (key, at, note, \"updatedAt\") VALUES ('backup', now(), '${STAMP}', now()) ON CONFLICT (key) DO UPDATE SET at = EXCLUDED.at, note = EXCLUDED.note, \"updatedAt\" = now();" \
  >/dev/null 2>&1 && echo "Heartbeat de backup atualizado." \
  || echo "AVISO: nao foi possivel gravar o heartbeat de backup." >&2

# ── Retenção (por tipo) ─────────────────────────────────────────────────────
for prefix in oficina_db_ oficina_uploads_ oficina_manifest_; do
  find "$BACKUP_DIR" -name "${prefix}*" -type f | sort -r | awk "NR>${RETENTION}" | xargs -r rm -f
done

echo "Backup ${STAMP} concluido."
