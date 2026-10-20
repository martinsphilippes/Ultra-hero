#!/usr/bin/env bash
# Roda os cenários de RLS/regras de negócio num banco local isolado (ultra_hero_test).
# Uso: npm run test:rls   (requer PostgreSQL 16 local; ver scripts/db/local-reset.sh)
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
export LOCAL_DB_NAME="${LOCAL_DB_NAME:-ultra_hero_test}"
"$ROOT/scripts/db/local-reset.sh" > /dev/null
run_as_pg() { if [ "$(id -u)" = "0" ]; then su postgres -c "$1"; else bash -c "$1"; fi; }
chmod -R o+rX "$ROOT/supabase" >/dev/null 2>&1 || true
OUT="$(run_as_pg "psql -v ON_ERROR_STOP=1 -q -d $LOCAL_DB_NAME -f $ROOT/supabase/tests/rls_scenarios.sql" 2>&1 | sed -n 's/^psql:.*NOTICE:  //p; s/^NOTICE:  //p; /ERROR/p; /FAIL/p')"
echo "$OUT"
PASS=$(echo "$OUT" | grep -c '^PASS' || true)
FAIL=$(echo "$OUT" | grep -c 'FAIL\|ERROR' || true)
echo "----"
echo "RLS scenarios: $PASS passed, $FAIL failed"
[ "$FAIL" = "0" ]
