#!/usr/bin/env bash
# SessionStart hook: load the Capability Check gate into session context so the host loop reaches for
# available tools / agents / skills / docs before declaring inability. stdout is captured by Claude
# Code as session context (same contract as load-do-one.sh).
set -euo pipefail

g="${CLAUDE_PROJECT_DIR:-$PWD}/.claude/capability-gate.md"
[ -f "$g" ] || exit 0

cat <<'HEADER'
CAPABILITY CHECK ACTIVE (loaded at session start).

Before any "I can't / I don't know / not possible / can't verify / blocked", run the three routes --
knowledge, verification, delegation -- and use a real tool / agent / skill / doc source / script if
one exists. A refusal is valid only after the check comes back empty. Gate follows.

HEADER

cat "$g"
