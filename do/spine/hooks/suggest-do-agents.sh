#!/usr/bin/env bash
# UserPromptSubmit: enumerate the do: agents (name + one-line purpose) and suggest dispatching a
# best-fit specialist for this task. Self-gates on the do manifest (no-op where /do:run setup did
# not opt the project in); the node helper stays silent when the prompt already names an agent.
# Pure plumbing: fail-open everywhere, never blocks the prompt, no repo mutation.
set -uo pipefail

input=$(cat 2>/dev/null || true)

proj="${CLAUDE_PROJECT_DIR:-$PWD}"
[ -f "$proj/.claude/do.manifest.json" ] || exit 0   # only where /do:run setup opted this project in
command -v node >/dev/null 2>&1 || exit 0

hookdir="$(cd "$(dirname "$0")" && pwd)"
root="${CLAUDE_PLUGIN_ROOT:-$(cd "$hookdir/../../.." && pwd)}"   # hooks -> spine -> do -> plugin root
helper="$root/tools/suggest-do-agents.js"
[ -f "$helper" ] || exit 0

printf '%s' "$input" | node "$helper" 2>/dev/null || true
exit 0
