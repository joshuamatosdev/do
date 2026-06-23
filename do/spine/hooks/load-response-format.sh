#!/usr/bin/env bash
# SessionStart hook: confirm the structured response format is active and inject the canonical
# spec as session context. stdout is captured by Claude Code as session context.
set -euo pipefail

fmt="${CLAUDE_PROJECT_DIR:-$PWD}/.claude/RESPONSE-FORMAT.md"
[ -f "$fmt" ] || exit 0

cat <<'HEADER'
STRUCTURED RESPONSE FORMAT ACTIVE (do).

Gated turns meet the tier floor, use lean tables/lists, and ground claims in code facts.
If the tier is unclear, satisfy the next floor. Full spec follows.

HEADER

cat "$fmt"
