#!/usr/bin/env bash
# Runs the database security tests against the local Supabase stack and turns a failure into a readable annotation.
set -uo pipefail
URL="${1:-postgresql://postgres:postgres@127.0.0.1:54322/postgres}"
if psql "$URL" -v ON_ERROR_STOP=1 -q -f supabase/tests/security.test.sql >test.out 2>&1; then
  grep -c '^NOTICE:  ok' test.out | sed 's/^/passed blocks: /'
  exit 0
fi
msg=$(grep -E 'ERROR|CONTEXT|DETAIL|HINT|NOTICE:  ok' test.out | tail -n 12 | sed ':a;N;$!ba;s/%/%25/g;s/\r/%0D/g;s/\n/%0A/g')
echo "::error title=database security tests failed::$msg"
exit 1
