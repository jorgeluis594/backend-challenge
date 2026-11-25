#!/usr/bin/env bash
# Runs one reminder pass. Meant for a cron job every minute in production:
#   * * * * * API_URL=https://api.example.com /path/to/scripts/run-reminder-pass.sh
# Exits non-zero when the API does not answer 2xx, so the scheduler records the failure.
set -euo pipefail

curl --fail --silent --show-error --max-time 50 -X POST "${API_URL:-http://localhost:3000}/jobs/reminders/run"
