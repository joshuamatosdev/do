#!/usr/bin/env bash
# run-integrity.sh — Codex integrity review with automatic fallback.
#
# If Codex is absent, fails, times out, or returns no DECISION, emit
# SOURCE: change-skeptic plus dispatch action. The caller dispatches the agent.
#
# Usage:  run-integrity.sh [packet-file]      packet-file = the review prompt (fed to codex on stdin)
# Env:    INTEGRITY_CODEX_CMD   codex command as a SHELL STRING (run via `bash -c`); for operator
#                               overrides / test stubs that need quoting or sequencing. When unset,
#                               codex is invoked as a direct argv array (no shell) -> no injection.
#         INTEGRITY_CODEX_ARGV  newline-delimited extra argv elements appended to the default `codex`
#                               binary when INTEGRITY_CODEX_CMD is unset (e.g. one per line:
#                               exec / --sandbox / read-only / -C / <dir> / -). Each line is one
#                               literal argument: no shell parsing, so a path with metacharacters is
#                               passed verbatim and cannot inject. Ignored if INTEGRITY_CODEX_CMD set.
#         INTEGRITY_CODEX_TIMEOUT  hard timeout in seconds   (default: 300)
#         DO_SCRUB_CMD          secret-scrubber filter as a SHELL STRING (stdin->stdout, run via
#                               `bash -c`); operator/test override. When unset, the bundled scrubber
#                               (node <repoRoot>/lib/do-mon-context.js --scrub) is run as a direct
#                               argv array -- repoRoot is NEVER interpolated into a shell string.
# Output (stdout): on success -> "SOURCE: codex" + codex's verdict.
#                  on failure -> "SOURCE: change-skeptic" + REASON + ACTION (dispatch the agent).
# Always exits 0 (advisory): the caller reads SOURCE and acts.
#
# EGRESS SCRUBBING: before external LLM egress, route packet through the shared
# scrubber. Scrub failure sends nothing and falls back without hard-blocking.
set -uo pipefail

packet="${1:-}"
timeout_s="${INTEGRITY_CODEX_TIMEOUT:-300}"
# repoRoot = this script's dir up three (codex-integrity -> modules -> do -> repo root).
self_dir="$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")" && pwd)"
repo_root="$(cd "$self_dir/../../.." && pwd)"

# --- Safe external-command execution (no shell-string injection) --------------------------------
# Two modes per command:
#   * OVERRIDE (env var set): an explicit operator/test SHELL STRING -> run via `bash -c "$str"`.
#     The value is passed as a SINGLE argv element to bash, not concatenated into a script, and it
#     is caller-controlled by contract (the documented env var) -- not a value this script derives
#     from a filesystem path. This preserves quoting/sequencing the test stubs and operators need.
#   * DEFAULT (env var unset): the bundled binary is run as a DIRECT argv ARRAY -- repo_root / the
#     project dir are passed as literal arguments, never re-parsed by a shell, so a path containing
#     shell metacharacters cannot inject. This is the injection-free path the hooks use in prod.

# Build the default codex argv: the `codex` binary plus any INTEGRITY_CODEX_ARGV lines (one literal
# arg per line). No word-splitting, no glob, no command substitution on the elements.
codex_argv=(codex)
if [ -n "${INTEGRITY_CODEX_ARGV:-}" ]; then
  while IFS= read -r _arg; do
    [ -z "$_arg" ] && continue
    codex_argv+=("$_arg")
  done <<EOF
${INTEGRITY_CODEX_ARGV}
EOF
fi

# Resolve the codex binary name for the PATH check (override -> first shell token; default -> argv[0]).
if [ -n "${INTEGRITY_CODEX_CMD:-}" ]; then
  first_word="${INTEGRITY_CODEX_CMD%% *}"
else
  first_word="${codex_argv[0]}"
fi

# run_scrub  <infile> <outfile>  -> scrubber exit status. Default = direct argv (no shell).
run_scrub() {
  if [ -n "${DO_SCRUB_CMD:-}" ]; then
    bash -c "$DO_SCRUB_CMD" < "$1" > "$2" 2>/dev/null
  else
    node "$repo_root/lib/do-mon-context.js" --scrub < "$1" > "$2" 2>/dev/null
  fi
}

emit_fallback() {  # $1 = reason
  echo "SOURCE: change-skeptic"
  echo "REASON: codex unavailable -- $1"
  echo "ACTION: dispatch do:change-skeptic for in-session integrity review (fallback)."
  exit 0
}

# 1. codex resolvable?
command -v "$first_word" >/dev/null 2>&1 || emit_fallback "not on PATH ($first_word)"

# 2. scrub the packet BEFORE egress. The scrubbed text is what codex receives; the raw packet never
#    leaves this process. Fail-closed: any scrubber failure routes to the skeptic instead of leaking.
raw_in="${packet:-/dev/null}"; [ -f "$raw_in" ] || raw_in=/dev/null
scrubbed=$(mktemp 2>/dev/null || echo "${TMPDIR:-/tmp}/do-integrity-scrub-$$.txt")
if ! run_scrub "$raw_in" "$scrubbed"; then
  rm -f "$scrubbed" 2>/dev/null || true
  emit_fallback "secret scrubber failed -- refusing to send unscrubbed turn text to the external LLM"
fi
# A non-empty packet that scrubs to nothing means the scrubber did not run (e.g. CLI not wired yet);
# refuse to egress rather than silently send an empty/raw review.
if [ -s "$raw_in" ] && [ ! -s "$scrubbed" ]; then
  rm -f "$scrubbed" 2>/dev/null || true
  emit_fallback "secret scrubber produced no output -- refusing to send unscrubbed turn text to the external LLM"
fi
in="$scrubbed"

# 3. run codex with a hard timeout, SCRUBBED packet on stdin; capture output + status.
#    `timeout` takes a command + argv directly, so the default path needs no shell at all; the
#    override path passes the operator's shell STRING as a single argv element to `bash -c`.
have_timeout=""; command -v timeout >/dev/null 2>&1 && have_timeout="timeout ${timeout_s}s"
if [ -n "${INTEGRITY_CODEX_CMD:-}" ]; then
  out=$($have_timeout bash -c "$INTEGRITY_CODEX_CMD" < "$in" 2>&1); status=$?
else
  out=$($have_timeout "${codex_argv[@]}" < "$in" 2>&1); status=$?
fi
rm -f "$scrubbed" 2>/dev/null || true

# 4. classify failure modes -> fallback.
[ "$status" -eq 124 ] && emit_fallback "timed out after ${timeout_s}s"
[ "$status" -ne 0 ]   && emit_fallback "exited non-zero ($status)"
printf '%s\n' "$out" | grep -qE '^DECISION: (ALLOW|BLOCK|REPAIR|PROCEED|HOLD)' \
  || emit_fallback "returned no DECISION line"

# 5. success -> relay codex's verdict verbatim.
echo "SOURCE: codex"
printf '%s\n' "$out"
exit 0
