#!/usr/bin/env bash
# SessionStart hook: confirm the structured response format is active and inject the canonical
# spec as session context. stdout is captured by Claude Code as session context.
set -euo pipefail

fmt="${CLAUDE_PROJECT_DIR:-$PWD}/.claude/RESPONSE-FORMAT.md"
[ -f "$fmt" ] || exit 0

cat <<'HEADER'
STRUCTURED RESPONSE FORMAT ACTIVE (do).

Gated turns (question/plan/status/debug/implementation/handoff/completion): write to your tier's
floor -- in TABLES and LISTS, not prose walls -- and ground every claim in codebase facts. The Stop
gate validate-response-format.sh classifies the turn and enforces the floor:

  TRIVIAL  <800 chars, no high-stakes edit                  -> exempt
  LITE     config/hook/docs/one-file/mechanical, Q&A        -> ## Goal | ## Immediate Actions | ## Remaining Steps  (Bugs:/Gaps:/Inconsistencies: only when merited)
  REPORT   long, no high-stakes code surface                -> LITE + ## Proof
  FULL     schema/migration/security edit, or >=3 prod files -> REPORT + ## Feature Completion Chain + ## Completion Checklist (both commitments)

Format rules: lean tables (no outer pipes), blank line between numbered items, line break after a
label colon. If the tier is unclear, satisfy the next floor; keep it concise and evidence-based. Full spec follows.

HEADER

cat "$fmt"
