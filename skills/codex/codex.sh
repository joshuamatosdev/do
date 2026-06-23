#!/usr/bin/env bash
# codex.sh — forward the CURRENT session to Codex as a one-shot consult.
#
# Why this is a script and not inline Claude bash: the prior SKILL.md asked
# Claude to hand-synthesize the "context" and "neutral framing" sent to Codex.
# Claude — the very reasoner whose judgment is being checked — reliably (a) led
# the witness and (b) under-included context. Both failure modes are designed
# out here by forwarding the ACTUAL conversation transcript (the ground truth,
# neutral by construction), like the `advisor` tool forwards full history.
# Claude's only remaining input is the optional question string.
#
# HONESTY ABOUT GUARANTEES (do not overclaim — see codex review 2026-05-26):
#   * NOT enforced read-only. We pass --dangerously-bypass-approvals-and-sandbox
#     because genuine `-s read-only` is BROKEN on this Windows host (the Windows
#     sandbox errors with "spawn setup refresh" and policy-blocks pwsh) AND the
#     workspace root is not a git repo (read-only mode refuses "untrusted dir").
#     Under the bypass flag Codex effectively has FULL filesystem access. This is
#     a consult by CONVENTION (read + advise), not a sandbox-enforced guarantee.
#     `-s read-only` is left on as a best-effort hint; the bypass flag overrides it.
#   * NOT the whole chat. Tool-RESULT bodies are elided to <tool_result> markers
#     and only the last ~80KB of extracted text is sent. The most-recent user
#     message is forwarded separately and untruncated so the real question
#     survives truncation.
#
# Usage:  codex.sh "<question>"     # question forwarded verbatim
#         codex.sh                  # no question -> Codex infers the open
#                                       #   question from the transcript
# Env:    ASK_CODEX_WORKSPACE  override the -C workspace (default: cwd, Win form)
#         ASK_CODEX_TIMEOUT    max Codex runtime in WHOLE SECONDS, default 300
#                              (positive integer; a trailing 's' is tolerated;
#                               non-numeric/duration forms like '5m' are rejected
#                               and fall back to 300)
#         ASK_CODEX_ALLOW_EDITS  DEFAULT ON. Codex runs the workspace-write sandbox
#                              with the empowered "Distinguished Engineer" closer and
#                              EDITS the repo by default. SECURITY: an external LLM
#                              (Codex/OpenAI) writes directly to your files on every
#                              call. Set to 0 to force read-only "Please advise."
#         CLAUDE_CODE_SESSION_ID  set by the harness; locates the transcript

set -uo pipefail

CODEX="C:/Users/Joshua/AppData/Roaming/npm/codex.cmd"
PROJECTS_DIR="${HOME}/.claude/projects"
TAIL_BYTES=80000
# Default lowered 600->300 (2026-06-15 owner opt): the Stop integrity-review uses 300s
# and is sufficient; env ASK_CODEX_TIMEOUT still overrides. Numeric seconds for the
# manual reap loop below (strip a trailing 's' if the env value carried one).
CODEX_TIMEOUT="${ASK_CODEX_TIMEOUT:-300}"
CODEX_TIMEOUT="${CODEX_TIMEOUT%s}"
# Validate: must be a positive integer number of seconds. Duration forms (e.g. "5m")
# or junk would silently break the integer comparison in the reap loop, so reject
# them and fall back to the safe default rather than running effectively unbounded.
case "$CODEX_TIMEOUT" in
  ''|*[!0-9]*)
    echo "codex: ASK_CODEX_TIMEOUT must be positive integer seconds; got '${ASK_CODEX_TIMEOUT:-}'. Using 300." >&2
    CODEX_TIMEOUT=300 ;;
esac
[ "$CODEX_TIMEOUT" -ge 1 ] 2>/dev/null || CODEX_TIMEOUT=300
# Pin model + reasoning effort so the consult ALWAYS runs high-reasoning GPT-5.5,
# independent of ~/.codex/config.toml defaults or per-project overrides.
CODEX_MODEL="gpt-5.5"
CODEX_REASONING="xhigh"   # strongest tier (extra-high), above the lower "high"
# Fast mode (owner 2026-06-14): "priority" speed tier ("Fast", 1.5x serving). This is
# SPEED only and does NOT lower reasoning, so CODEX_REASONING stays xhigh above.
CODEX_SERVICE_TIER="${ASK_CODEX_SERVICE_TIER:-priority}"

# --- refusal: codex binary present? -----------------------------------------
if [ ! -f "$CODEX" ]; then
  echo "codex: Codex binary missing at $CODEX" >&2
  exit 3
fi
# (No GNU `timeout` prerequisite: the firing path bounds itself via the manual
# winpid reap loop below, so this script no longer depends on GNU coreutils.)

