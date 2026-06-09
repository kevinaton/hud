#!/usr/bin/env bash
# Synthetic flood test for mcp-hud rate limiter.
#
# Fires 100 rapid cashflow.list calls at the tailnet endpoint.
# Expected: first 10 succeed (burst=10), remainder start returning 429.
# Run from operator's MacBook on the tailnet.
#
# Usage:
#   MCP_TOKEN=<token> ./scripts/flood-test-mcp.sh
#   MCP_TOKEN=<token> MCP_URL=https://hud.tail5e5324.ts.net ./scripts/flood-test-mcp.sh
#
# Requires: curl, jq (both standard on macOS)

set -euo pipefail

MCP_URL="${MCP_URL:-https://hud.tail5e5324.ts.net}"
MCP_TOKEN="${MCP_TOKEN:?MCP_TOKEN must be set}"
CALLS="${CALLS:-100}"

ENDPOINT="$MCP_URL/mcp"

PAYLOAD='{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"cashflow.list","arguments":{}}}'

ok_count=0
rate_limited_count=0
other_count=0
first_429_at=""
retry_after_seen=""

echo "Flood-testing $ENDPOINT with $CALLS calls..."
echo ""

for i in $(seq 1 "$CALLS"); do
  response=$(curl -s -w "\n%{http_code}" -X POST "$ENDPOINT" \
    -H "Authorization: Bearer $MCP_TOKEN" \
    -H "Content-Type: application/json" \
    -d "$PAYLOAD" 2>&1)

  http_code=$(echo "$response" | tail -1)
  body=$(echo "$response" | head -n -1)

  if [[ "$http_code" == "200" ]]; then
    ok_count=$((ok_count + 1))
  elif [[ "$http_code" == "429" ]]; then
    rate_limited_count=$((rate_limited_count + 1))
    if [[ -z "$first_429_at" ]]; then
      first_429_at="$i"
      # Capture Retry-After from a separate call with headers
      retry_after_seen=$(curl -s -I -X POST "$ENDPOINT" \
        -H "Authorization: Bearer $MCP_TOKEN" \
        -H "Content-Type: application/json" \
        -d "$PAYLOAD" 2>/dev/null | grep -i "retry-after" | tr -d '\r' || echo "(not captured)")
    fi
  else
    other_count=$((other_count + 1))
    echo "  call $i: unexpected HTTP $http_code — $body"
  fi

  # Brief status every 10 calls
  if (( i % 10 == 0 )); then
    echo "  after $i calls: ok=$ok_count 429=$rate_limited_count other=$other_count"
  fi
done

echo ""
echo "============================================================"
echo "Results for $CALLS calls:"
echo "  200 OK:       $ok_count"
echo "  429 Rate Ltd: $rate_limited_count"
echo "  Other:        $other_count"
echo ""
if [[ -n "$first_429_at" ]]; then
  echo "  First 429 at call: $first_429_at  (burst=10 expected ~10)"
  echo "  Retry-After header: $retry_after_seen"
  echo ""
  echo "PASS: rate limiter engaged after burst exhaustion."
else
  echo "FAIL: No 429 responses received — rate limiter may not be active."
fi
echo "============================================================"
