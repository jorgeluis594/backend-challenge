#!/usr/bin/env bash
# Builds and starts the stack under a compose project and host ports derived from this
# worktree's path, runs tests/api against it and tears it down.
set -euo pipefail

worktree_hash=$(printf '%s' "$PWD" | cksum | cut -d ' ' -f 1)
port_offset=$((worktree_hash % 1000))
export API_PORT=$((13000 + port_offset))
export PROVIDER_PORT=$((14000 + port_offset))

compose=(docker compose -p "clinicsay-$worktree_hash" -f docker-compose.yml -f docker-compose.test.yml)
trap '"${compose[@]}" down --volumes' EXIT

"${compose[@]}" up --build --detach --wait
API_URL="http://localhost:$API_PORT" PROVIDER_URL="http://localhost:$PROVIDER_PORT" npx vitest run tests/api