# --- resolve workspace (Windows path form for codex -C) ----------------------
WORKSPACE="${ASK_CODEX_WORKSPACE:-}"
if [ -z "$WORKSPACE" ]; then
  if command -v cygpath >/dev/null 2>&1; then
    WORKSPACE=$(cygpath -m "$(pwd)")
  else
    WORKSPACE=$(pwd)
  fi
fi

# --- locate THIS session's transcript (deterministic via session id) ---------
SID="${CLAUDE_CODE_SESSION_ID:-}"
TX=""
n_match=0
if [ -n "$SID" ]; then
  for f in "$PROJECTS_DIR"/*/"$SID.jsonl"; do
    [ -f "$f" ] || continue
    n_match=$((n_match + 1))
    [ -z "$TX" ] && TX="$f"
  done
fi
if [ -z "$TX" ]; then
  echo "codex: cannot locate transcript for session '${SID:-<unset>}' under $PROJECTS_DIR." >&2
  echo "codex: refusing to fire without conversation context (that is the whole point)." >&2
  exit 4
fi
[ "$n_match" -gt 1 ] && echo "codex: WARNING: $n_match transcripts matched session id; using $TX" >&2

# --- extract conversation: keep text + tool_use NAMES; drop tool_result BODIES
# (bodies are what bloat the jsonl; Codex has -C FS access if it needs files).
# NOTE: jq stderr is intentionally NOT suppressed so extraction failures surface.
CONV=$(jq -r '
  select(.type=="user" or .type=="assistant") |
  (if .type=="user" then "[USER]" else "[ASSISTANT]" end) as $tag |
  ($tag + " " + (
    (.message.content // []) |
    if type=="array" then (map(
      if .type=="text" then .text
      elif .type=="tool_use" then "<tool_use:" + (.name // "?") + ">"
      elif .type=="tool_result" then "<tool_result>"
      else "" end) | join("\n"))
    elif type=="string" then .
    else "" end))
' "$TX")
jq_conv_rc=$?

# --- guard: never fire a context-free / partial consult (the silent-empty bug)
if [ "$jq_conv_rc" -ne 0 ]; then
  echo "codex: jq failed (rc=$jq_conv_rc) extracting transcript $TX." >&2
  echo "codex: refusing to fire on possibly-partial context." >&2
  exit 5
fi
if [ -z "$CONV" ]; then
  echo "codex: transcript extraction produced no conversation text (empty session)." >&2
  echo "codex: refusing to fire context-free." >&2
  exit 5
fi

# --- most-recent genuine user message — forwarded untruncated so the real -----
# question survives the 80KB tail AND anchors the no-argument inference path.
LAST_USER=$(jq -rs '
  [ .[]
    | select(.type=="user")
    | (.message.content // [])
    | (if type=="array" then (map(select(.type=="text") | .text) | join("\n"))
       elif type=="string" then . else "" end) ]
  | map(select(
      . != ""
      and ((test("^[[:space:]]*<(local-command|command-name|command-message|command-args|system-reminder)";"i")) | not)
    ))
  | last // ""
' "$TX")
jq_lu_rc=$?
if [ "$jq_lu_rc" -ne 0 ]; then
  echo "codex: WARNING: jq failed (rc=$jq_lu_rc) extracting latest user message;" >&2
  echo "codex: the untruncated-question guarantee is degraded for this run." >&2
  LAST_USER=""
fi

# --- light secret scrub (Codex has workspace FS access, but transcripts can ----
# carry secrets from OUTSIDE -C, e.g. machine-local key files Claude read).
scrub() {
  # perl pass first: redact the ENTIRE multi-line PEM block (BEGIN..body..END),
  # not just the BEGIN line. Runs before truncation so blocks are never split.
  perl -0777 -pe 's/-----BEGIN[A-Z ]*PRIVATE KEY-----.*?-----END[A-Z ]*PRIVATE KEY-----/[REDACTED_PRIVATE_KEY_BLOCK]/gs' \
  | sed -E \
    -e 's/AKIA[0-9A-Z]{16}/[REDACTED_AWS_KEY]/g' \
    -e 's/(Bearer )[A-Za-z0-9._~+\/-]+=*/\1[REDACTED]/g' \
    -e 's/eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/[REDACTED_JWT]/g' \
    -e 's/sk-[A-Za-z0-9_-]{16,}/[REDACTED_OPENAI_KEY]/g' \
    -e 's/gh[pousr]_[A-Za-z0-9]{20,}/[REDACTED_GITHUB_TOKEN]/g' \
    -e 's/AIza[A-Za-z0-9_-]{20,}/[REDACTED_GOOGLE_KEY]/g' \
    -e 's/-----BEGIN[A-Z ]*PRIVATE KEY-----/[REDACTED_PRIVATE_KEY_BLOCK]/g' \
    -e 's/("?(private_key|client_secret|api_key|password|secret|token)"?[[:space:]]*[:=][[:space:]]*")[^"]+"/\1[REDACTED]"/Ig'
}
CONV=$(printf '%s' "$CONV" | scrub)
LAST_USER=$(printf '%s' "$LAST_USER" | scrub)

