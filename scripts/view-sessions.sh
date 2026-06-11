#!/usr/bin/env bash
# Inspect Claude Code session logs.
# Usage:
#   scripts/view-sessions.sh                   # list sessions w/ counts
#   scripts/view-sessions.sh <session_id>      # dump a session (pretty)
#   scripts/view-sessions.sh --global          # tail global stream
#   scripts/view-sessions.sh --since 1h        # filter global by relative time
set -euo pipefail

LOG_DIR="${CLAUDE_PROJECT_DIR:-$(pwd)}/logs/sessions"
mkdir -p "$LOG_DIR"

if ! command -v jq >/dev/null 2>&1; then
  echo "error: jq required" >&2
  exit 1
fi

case "${1:-list}" in
  list)
    printf "%-10s %-10s %-22s %-22s %s\n" "TURNS" "TOOLS" "FIRST" "LAST" "SESSION"
    for f in "$LOG_DIR"/*.jsonl; do
      [ -f "$f" ] || continue
      name="$(basename "$f" .jsonl)"
      [ "$name" = "_global" ] && continue
      [[ "$name" == *.transcript ]] && continue
      turns="$(jq -r 'select(.event=="prompt") | .ts' "$f" 2>/dev/null | wc -l | tr -d ' ')"
      tools="$(jq -r 'select(.event=="tool") | .tool_name // ""' "$f" 2>/dev/null | wc -l | tr -d ' ')"
      first="$(jq -r 'select(.ts) | .ts' "$f" 2>/dev/null | head -n1)"
      last="$(jq -r 'select(.ts) | .ts' "$f" 2>/dev/null | tail -n1)"
      printf "%-10s %-10s %-22s %-22s %s\n" "$turns" "$tools" "${first:0:19}" "${last:0:19}" "$name"
    done
    ;;
  --global)
    tail -n 80 "$LOG_DIR/_global.jsonl" 2>/dev/null | jq -C '.'
    ;;
  --since)
    SINCE="${2:-1h}"
    # Convert relative time to epoch
    case "$SINCE" in
      *h) HOURS="${SINCE%h}"; CUTOFF=$(date -u -v-"${HOURS}"H +"%Y-%m-%dT%H:%M:%SZ" 2>/dev/null || date -u -d "${HOURS} hours ago" +"%Y-%m-%dT%H:%M:%SZ") ;;
      *d) DAYS="${SINCE%d}"; CUTOFF=$(date -u -v-"${DAYS}"d +"%Y-%m-%dT%H:%M:%SZ" 2>/dev/null || date -u -d "${DAYS} days ago" +"%Y-%m-%dT%H:%M:%SZ") ;;
      *) echo "usage: --since <Nh|Nd>"; exit 1 ;;
    esac
    jq -c --arg cutoff "$CUTOFF" 'select(.ts >= $cutoff)' "$LOG_DIR/_global.jsonl"
    ;;
  *)
    SID="$1"
    F="$LOG_DIR/${SID}.jsonl"
    if [ ! -f "$F" ]; then
      echo "no log for session: $SID" >&2
      exit 1
    fi
    jq -C '.' "$F"
    ;;
esac
