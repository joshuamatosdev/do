#!/usr/bin/env bash
# PreToolUse(Edit|Write): advisory guard. Non-blocking in MVP (exit 0); logs intent.
set -euo pipefail
# Self-gate: only act where /do:run setup opted this project in (install writes the manifest).
[ -f "${CLAUDE_PROJECT_DIR:-$PWD}/.claude/do.manifest.json" ] || exit 0
cat >/dev/null
exit 0