# --- bound size: keep the most recent TAIL_BYTES of extracted conversation ----
TRUNC_NOTE=""
CONV_BYTES=$(printf '%s' "$CONV" | wc -c)
if [ "$CONV_BYTES" -gt "$TAIL_BYTES" ]; then
  CONV=$(printf '%s' "$CONV" | tail -c "$TAIL_BYTES")
  TRUNC_NOTE="[... earlier turns truncated; showing last ${TAIL_BYTES} bytes. The most-recent user message is reproduced in full above, so the current question is intact. ...]"
fi

# --- question section ---------------------------------------------------------
# --- mode: consult (default) or decide (gate fail-closed go/no-go) ------------
MODE=consult
case "${1:-}" in
  --decide|decide) MODE=decide; shift ;;
esac
# Owner directive (2026-06-19): the prompt is the CONTEXT plus the literal words
# "Please advise." — nothing else. No framing, no headers, no format, no mode-
# specific shaping. --decide is still accepted (and shifts the arg) but no longer
# changes the prompt; the matter, if any, rides in the context like any question.
QUESTION="${1:-}"

# --- edit mode (DEFAULT ON — owner directive 2026-06-22) ----------------------
# Default: workspace-write sandbox + the empowered "Distinguished Engineer" closer;
# Codex EVALUATES and EDITS the repo when it judges a better solution warranted.
# SECURITY: this lets an EXTERNAL LLM (Codex/OpenAI) write directly to the -C
# workspace on every call. Kill switch: ASK_CODEX_ALLOW_EDITS=0 forces read-only
# "Please advise." (the prior advise-only behavior).
CODEX_SANDBOX="workspace-write"
CODEX_CLOSER="You are a Distinguished Software Engineer, you are to evaluate the current situation and decide how to proceed, before acting surface your ideas. Never take deferment at face value when a better engineering solution is still practical."
CODEX_EDIT_NOTE="WORKSPACE-WRITE (edits allowed)"
if [ "${ASK_CODEX_ALLOW_EDITS:-}" = "0" ]; then
  CODEX_SANDBOX="read-only"
  CODEX_CLOSER="Please advise."
  CODEX_EDIT_NOTE="read-only/advise"
fi

# --- build prompt to a tempfile (robust for large stdin on Windows) ----------
# The prompt is: the CONTEXT (optional verbatim question + most-recent user
# message + transcript) followed by the closer line ("$CODEX_CLOSER"). Nothing
# else — no preamble, no headers, no format. By DEFAULT the closer is the empowered
# Distinguished-Engineer text and the sandbox is workspace-write; the -s FLAG on the
# firing line below carries the sandbox intent (ASK_CODEX_ALLOW_EDITS=0 restores
# read-only + "Please advise."). Secrets were already scrubbed above.
PROMPT_FILE=$(mktemp)
trap 'rm -f "$PROMPT_FILE"' EXIT
{
  [ -n "$QUESTION" ]   && printf '%s\n\n' "$QUESTION"
  [ -n "$LAST_USER" ]  && printf '%s\n\n' "$LAST_USER"
  [ -n "$TRUNC_NOTE" ] && printf '%s\n' "$TRUNC_NOTE"
  printf '%s\n\n' "$CONV"
  printf '%s\n' "$CODEX_CLOSER"
} > "$PROMPT_FILE"

# --- fire (status to stderr so stdout stays the verbatim Codex response) ------
# Flags: --dangerously-bypass-approvals-and-sandbox is REQUIRED here (genuine
# -s read-only is broken on this Windows host and refuses the non-git workspace
# root). It gives Codex full FS access; the consult is read-only by convention.
# --- derive a human session name from the transcript ai-title (best-effort) ---
# Filenames carry "<slug>-<session-id>" so each consult is findable by TOPIC and
# by session. The harness writes type:"ai-title" lines (camelCase .aiTitle) into
# the transcript; we take the latest. The slug is best-effort: when no ai-title
# is present yet, SLUG is empty and we fall back to the session id alone.
SESS_NAME=$(jq -rs '[ .[] | select(.type=="ai-title") | .aiTitle // empty ] | last // ""' "$TX" 2>/dev/null)
SLUG=$(printf '%s' "$SESS_NAME" \
  | tr '[:upper:]' '[:lower:]' \
  | sed -E 's/[^a-z0-9]+/-/g; s/^-+//; s/-+$//' \
  | cut -c1-60)

