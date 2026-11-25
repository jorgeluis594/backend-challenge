#!/bin/sh
# Runs one reminder pass. The `cron` service of docker-compose.prod.yml calls it every minute.
# Exits non-zero when the API does not answer 2xx within the timeout, so an API that hangs
# cannot hang the loop that calls this script.
set -eu

TIMEOUT_SECONDS=50
url="${API_URL:-http://localhost:3000}/jobs/reminders/run"
if ! wget -q -T "$TIMEOUT_SECONDS" -O - --post-data='' "$url"; then
  echo "reminder pass failed: $url" >&2
  exit 1
fi
echo
