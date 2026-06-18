#!/usr/bin/env sh
set -eu

# E2E de backup/restore em ambiente descartável: sobe um Postgres efêmero,
# cria dados, faz o dump (pg_dump --clean --if-exists) e restaura POR CIMA do
# banco já populado (ON_ERROR_STOP=1), provando que o restore funciona em banco
# existente e reproduz o snapshot. Não depende do stack de produção.

PG_IMAGE=${PG_IMAGE:-postgres:16-alpine}
CTN=${CTN:-oficina_backup_test}
PORT=${PORT:-5441}
PGUSER=oficina
PGPASS=oficina_backup_test_pwd
PGDB=oficina_backup_test
WORKDIR=$(mktemp -d)
DUMP="$WORKDIR/dump.sql.gz"

cleanup() {
  docker rm -f "$CTN" >/dev/null 2>&1 || true
  rm -rf "$WORKDIR"
}
trap cleanup EXIT INT TERM

echo "== Subindo Postgres efêmero ($PG_IMAGE) =="
docker rm -f "$CTN" >/dev/null 2>&1 || true
docker run -d --name "$CTN" \
  -e POSTGRES_USER="$PGUSER" -e POSTGRES_PASSWORD="$PGPASS" -e POSTGRES_DB="$PGDB" \
  -p "$PORT:5432" "$PG_IMAGE" >/dev/null

psql() { docker exec -i "$CTN" psql -U "$PGUSER" -d "$PGDB" "$@"; }

echo "== Aguardando o banco aceitar conexões (db + usuário prontos) =="
# pg_isready pode dizer "pronto" antes do init criar o DB/usuário; então
# esperamos um SELECT real conectar no banco/usuário alvo.
i=0
until psql -c 'SELECT 1' >/dev/null 2>&1; do
  i=$((i + 1))
  if [ "$i" -gt 60 ]; then
    echo "ERRO: Postgres não ficou pronto." >&2
    docker logs "$CTN" 2>&1 | tail -n 20 >&2 || true
    exit 1
  fi
  sleep 1
done

echo "== Criando dados =="
psql -v ON_ERROR_STOP=1 -c "CREATE TABLE clientes (id int PRIMARY KEY, nome text);"
psql -v ON_ERROR_STOP=1 -c "INSERT INTO clientes VALUES (1, 'Oficina Modelo');"

echo "== Backup (pg_dump --clean --if-exists) =="
docker exec "$CTN" pg_dump --clean --if-exists -U "$PGUSER" "$PGDB" | gzip >"$DUMP"
[ -s "$DUMP" ] || {
  echo "ERRO: dump vazio." >&2
  exit 1
}

echo "== Altera dados (sujeira que o restore deve sobrescrever) =="
psql -v ON_ERROR_STOP=1 -c "INSERT INTO clientes VALUES (2, 'Lixo temporário');"
psql -v ON_ERROR_STOP=1 -c "UPDATE clientes SET nome='alterado' WHERE id=1;"

echo "== Restore POR CIMA do banco existente (ON_ERROR_STOP=1) =="
gzip -dc "$DUMP" | psql -v ON_ERROR_STOP=1 >/dev/null

echo "== Verificações =="
COUNT=$(psql -tAc "SELECT count(*) FROM clientes;")
NAME=$(psql -tAc "SELECT nome FROM clientes WHERE id=1;")
if [ "$COUNT" != "1" ]; then
  echo "FALHA: esperado 1 linha após restore, veio '$COUNT'." >&2
  exit 1
fi
if [ "$NAME" != "Oficina Modelo" ]; then
  echo "FALHA: nome restaurado '$NAME' != 'Oficina Modelo'." >&2
  exit 1
fi

echo "OK: restore em banco existente reproduziu o snapshot (1 linha, dados originais)."