TS=$(date -u +%Y%m%dT%H%M%SZ)
OUT_DIR="$WORKSPACE/.claude/state/codex-asks"
mkdir -p "$OUT_DIR"
# SID is guaranteed non-empty here (the transcript lookup above exits 4 otherwise).
if [ -n "$SLUG" ]; then
  OUT="$OUT_DIR/ask-$SLUG-$SID-$TS.log"
else
  OUT="$OUT_DIR/ask-$SID-$TS.log"
fi

{
  echo "codex: workspace=$WORKSPACE"
  echo "codex: transcript=$TX"
  echo "codex: prompt bytes=$(wc -c < "$PROMPT_FILE")  (transcript tail<=$TAIL_BYTES; recent user msg untruncated)"
  echo "codex: model=$CODEX_MODEL  reasoning=$CODEX_REASONING  service_tier=$CODEX_SERVICE_TIER (pinned)"
  echo "codex: mode=$CODEX_EDIT_NOTE  sandbox=$CODEX_SANDBOX"
  echo "codex: timeout=${CODEX_TIMEOUT}s (reconnect fail-fast >=3, winpid process-tree reap)"
  echo "codex: firing Codex at $TS ..."
} >&2

# Launch Codex in the BACKGROUND so we can reap its WHOLE process tree on timeout
# or a stuck network. GNU `timeout` (used previously) TERMs only the node launcher
# and ORPHANS the native codex.exe, which keeps running for minutes burning tokens
# (see codex-integrity-review-stop.sh:220-240). Reap by Windows PID via taskkill //T;
# winpid comes from /proc/<pid>/winpid (the MSYS pid != the Windows pid).
"$CODEX" exec \
  --dangerously-bypass-approvals-and-sandbox \
  -s "$CODEX_SANDBOX" \
  -m "$CODEX_MODEL" \
  -c "model_reasoning_effort=\"$CODEX_REASONING\"" \
  -c "service_tier=\"$CODEX_SERVICE_TIER\"" \
  -C "$WORKSPACE" \
  - < "$PROMPT_FILE" > "$OUT" 2>&1 &
codex_pid=$!
codex_winpid=$(cat "/proc/$codex_pid/winpid" 2>/dev/null)
reap() {
  # winpid may have been empty at launch (race); re-read before giving up, else the
  # native codex.exe would be orphaned — the exact bug this reap exists to prevent.
  [ -z "$codex_winpid" ] && codex_winpid=$(cat "/proc/$codex_pid/winpid" 2>/dev/null)
  [ -n "$codex_winpid" ] && taskkill //F //T //PID "$codex_winpid" >/dev/null 2>&1
  kill "$codex_pid" 2>/dev/null
  wait "$codex_pid" 2>/dev/null
}
waited=0
codex_rc=0
while kill -0 "$codex_pid" 2>/dev/null; do
  # Fail-fast: a transient network blip makes codex print "ERROR: Reconnecting..."
  # and retry up to 5x, stalling for minutes. Abort at the 3rd reconnect instead of
  # waiting out the full timeout (this is exactly what burned ~20 min before).
  # Match ONLY codex's live client reconnect line at column 0 in its exact format
  # ("ERROR: Reconnecting... N/M"). codex echoes the forwarded prompt into its output,
  # so a loose substring also counts our own transcript text that merely QUOTES this
  # string (false-abort). Anchoring + the numeric shape excludes the echoed prose.
  rc_cnt=$(grep -cE '^ERROR: Reconnecting\.\.\. [0-9]+/[0-9]+' "$OUT" 2>/dev/null); rc_cnt=${rc_cnt:-0}
  if [ "$rc_cnt" -ge 3 ]; then
    reap; codex_rc=75; break
  fi
  if [ "$waited" -ge "$CODEX_TIMEOUT" ]; then
    reap; codex_rc=124; break
  fi
  sleep 2
  waited=$((waited + 2))
done
if [ "$codex_rc" -eq 0 ]; then
  wait "$codex_pid"
  codex_rc=$?
fi

# Emit Codex's verbatim response (buffered to $OUT during the run) to stdout.
cat "$OUT"

if [ "$codex_rc" -eq 75 ]; then
  echo "codex: network unstable (>=3 reconnects) — aborted early to avoid a full-timeout stall. Partial output: $OUT" >&2
  exit 75
fi
if [ "$codex_rc" -eq 124 ] || [ "$codex_rc" -eq 137 ]; then
  echo "codex: Codex timed out after ${CODEX_TIMEOUT}s. Partial output (if any): $OUT" >&2
  exit "$codex_rc"
fi
if [ "$codex_rc" -ne 0 ]; then
  echo "codex: Codex exited non-zero (rc=$codex_rc). Partial output (if any): $OUT" >&2
  exit "$codex_rc"
fi
echo "Saved: $OUT"
