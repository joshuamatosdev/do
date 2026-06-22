#!/usr/bin/env bash
# SessionStart hook: load the do engineering workflow (short form) into session context so the five
# engineering moves (engineer-before-implementing, minimum-sufficient-architecture, invariant-first,
# bounded-change-surface, lifecycle-ownership) are active every session. stdout is captured by
# Claude Code as session context. The full skill loads on demand via the style skill (/do:run style).
set -euo pipefail

g="${CLAUDE_PROJECT_DIR:-$PWD}/.claude/do/one.md"
[ -f "$g" ] || exit 0

cat <<'HEADER'
DO ACTIVE (loaded at session start).

The governing engineering workflow for this project. Apply when writing, reviewing, or shaping code
or architecture: engineer before implementing, choose the minimum sufficient architecture, name the
invariants first, bound the change surface to the whole correct boundary, and own the lifecycle. The
full skill (record levels, the ADR shape, judging what blocks you) loads with the style skill or
/do:run style. Short form follows.

HEADER

cat "$g"
