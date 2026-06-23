#!/usr/bin/env bash
# Stop hook: GRADUATED, scenario-aware enforcement of .claude/RESPONSE-FORMAT.md.
# Scales the required floor to the turn:
#   TRIVIAL -> exempt | LITE -> min-info floor | REPORT -> min + Stop-Work Q&A | FULL -> full ceremony
# Tier is inferred from what THIS turn edited (transcript tool_use) + the turn's whole
# assistant-text length (all text blocks since the last human prompt, not just the closer);
# schema/migration or security/auth edits, or >=3 production-code files, force FULL.
# .claude/, docs/, *.md are benign -> never raise the tier.
# FAIL-OPEN by design: jq missing / no transcript / parse error / empty extraction -> exit 0.
# RECURSION-SAFE: stop_hook_active=true -> exit 0 (a block re-prompts at most once, never loops).
#
# Portable: reads the spec from the target project (${CLAUDE_PROJECT_DIR}/.claude/RESPONSE-FORMAT.md)
# and the per-tier required strings from that file's GATE-REQUIRED:<TIER> blocks -- nothing is
# hardcoded or workspace-specific here. Edit the spec to change what the gate enforces.
set -uo pipefail

input=$(cat 2>/dev/null || true)

# Fail-open if jq is unavailable.
command -v jq >/dev/null 2>&1 || exit 0

# Recursion guard.
active=$(printf '%s' "$input" | jq -r '.stop_hook_active // false' 2>/dev/null || echo false)
[ "$active" = "true" ] && exit 0

transcript=$(printf '%s' "$input" | jq -r '.transcript_path // empty' 2>/dev/null || true)
[ -n "$transcript" ] || exit 0
[ -f "$transcript" ] || exit 0

# --- Classify the turn (tier + signals) --------------------------------------------------
# Shared logic -- assistant-text extraction, edit/dispatch signals, and the EXEMPT/REPORT
# thresholds -- lives in lib/turn-tier.sh so THIS gate and codex-stop.sh stay
# in lock-step (was duplicated jq). classify_turn sets TURN_TEXT/TURN_N/TURN_HEAVY/
# TURN_DISPATCHED/TURN_TIER; it fails open (empty text, TRIVIAL) on any jq/parse error.
. "$(dirname "$0")/lib/turn-tier.sh"
classify_turn "$transcript"
text="$TURN_TEXT"; n="$TURN_N"; heavy="$TURN_HEAVY"; prod="$TURN_PROD"

# Nothing to validate (turn ended without text) -> fail-open.
[ "$n" -eq 0 ] && exit 0

# TRIVIAL = short turn, no high-stakes edit -> exempt (no floor). Dispatch is not a tier signal.
tier="$TURN_TIER"
[ "$tier" = "TRIVIAL" ] && exit 0

# --- Per-tier required strings (read from the spec's GATE-REQUIRED:<TIER> block) ----------
# SINGLE SOURCE OF TRUTH: the verbatim required markers live in the GATE-REQUIRED:<TIER> blocks
# of .claude/RESPONSE-FORMAT.md, not here. FAIL-OPEN: spec missing / block absent / empty
# extraction -> required empty -> no missing markers -> allow.
SPEC_FILE="${CLAUDE_PROJECT_DIR:-$PWD}/.claude/RESPONSE-FORMAT.md"
[ -f "$SPEC_FILE" ] || exit 0

required=$(awk -v tier="$tier" '
  $0 ~ ("GATE-REQUIRED:" tier "$") { capture=1; next }
  capture && /GATE-REQUIRED:END/  { capture=0 }
  capture                          { print }
' "$SPEC_FILE" 2>/dev/null || true)

case "$tier" in
  LITE)   floor_desc="the LITE floor: ## Goal, ## Immediate Actions, ## Remaining Steps (Bugs:/Gaps:/Inconsistencies: are conditional -- add them only when merited)" ;;
  REPORT) floor_desc="the REPORT floor: ## Goal, ## Immediate Actions, ## Proof, ## Remaining Steps (Bugs:/Gaps:/Inconsistencies: are conditional -- add them only when merited)" ;;
  FULL)   floor_desc="the FULL floor: ## Goal, ## Immediate Actions, ## Proof, ## Remaining Steps, ## Feature Completion Chain, ## Completion Checklist, and both Completion-Checklist commitments -- see .claude/RESPONSE-FORMAT.md" ;;
esac

missing=""
while IFS= read -r m; do
  [ -z "$m" ] && continue
  printf '%s' "$text" | grep -qF "$m" || missing="${missing:+$missing; }${m}"
done <<EOF
$required
EOF

# Conforming -> allow.
[ -z "$missing" ] && exit 0

# Evidence-gated enforcement. BLOCK only when this turn has proven on-transcript PRODUCTION
# substance -- a high-stakes edit (schema/security, or >=3 files) or >=1 production-code file:
# the turn visibly did production work and owes a structured account. When the turn is
# "substantive" only by INFERENCE (text length, no production edit on this transcript), the
# classification is a guess, not ground truth -> ADVISE, never block. A header-string gate
# can't recognise a valid-but-differently-shaped turn, so it blocks only what it can prove and
# stays silent-but-helpful on what it infers. (Advisory shape: validate-capability-preservation.sh.)
reason="Response-format floor not met. This turn was classified ${tier} (turn text ${n} chars$( [ "$heavy" = "1" ] && printf '%s' "; high-stakes schema/security or multi-file production edit this turn" )). It is missing required element(s): ${missing}. Re-emit clearing ${floor_desc}. Canonical spec: .claude/RESPONSE-FORMAT.md. Ground every claim in codebase facts (file:line, command output)."

if [ "$heavy" = "1" ] || [ "${prod:-0}" -gt 0 ]; then
  jq -nc --arg r "$reason" '{decision:"block", reason:$r}'
  exit 0
fi

# Substantive only by inference (text length, no production edit) -> non-blocking advisory.
echo "do response-format (ADVISORY): ${reason}" >&2
exit 0
