#!/usr/bin/env bash
# Claude Code session logger — invoked by hooks.
# Reads hook JSON on stdin, appends one JSONL line to:
#   logs/sessions/<session_id>.jsonl   (per-session)
#   logs/sessions/_global.jsonl         (everything, every session)
# Argument $1: event tag (prompt | tool | stop | session-start | session-end | error).
#
# Idempotent · non-blocking · best-effort. Never fails the hook.
set -u

EVENT="${1:-unknown}"
PROJECT_DIR="${CLAUDE_PROJECT_DIR:-$(pwd)}"
LOG_DIR="${PROJECT_DIR}/logs/sessions"
mkdir -p "$LOG_DIR" 2>/dev/null || true

PAYLOAD="$(cat || echo '{}')"
[ -z "$PAYLOAD" ] && PAYLOAD='{}'

if MS="$(python3 -c 'import time,datetime; print(datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.")+f"{int((time.time()%1)*1000):03d}Z")' 2>/dev/null)"; then
  TS="$MS"
else
  TS="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
fi

if command -v jq >/dev/null 2>&1; then
  SESSION_ID="$(printf '%s' "$PAYLOAD" | jq -r '.session_id // "unknown"' 2>/dev/null || echo unknown)"
  ENRICHED="$(printf '%s' "$PAYLOAD" | jq -c --arg ev "$EVENT" --arg ts "$TS" '. + {event:$ev, ts:$ts}' 2>/dev/null)"
else
  SESSION_ID="unknown"
  ENRICHED="{\"event\":\"$EVENT\",\"ts\":\"$TS\",\"raw\":$(printf '%s' "$PAYLOAD" | python3 -c 'import json,sys; print(json.dumps(sys.stdin.read()))' 2>/dev/null || echo '"<unparsed>"')}"
fi

# Sanitize session id for filename (alphanumeric, dash, underscore only)
SAFE_ID="$(printf '%s' "$SESSION_ID" | tr -c '[:alnum:]_-' '_' | cut -c1-64)"
[ -z "$SAFE_ID" ] && SAFE_ID="unknown"

printf '%s\n' "$ENRICHED" >> "$LOG_DIR/${SAFE_ID}.jsonl"   2>/dev/null || true
printf '%s\n' "$ENRICHED" >> "$LOG_DIR/_global.jsonl"      2>/dev/null || true

# On session end, also copy the full Claude Code transcript if discoverable.
if [ "$EVENT" = "session-end" ]; then
  CC_HOME="$HOME/.claude/projects"
  if [ -d "$CC_HOME" ]; then
    # Find a transcript file matching this session_id under ~/.claude/projects/*/
    TRANSCRIPT="$(find "$CC_HOME" -type f -name "${SESSION_ID}.jsonl" 2>/dev/null | head -n1)"
    if [ -n "$TRANSCRIPT" ] && [ -f "$TRANSCRIPT" ]; then
      cp "$TRANSCRIPT" "$LOG_DIR/${SAFE_ID}.transcript.jsonl" 2>/dev/null || true
    fi
  fi
fi

exit 0
