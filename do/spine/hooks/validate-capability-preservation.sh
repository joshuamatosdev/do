#!/usr/bin/env bash
# Stop: DO-CAP-001 capability-preservation gate -- ADVISORY mode (warns, never blocks).
#
# Flags a "silent capability-drop disguised as a finished fix": a turn that makes a value-producing
# path return a sentinel (UNKNOWN/N-A/null/empty) because a SOURCE (projection/query/schema/
# read-model) is missing, then reads as complete. Reuses the per-session baseline written by
# snapshot-capability-candidates.sh so only candidates INTRODUCED this turn surface.
#
# Rollout: advisory-first (this file). Blocking "agency" comes after a tuning pass -- to flip, change
# the final emit from a stderr note to a {"decision":"block"} JSON. FAIL-OPEN throughout; ALWAYS
# exits 0 so a buggy scan can never wedge a session.
set -uo pipefail

input=$(cat 2>/dev/null || true)
command -v jq >/dev/null 2>&1 || exit 0

# Recursion guard (parity with the other Stop hooks; advisory never re-prompts anyway).
active=$(printf '%s' "$input" | jq -r '.stop_hook_active // false' 2>/dev/null || echo false)
[ "$active" = "true" ] && exit 0

proj="${CLAUDE_PROJECT_DIR:-$PWD}"
[ -f "$proj/.claude/do.manifest.json" ] || exit 0   # only where /do:run setup opted this project in
command -v node >/dev/null 2>&1 || exit 0
command -v git  >/dev/null 2>&1 || exit 0
git -C "$proj" rev-parse --is-inside-work-tree >/dev/null 2>&1 || exit 0

transcript=$(printf '%s' "$input" | jq -r '.transcript_path // empty' 2>/dev/null || true)
{ [ -n "$transcript" ] && [ -f "$transcript" ]; } || exit 0

hookdir="$(cd "$(dirname "$0")" && pwd)"
repo_root="$(cd "$hookdir/../../.." && pwd)"          # hooks -> spine -> do -> repo root
lib="$repo_root/lib/capability-preservation.js"
[ -f "$lib" ] || exit 0

# Turn text + tier (a TRIVIAL turn -- short, no edits -- is not worth scanning).
. "$hookdir/lib/turn-tier.sh" 2>/dev/null || exit 0
classify_turn "$transcript"
[ "${TURN_N:-0}" -ne 0 ] || exit 0
[ "${TURN_TIER:-TRIVIAL}" = "TRIVIAL" ] && exit 0

tmp="${TMPDIR:-${TEMP:-/tmp}}"
sid=$(printf '%s' "$input" | jq -r '.session_id // empty' 2>/dev/null || true)
[ -n "$sid" ] || sid="nosession"
sid=$(printf '%s' "$sid" | tr -cd 'A-Za-z0-9._-')
base="$tmp/do-cap-baseline-$sid.txt"
[ -f "$base" ] || base=/dev/null   # no snapshot -> empty baseline (everything counts as new)

diff_file=$(mktemp 2>/dev/null || echo "$tmp/do-cap-stop-$sid.diff")
git -C "$proj" diff HEAD > "$diff_file" 2>/dev/null || { rm -f "$diff_file" 2>/dev/null || true; exit 0; }
if [ "$(wc -c < "$diff_file" 2>/dev/null || echo 0)" -gt 2000000 ]; then
  rm -f "$diff_file" 2>/dev/null || true
  echo "do capability-preservation: change surface too large to scan this turn (advisory skipped)." >&2
  exit 0
fi

turn_file=$(mktemp 2>/dev/null || echo "$tmp/do-cap-turn-$sid.txt")
printf '%s' "${TURN_TEXT:-}" > "$turn_file" 2>/dev/null || true

verdict=$(node "$lib" --diff "$diff_file" --turn "$turn_file" --baseline "$base" 2>/dev/null || true)
rm -f "$diff_file" "$turn_file" 2>/dev/null || true

printf '%s' "$verdict" | grep -q '"allow":true'  && exit 0
printf '%s' "$verdict" | grep -q '"allow":false' || exit 0   # unparseable / empty -> fail open

flagged=$(printf '%s' "$verdict" | jq -r '.violations[]? | "  - " + .symbol + "  (" + .file + ") :: " + .line' 2>/dev/null || true)

{
  echo "do capability-preservation (DO-CAP-001, ADVISORY): this turn introduces a capability-drop that reads as complete."
  echo "A value path now returns a sentinel because a source (projection/query/schema/read-model) is missing -- system absence, not an empty record:"
  printf '%s\n' "$flagged"
  echo "Do ONE before you stop:"
  echo "  1. Build the missing source, compute the real value, and verify to green; OR"
  echo "  2. Keep the honest absence but mark the delivery -- put 'CAPABILITY STATUS: NOT COMPLETE' in your first lines, plus a record:"
  echo "     CAPABILITY GAP: symbol=<x> | behavior=<y> | impact=<z> | cause=<w> | disposition=TRACKED:<grounded-id> | evidence=<file:line>"
  echo "Do not present a degraded sentinel as a finished fix. (Advisory only for now -- this does not block.)"
} >&2
exit 0
