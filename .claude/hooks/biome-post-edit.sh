#!/usr/bin/env bash
# PostToolUse hook: run Biome on the single file Claude just edited.
# Emits {decision:"block", reason:<stderr>} on non-zero exit so Claude self-corrects.

set -u

input=$(cat)
file_path=$(printf '%s' "$input" | jq -r '.tool_input.file_path // empty')

if [ -z "$file_path" ]; then exit 0; fi
if [ ! -f "$file_path" ]; then exit 0; fi

case "$file_path" in
  *.ts|*.tsx|*.js|*.jsx|*.mjs|*.cjs|*.json|*.jsonc|*.css) ;;
  *) exit 0 ;;
esac

cd "$CLAUDE_PROJECT_DIR" 2>/dev/null || true

if [ ! -x node_modules/.bin/biome ]; then exit 0; fi

out=$(node_modules/.bin/biome check --write --no-errors-on-unmatched --files-ignore-unknown=true "$file_path" 2>&1)
code=$?

if [ $code -eq 0 ]; then exit 0; fi

jq -n --arg reason "Biome reported issues for $file_path:"$'\n'"$out" '{
  decision: "block",
  reason: $reason
}'
exit 0
