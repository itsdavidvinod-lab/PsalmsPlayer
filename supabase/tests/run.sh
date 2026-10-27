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
sql_cmd "drop database if exists songbook_ref_test with (force)"  # left behind by the previous run; it holds objects owned by the roles below
sql_cmd "create database $DB"
# roles are cluster-wide; drop leftovers from an earlier run so the bootstrap can recreate them
for r in anon authenticated service_role; do
  sql_cmd "do \$\$ begin if exists (select 1 from pg_roles where rolname = '$r') then execute 'drop role $r'; end if; end \$\$"
done

echo "== bootstrap (stand-in for Supabase auth)"; run_db "$here/bootstrap.sql"
for f in "$root"/migrations/*.sql; do echo "== $(basename "$f")"; run_db "$f"; done
echo "== seed";  run_db "$root/seed.sql"
echo "== tests"; run_db "$here/security.test.sql" >/dev/null   # progress is printed as NOTICE lines on stderr

# reference.sql is what a real project gets instead of seed.sql. It must work on an empty project, be safe to run twice,
# hold no catalogue data, and offer exactly the lists the seed (and so every test) assumes.
echo "== reference.sql on an empty project"
REF=songbook_ref_test
sql_cmd "drop database if exists $REF with (force)"
sql_cmd "create database $REF"
run_in() {  # run_in <database> <file>
  if [[ -n "${PGURL:-}" ]]; then psql "${PGURL%/*}/$1" -v ON_ERROR_STOP=1 -q -f "$2"; else su postgres -c "psql -v ON_ERROR_STOP=1 -q -d $1" < "$2"; fi
}
scalar_in() {  # scalar_in <database> <query>
  if [[ -n "${PGURL:-}" ]]; then psql "${PGURL%/*}/$1" -At -v ON_ERROR_STOP=1 -c "$2"; else echo "$2" | su postgres -c "psql -At -v ON_ERROR_STOP=1 -d $1"; fi
}
tmp="$(mktemp -d)"
sed '/^create role/d' "$here/bootstrap.sql" > "$tmp/bootstrap.sql"   # the roles already exist: they are shared by the whole server
run_in "$REF" "$tmp/bootstrap.sql"
for f in "$root"/migrations/*.sql; do run_in "$REF" "$f" >/dev/null; done
run_in "$REF" "$root/reference.sql"
run_in "$REF" "$root/reference.sql"   # a second time: it must change nothing and fail on nothing
fingerprint="select md5(
  coalesce((select string_agg(code || name || coalesce(native_name, ''), ',' order by code) from public.languages), '') ||
  coalesce((select string_agg(code || name || country_code, ',' order by code) from public.regions), '') ||
  coalesce((select string_agg(kind || code || label, ',' order by kind, code) from public.tags), '')) || ' ' ||
  (select count(*) from public.languages) || '/' || (select count(*) from public.regions) || '/' || (select count(*) from public.tags)"
from_seed="$(scalar_in "$DB" "$fingerprint")"
from_reference="$(scalar_in "$REF" "$fingerprint")"
if [[ "$from_seed" != "$from_reference" ]]; then
  echo "reference.sql and seed.sql have drifted apart (seed: $from_seed, reference: $from_reference). Keep their lists identical." >&2
  exit 1
fi
leftover="$(scalar_in "$REF" "select (select count(*) from public.artists) + (select count(*) from public.songs) + (select count(*) from public.agreements) + (select count(*) from public.posters) + (select count(*) from public.requests) + (select count(*) from public.profiles)")"
if [[ "$leftover" != "0" ]]; then echo "reference.sql must not add artists, songs, agreements, posters, requests or users" >&2; exit 1; fi
rm -rf "$tmp"
echo "reference.sql OK (lists ${from_reference#* })"

echo "ALL DATABASE TESTS PASSED"
