#!/usr/bin/env bash
# Starts a throwaway local Postgres with the PRISM schema, for development and tests.
# Usage: scripts/local-db.sh [start|stop|reset]   ->  postgres://postgres@localhost:54329/prism
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DATA="${PRISM_PGDATA:-/tmp/prism-pgdata}"
PORT="${PRISM_PGPORT:-54329}"
BIN="$(dirname "$(command -v initdb || ls /usr/lib/postgresql/*/bin/initdb | tail -1)")"
as_pg() { if [ "$(id -u)" = 0 ]; then su postgres -c "$*"; else bash -c "$*"; fi; }

case "${1:-start}" in
  stop) as_pg "$BIN/pg_ctl -D $DATA stop -m fast" || true ;;
  reset) "$0" stop; rm -rf "$DATA"; "$0" start ;;
  start)
    if [ ! -d "$DATA" ]; then
      mkdir -p "$DATA"; [ "$(id -u)" = 0 ] && chown postgres "$DATA"
      as_pg "$BIN/initdb -D $DATA -A trust -U postgres >/dev/null"
    fi
    as_pg "$BIN/pg_ctl -D $DATA -o '-p $PORT -c max_connections=120 -c unix_socket_directories=/tmp' -l $DATA/log -w start" >/dev/null 2>&1 || true
    psql -h localhost -p "$PORT" -U postgres -tc "select 1 from pg_database where datname='prism'" | grep -q 1 \
      || psql -h localhost -p "$PORT" -U postgres -qc "create database prism"
    for f in "$ROOT"/supabase/migrations/*.sql; do
      PGOPTIONS='-c client_min_messages=warning' psql -h localhost -p "$PORT" -U postgres -d prism -q -v ON_ERROR_STOP=1 -f "$f" >/dev/null
    done
    echo "postgres://postgres@localhost:$PORT/prism"
    ;;
esac
