#!/usr/bin/env bash
# Smoke-test helper: call an edge function as the QA user.
# Usage: backend/scripts/api.sh <function> '<json body>'
# Requires /tmp/af_token (access token) and web-afterfame/.env for the anon key.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
set -a; . "$ROOT/web-afterfame/.env"; set +a
curl -s -m 58 -X POST "$EXPO_PUBLIC_SUPABASE_URL/functions/v1/$1" \
  -H "Authorization: Bearer $(cat /tmp/af_token)" \
  -H "apikey: $EXPO_PUBLIC_SUPABASE_ANON_KEY" \
  -H "Content-Type: application/json" \
  -d "$2"
