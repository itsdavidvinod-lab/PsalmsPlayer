#!/usr/bin/env bash
# Runs the migrations, the seed and the security tests on a throwaway database in plain Postgres.
#
#   With your own server:   PGURL=postgres://user:pass@localhost:5432/postgres ./supabase/tests/run.sh
#   Debian/Ubuntu as root:  ./supabase/tests/run.sh      (uses the local "main" cluster, starts it if needed)
#
# It creates a database called songbook_test and the roles anon / authenticated / service_role. Do not point it at
# a server whose roles you care about.
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
root="$(dirname "$here")"
DB=songbook_test

if [[ -n "${PGURL:-}" ]]; then
  base="${PGURL%/*}"
  run_sql()  { psql "$PGURL"      -v ON_ERROR_STOP=1 -q -f "$1"; }
  run_db()   { psql "$base/$DB"   -v ON_ERROR_STOP=1 -q -f "$1"; }
  sql_cmd()  { psql "$PGURL"      -v ON_ERROR_STOP=1 -q -c "$1" >/dev/null; }
else
  pg_lsclusters 2>/dev/null | grep -q online || pg_ctlcluster "$(ls /usr/lib/postgresql | sort -n | tail -1)" main start
  # feed files through stdin so the postgres OS user does not need access to this folder
  run_sql()  { su postgres -c "psql -v ON_ERROR_STOP=1 -q -d postgres" < "$1"; }
  run_db()   { su postgres -c "psql -v ON_ERROR_STOP=1 -q -d $DB" < "$1"; }
  sql_cmd()  { echo "$1" | su postgres -c "psql -v ON_ERROR_STOP=1 -q -d postgres" >/dev/null; }
fi

sql_cmd "drop database if exists $DB with (force)"
sql_cmd "create database $DB"
# roles are cluster-wide; drop leftovers from an earlier run so the bootstrap can recreate them
for r in anon authenticated service_role; do
  sql_cmd "do \$\$ begin if exists (select 1 from pg_roles where rolname = '$r') then execute 'drop role $r'; end if; end \$\$"
done

echo "== bootstrap (stand-in for Supabase auth)"; run_db "$here/bootstrap.sql"
for f in "$root"/migrations/*.sql; do echo "== $(basename "$f")"; run_db "$f"; done
echo "== seed";  run_db "$root/seed.sql"
echo "== tests"; run_db "$here/security.test.sql" >/dev/null   # progress is printed as NOTICE lines on stderr
echo "ALL DATABASE TESTS PASSED"
