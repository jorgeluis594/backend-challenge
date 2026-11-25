#!/bin/sh
# Runs one reminder pass. The `cron` service of docker-compose.prod.yml calls it every minute.
# Exits non-zero when the API does not answer 2xx.
set -eu

url="${API_URL:-http://localhost:3000}/jobs/reminders/run"
if ! wget -q -O - --post-data='' "$url"; then
  echo "reminder pass failed: $url" >&2
  exit 1
fi
echo
