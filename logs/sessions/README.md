# Claude Code session logs

Captured automatically by hooks in `.claude/settings.json`.

## Files

- `<session_id>.jsonl` — every event for one session
- `_global.jsonl` — append-only union of every event from every session
- `<session_id>.transcript.jsonl` — full Claude Code transcript copied at session end (best-effort)

## Event types

| event | source hook | payload includes |
|-------|-------------|------------------|
| `session-start` | SessionStart | `session_id`, `cwd`, env metadata |
| `prompt` | UserPromptSubmit | `session_id`, `prompt` (user message text) |
| `tool` | PostToolUse | `session_id`, `tool_name`, `tool_input`, `tool_response` |
| `stop` | Stop | `session_id`, end-of-turn marker |
| `session-end` | SessionEnd | `session_id`, end-of-session marker; triggers transcript copy |

Every line is enriched with `event` and `ts` (UTC ISO-8601, millisecond precision).

## Inspect

```bash
scripts/view-sessions.sh                    # list sessions
scripts/view-sessions.sh <session_id>       # dump one session pretty
scripts/view-sessions.sh --global           # last 80 events across all sessions
scripts/view-sessions.sh --since 1h         # filter global by time
```

Or raw:
```bash
jq -C . logs/sessions/_global.jsonl | less -R
```

## Privacy / safety

- These logs contain the **full user prompts and tool I/O** for every Claude Code session in this project.
- Treat as **Internal** classification minimum.
- Logs are excluded from git (`.gitignore`).
- Rotate or purge with `find logs/sessions -type f -mtime +30 -delete`.
- No secret redaction at the hook level — relies on user not pasting secrets into prompts.
- Transcript copy is best-effort; depends on Claude Code storing per-project transcripts at `~/.claude/projects/`.
