#!/usr/bin/env bash
# UserPromptSubmit hook: re-state the structured response format on every user turn so the
# requirement survives context compaction and is in force for the response about to be generated.
# stdout is captured by Claude Code as additional context for this turn. Kept compact (tier summary,
# not the full spec) -- the SessionStart loader injects the full spec once per session.
set -euo pipefail

fmt="${CLAUDE_PROJECT_DIR:-$PWD}/.claude/RESPONSE-FORMAT.md"
[ -f "$fmt" ] || exit 0

cat <<'HEADER'
[MANDATORY THIS TURN] Gated turn (question/plan/status/debug/implementation/handoff/completion)?
Write to your tier's floor -- in TABLES and LISTS, not prose walls -- and cite file:line / command output.
The Stop gate validate-response-format.sh classifies the turn and enforces the floor:

  TRIVIAL  <800 chars, no high-stakes edit                  -> exempt
  LITE     config/hook/docs/one-file/mechanical, Q&A        -> ## Goal | ## Immediate Actions | ## Remaining Steps  (Bugs:/Gaps:/Inconsistencies: only when merited)
  REPORT   long, no high-stakes code surface                -> LITE + ## Proof
  FULL     schema/migration/security edit, or >=3 prod files -> REPORT + ## Feature Completion Chain + ## Completion Checklist (both commitments)

Before any "can't / don't know / blocked": check knowledge (repo -> docs/MCP -> WebSearch),
verification (tests -> scripts -> E2E/Playwright -> probe), delegation (do agents/skills) -- use a
real route or state what you checked. See .claude/capability-gate.md.

With a directive and tools, take the next step when it is in-scope, reversible, and tool-executable.
On a non-blocking local detail (a name, a format), do not guess or assume -- gain certainty from the
code and convention and state the fact; when a fact is not in hand, form a hypothesis, state and test
it. Do not stop to ask a detail you can settle.
Bound work to the REQUEST -- park adjacent/optional work `- [ ] [LATER]` (the gate ignores it),
never chase it. Reserve `- [ ] [USER] <decision>` for a genuinely irreversible/outward-facing call;
escalate a real blocker with `codex --decide`. Never "awaiting your direction." Never END A TURN
ASKING THE USER -- the continuation gate fires on ANY question mark in your turn (act-and-finish
policy); ACT on the answer, or record a genuine user-only decision as `- [ ] [USER] <choice>`
written WITHOUT one. The Stop gate validate-continuation.sh enforces this; `/goal "<measurable
condition>"` holds a multi-turn goal.

Format rules: lean tables (no outer pipes), blank line between numbered items, line break after a
label colon. Unsure -> write clearly, with the bottom line up front. Canonical source: .claude/RESPONSE-FORMAT.md.
HEADER
