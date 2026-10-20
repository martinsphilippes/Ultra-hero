#!/usr/bin/env bash
# Sobe um Postgres local (cluster 16/main) e recria o banco ultra_hero_local com
# shim do Supabase + todas as migrations em ordem. Uso: scripts/db/local-reset.sh
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
DB="${LOCAL_DB_NAME:-ultra_hero_local}"
PSQL="psql -v ON_ERROR_STOP=1 -q"
run_as_pg() { if [ "$(id -u)" = "0" ]; then su postgres -c "$1"; else bash -c "$1"; fi; }

pg_lsclusters | grep -q "16 *main.*online" || pg_ctlcluster 16 main start
run_as_pg "psql -qc \"drop database if exists $DB\""
run_as_pg "psql -qc \"create database $DB\""
# mesmo search_path padrão da Supabase (extensões como citext ficam em "extensions")
run_as_pg "psql -qc \"alter database $DB set search_path = public, extensions\""
run_as_pg "$PSQL -d $DB -f $ROOT/supabase/local/shim_supabase.sql"
for f in "$ROOT"/supabase/migrations/*.sql; do
  echo "==> $(basename "$f")"
  run_as_pg "$PSQL -d $DB -f $f"
done
echo "OK: banco $DB pronto (porta 5432)."
