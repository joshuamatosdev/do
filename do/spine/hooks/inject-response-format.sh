#!/usr/bin/env bash
# UserPromptSubmit hook: re-state the structured response format on every user turn so the
# requirement survives context compaction and is in force for the response about to be generated.
# stdout is captured by Claude Code as additional context for this turn. Kept compact (tier summary,
# not the full spec) -- the SessionStart loader injects the full spec once per session.
set -euo pipefail

fmt="${CLAUDE_PROJECT_DIR:-$PWD}/.claude/RESPONSE-FORMAT.md"
[ -f "$fmt" ] || exit 0

cat <<'HEADER'
[MANDATORY THIS TURN] Gated turn? Meet your tier floor in lean tables/lists and cite file:line or command output.

  TRIVIAL  <800 chars, no high-stakes edit                  -> exempt
  LITE     config/hook/docs/one-file/mechanical, Q&A        -> ## Goal | ## Immediate Actions | ## Remaining Steps  (Bugs:/Gaps:/Inconsistencies: only when merited)
  REPORT   long, no high-stakes code surface                -> LITE + ## Proof
  FULL     schema/migration/security edit, or >=3 prod files -> REPORT + ## Feature Completion Chain + ## Completion Checklist (both commitments)

Before "can't/unknown/blocked": check repo/docs/web, verify with tests/scripts/probes, or delegate.
Work frontier:
1. Finish the requested objective.
2. Classify discovered work.
3. Immediately drain the discovered-work frontier when it is safe, relevant, and tool-executable.
4. Stop only when the frontier contains no worthwhile safe work, or only user-owned/irreversible decisions remain.
Execution loop: objective -> required fixes -> verification -> discovered frontier -> drain -> verify -> stop.
`[USER]` = irreversible/outward decision only.
No question mark at turn end; act on the answer or write a `[USER] <choice>` without one.
Canon: .claude/RESPONSE-FORMAT.md and .claude/capability-gate.md.
HEADER
