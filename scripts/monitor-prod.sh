#!/usr/bin/env sh
set -eu

COMPOSE_FILE=${COMPOSE_FILE:-docker-compose.prod.yml}
# O Nginx do compose base publica em 127.0.0.1:18081 (atrás de um proxy/HTTPS
# externo). Se você expõe direto na 80/443, ajuste BASE_URL/API_HEALTH_URL/WEB_URL.
BASE_URL=${BASE_URL:-http://127.0.0.1:18081}
API_HEALTH_URL=${API_HEALTH_URL:-$BASE_URL/api/health/ready}
WEB_URL=${WEB_URL:-$BASE_URL/}
MIN_FREE_DISK_PERCENT=${MIN_FREE_DISK_PERCENT:-10}

echo "== Containers =="
docker compose -f "$COMPOSE_FILE" ps

echo "\n== Health API =="
if command -v curl >/dev/null 2>&1; then
  curl -fsS "$API_HEALTH_URL"
else
  wget -qO- "$API_HEALTH_URL"
fi

echo "\n\n== Health Web =="
if command -v curl >/dev/null 2>&1; then
  curl -fsS -I "$WEB_URL" | head -n 1
else
  wget -qS --spider "$WEB_URL" 2>&1 | head -n 5
fi

echo "\n== Disco =="
df -h .
FREE_PERCENT=$(df -P . | awk 'NR==2 {gsub(/%/, "", $5); print 100-$5}')
if [ "$FREE_PERCENT" -lt "$MIN_FREE_DISK_PERCENT" ]; then
  echo "ERRO: disco com apenas ${FREE_PERCENT}% livre." >&2
  exit 1
fi

echo "\nMonitoramento basico OK."
