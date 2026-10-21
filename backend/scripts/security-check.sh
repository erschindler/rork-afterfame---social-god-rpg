#!/usr/bin/env bash
# Authorization-boundary verification. Creates a throwaway "intruder" account and
# checks that private-world data is isolated and authoritative state is not writable.
# Usage: OWNER_TOKEN=<access token> WORLD_ID=<uuid> backend/scripts/security-check.sh
set -uo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
set -a; . "$ROOT/web-afterfame/.env"; set +a
U=$EXPO_PUBLIC_SUPABASE_URL; K=$EXPO_PUBLIC_SUPABASE_ANON_KEY; W=$WORLD_ID; T1=$OWNER_TOKEN
T2=$(curl -s -X POST "$U/auth/v1/signup" -H "apikey: $K" -H "Content-Type: application/json" \
  -d "{\"email\":\"intruder+$(date +%s)@afterfame.test\",\"password\":\"testpass123\"}" | python3 -c "import json,sys;print(json.load(sys.stdin)['access_token'])")
pass=0; fail=0
expect() { if echo "$2" | grep -q "$3"; then echo "PASS  $1"; pass=$((pass+1)); else echo "FAIL  $1 -> $2"; fail=$((fail+1)); fi; }
for t in posts worlds player_world_state notifications reputation_history simulated_accounts world_events; do
  expect "intruder cannot read $t" "$(curl -s "$U/rest/v1/$t?select=id&limit=1" -H "apikey: $K" -H "Authorization: Bearer $T2")" '^\[\]$'
done
expect "anon cannot read posts" "$(curl -s "$U/rest/v1/posts?select=id&limit=1" -H "apikey: $K" -H "Authorization: Bearer $K")" '^\[\]$'
expect "owner cannot edit own fame" "$(curl -s -X PATCH "$U/rest/v1/player_world_state?world_id=eq.$W" -H "apikey: $K" -H "Authorization: Bearer $T1" -H "Content-Type: application/json" -d '{"fame":100}')" "42501"
expect "owner cannot insert posts directly" "$(curl -s -X POST "$U/rest/v1/posts" -H "apikey: $K" -H "Authorization: Bearer $T1" -H "Content-Type: application/json" -d "{\"world_id\":\"$W\",\"author_type\":\"sim\",\"content\":\"x\"}")" "42501"
expect "owner cannot grant achievements" "$(curl -s -X POST "$U/rest/v1/player_achievements" -H "apikey: $K" -H "Authorization: Bearer $T1" -H "Content-Type: application/json" -d "{\"world_id\":\"$W\"}")" "42501"
expect "owner cannot follow-count hack" "$(curl -s -X POST "$U/rest/v1/follows" -H "apikey: $K" -H "Authorization: Bearer $T1" -H "Content-Type: application/json" -d "{\"world_id\":\"$W\"}")" "42501"
expect "app_secrets hidden" "$(curl -s "$U/rest/v1/app_secrets?select=*" -H "apikey: $K" -H "Authorization: Bearer $T1")" "42501"
expect "simulation_jobs hidden" "$(curl -s "$U/rest/v1/simulation_jobs?select=id" -H "apikey: $K" -H "Authorization: Bearer $T1")" "42501"
expect "counter RPC not callable" "$(curl -s -X POST "$U/rest/v1/rpc/adjust_post_counts" -H "apikey: $K" -H "Authorization: Bearer $T1" -H "Content-Type: application/json" -d '{"p":"00000000-0000-0000-0000-000000000000","d_like":1,"d_reply":0,"d_repost":0,"d_quote":0,"d_view":0}')" "42501"
expect "intruder blocked by edge function" "$(curl -s -X POST "$U/functions/v1/feed" -H "apikey: $K" -H "Authorization: Bearer $T2" -H "Content-Type: application/json" -d "{\"action\":\"home\",\"worldId\":\"$W\"}")" "forbidden"
expect "cron endpoint requires secret" "$(curl -s -X POST "$U/functions/v1/simulate" -H "apikey: $K" -H "Content-Type: application/json" -d '{}')" "unauthorized"
echo "$pass passed, $fail failed"
[ "$fail" -eq 0 ]
