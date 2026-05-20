#!/usr/bin/env bash
#
# backup-db.sh — MySQL database backup for TrustMaker
#
# Reads DATABASE_URL from .env, dumps to backups/ with timestamped filenames.
# Rotates old backups, keeping the most recent $KEEP_COUNT.
#
# Usage:
#   ./scripts/backup-db.sh              # full dump, uncompressed
#   ./scripts/backup-db.sh --gzip       # full dump, gzipped
#   ./scripts/backup-db.sh --data-only  # schema only, no data
#   ./scripts/backup-db.sh --help       # show options
#
# Cron example (daily at 3am):
#   0 3 * * * /home/leo/Documentos/TrustMaker/backend/scripts/backup-db.sh --gzip >> /var/log/trustmaker-backup.log 2>&1

set -euo pipefail

# ── Config ──────────────────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
BACKUP_DIR="${PROJECT_DIR}/backups"
KEEP_COUNT=14
ENV_FILE="${PROJECT_DIR}/.env"
MYSQLDUMP_ARGS="--single-transaction --routines --triggers --events --no-tablespaces"

# ── Parse args ──────────────────────────────────────────────
USE_GZIP=false
for arg in "$@"; do
  case "$arg" in
    --gzip)       USE_GZIP=true ;;
    --data-only)  MYSQLDUMP_ARGS="$MYSQLDUMP_ARGS --no-data" ;;
    --help|-h)
      echo "Usage: $0 [--gzip] [--data-only]"
      echo ""
      echo "  --gzip       Compress output with gzip (.sql.gz)"
      echo "  --data-only  Dump schema only, no data"
      echo ""
      echo "Backups stored in: $BACKUP_DIR"
      echo "Keeping last $KEEP_COUNT backups."
      exit 0
      ;;
    *)
      echo "Unknown option: $arg" >&2
      exit 1
      ;;
  esac
done

# ── Source .env ─────────────────────────────────────────────
if [[ ! -f "$ENV_FILE" ]]; then
  echo "ERROR: .env not found at $ENV_FILE" >&2
  exit 1
fi
# shellcheck disable=SC2046
export $(grep -v '^#' "$ENV_FILE" | grep -v '^$' | xargs)

# ── Parse DATABASE_URL ──────────────────────────────────────
if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "ERROR: DATABASE_URL not set in .env" >&2
  exit 1
fi

DB_URL="${DATABASE_URL#mysql://}"
DB_USER="${DB_URL%%:*}"
DB_REST="${DB_URL#*:}"
DB_PASS="${DB_REST%%@*}"
DB_HOST_PORT="${DB_REST#*@}"
DB_HOST="${DB_HOST_PORT%%/*}"
DB_NAME="${DB_HOST_PORT#*/}"

if [[ "$DB_HOST" == *:* ]]; then
  DB_PORT="${DB_HOST##*:}"
  DB_HOST="${DB_HOST%:*}"
else
  DB_PORT=3306
fi

# Suppress "Using a password on the command line" warning
export MYSQL_PWD="$DB_PASS"

# ── Ensure backup directory ─────────────────────────────────
mkdir -p "$BACKUP_DIR"

# ── Build filename ──────────────────────────────────────────
TIMESTAMP="$(date +%Y%m%d_%H%M%S)"
if $USE_GZIP; then
  OUT_FILE="${BACKUP_DIR}/${DB_NAME}_${TIMESTAMP}.sql.gz"
else
  OUT_FILE="${BACKUP_DIR}/${DB_NAME}_${TIMESTAMP}.sql"
fi

# ── Dump ────────────────────────────────────────────────────
echo "==> Backing up $DB_NAME @ $DB_HOST:$DB_PORT → $OUT_FILE"

if $USE_GZIP; then
  mysqldump \
    -u "$DB_USER" \
    -h "$DB_HOST" \
    -P "$DB_PORT" \
    $MYSQLDUMP_ARGS \
    "$DB_NAME" | gzip > "$OUT_FILE"
else
  mysqldump \
    -u "$DB_USER" \
    -h "$DB_HOST" \
    -P "$DB_PORT" \
    $MYSQLDUMP_ARGS \
    "$DB_NAME" > "$OUT_FILE"
fi

# ── Verify ──────────────────────────────────────────────────
if [[ ! -s "$OUT_FILE" ]]; then
  echo "ERROR: Backup file is empty — dump failed." >&2
  rm -f "$OUT_FILE"
  exit 1
fi

BACKUP_SIZE="$(du -h "$OUT_FILE" | cut -f1)"
echo "==> Backup complete ($BACKUP_SIZE)"

# ── Rotate old backups ──────────────────────────────────────
PATTERN="*.sql"
$USE_GZIP && PATTERN="*.sql.gz"
BACKUP_COUNT="$(find "$BACKUP_DIR" -maxdepth 1 -name "$PATTERN" -type f | wc -l)"

if [[ "$BACKUP_COUNT" -gt "$KEEP_COUNT" ]]; then
  echo "==> Rotating: keeping $KEEP_COUNT, removing $((BACKUP_COUNT - KEEP_COUNT))"
  ls -1t "$BACKUP_DIR"/$PATTERN | tail -n +$((KEEP_COUNT + 1)) | xargs rm -f
fi

echo "==> Done"