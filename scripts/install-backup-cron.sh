#!/usr/bin/env sh
set -eu

PROJECT_DIR=${PROJECT_DIR:-$(pwd)}
CRON_TIME=${CRON_TIME:-"17 2 * * *"}
LOG_FILE=${LOG_FILE:-"$PROJECT_DIR/backups/backup.log"}

mkdir -p "$PROJECT_DIR/backups"

CRON_LINE="$CRON_TIME cd $PROJECT_DIR && /usr/bin/env sh scripts/backup.sh >> $LOG_FILE 2>&1"
TMP=$(mktemp)
crontab -l 2>/dev/null | grep -v "scripts/backup.sh" > "$TMP" || true
echo "$CRON_LINE" >> "$TMP"
crontab "$TMP"
rm -f "$TMP"

echo "Backup automatico instalado no cron:"
echo "$CRON_LINE"
