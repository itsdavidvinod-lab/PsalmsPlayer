#!/usr/bin/env bash
# Starts the local Supabase stack, retrying once, and turns a failure into a readable annotation on the run.
set -uo pipefail
for attempt in 1 2; do
  if supabase start 2>&1 | tee start.log; then exit 0; fi
  echo "supabase start failed on attempt $attempt"
  msg=$(tail -c 3500 start.log | sed ':a;N;$!ba;s/%/%25/g;s/\r/%0D/g;s/\n/%0A/g')
  echo "::error title=supabase start failed (attempt $attempt)::$msg"
  supabase stop --no-backup >/dev/null 2>&1 || true
done
exit 1
