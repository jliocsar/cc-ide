#!/usr/bin/env bash
# Stop hook: drain the per-session queue written by biome-post-edit.sh
# and run a single read-only `biome check` over the deduped set of files
# Claude touched this turn. Emits {decision:"block", reason:<report>} so
# Claude self-corrects before the turn actually ends.
#
# Loop guard: if `stop_hook_active` is true, a previous Stop hook in this
# stop sequence already blocked once — drain the queue and exit cleanly
# so we don't trap Claude in an infinite re-block loop on unfixable issues.

set -u

input=$(cat)
session_id=$(printf '%s' "$input" | jq -r '.session_id // empty')
stop_hook_active=$(printf '%s' "$input" | jq -r '.stop_hook_active // false')

if [ -z "$session_id" ]; then exit 0; fi

queue="${TMPDIR:-/tmp}/claude-biome-queue-${session_id}.list"
if [ ! -f "$queue" ]; then exit 0; fi

# Always drain the queue, even on early exit / error.
trap 'rm -f "$queue"' EXIT

if [ "$stop_hook_active" = "true" ]; then exit 0; fi

cd "${CLAUDE_PROJECT_DIR:-.}" 2>/dev/null || true

if [ ! -x node_modules/.bin/biome ]; then exit 0; fi

# Dedupe, then filter to files that still exist.
files=$(sort -u "$queue" | while IFS= read -r f; do
  if [ -f "$f" ]; then printf '%s\n' "$f"; fi
done)

if [ -z "$files" ]; then exit 0; fi

out=$(printf '%s\n' "$files" | xargs node_modules/.bin/biome check --no-errors-on-unmatched --files-ignore-unknown=true 2>&1)
code=$?

if [ $code -ne 0 ]; then
  jq -n --arg reason "Biome reported issues across files touched this turn (read-only check; pre-commit hook will auto-fix what it can):"$'\n'"$out" '{
    decision: "block",
    reason: $reason
  }'
  exit 0
fi

exit 0
