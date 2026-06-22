#!/usr/bin/env bash
# Shared turn classifier for do Stop hooks. SOURCE this file, then call:
#     classify_turn "<transcript_path>"
# It sets these variables in the caller's shell:
#     TURN_TEXT        every assistant text block since the last genuine human prompt, joined
#     TURN_N           length of TURN_TEXT in characters
#     TURN_HEAVY       1 if a schema/migration or security/auth file was edited this turn, else 0
#     TURN_PROD        count of distinct production-code files edited this turn
#     TURN_DISPATCHED  1 if a subagent (Task/Agent) was dispatched this turn, else 0
#     TURN_TIER        TRIVIAL | LITE | REPORT | FULL
#
# This is the single source of the tier logic that validate-response-format.sh and
# codex-adversarial-review.sh both depend on (was duplicated jq + thresholds). Requires jq;
# on any failure it leaves TURN_TEXT empty and TURN_TIER=TRIVIAL so callers fail open.
#
# A turn that dispatched a subagent did work off this transcript -> never TRIVIAL (floors at LITE).
# Benign surfaces (.claude/, docs/, *.md) never raise the tier. schema/security edit or >=3
# production files -> FULL. Thresholds match the original inline logic exactly.

TURN_EXEMPT_MAX=800     # below this, no high-stakes edit, no dispatch -> TRIVIAL (exempt)
TURN_REPORT_MIN=2500    # at/above this, no high-stakes edit -> REPORT floor

classify_turn() {
  local transcript="$1"
  TURN_TEXT=""; TURN_N=0; TURN_HEAVY=0; TURN_PROD=0; TURN_DISPATCHED=0; TURN_TIER="TRIVIAL"
  { [ -n "${transcript:-}" ] && [ -f "$transcript" ]; } || return 0
  command -v jq >/dev/null 2>&1 || return 0

  # Assistant text for THIS turn (every text block after the last genuine human prompt).
  TURN_TEXT=$(jq -rs '
    . as $all
    | ($all | length) as $len
    | [ range(0;$len) as $i
        | $all[$i] as $e
        | select($e.type=="user")
        | ($e.message.content) as $c
        | select( ($c|type=="string")
                  or ( ($c|type=="array")
                       and ([$c[]|select(.type=="text")]|length > 0)
                       and ([$c[]|select(.type=="tool_result")]|length == 0) ) )
        | $i ] as $humans
    | (if ($humans|length)>0 then ($humans|last) else -1 end) as $start
    | [ range($start+1;$len) as $j
        | $all[$j] as $e
        | select($e.type=="assistant")
        | ($e.message.content // [])[]
        | select(.type=="text") | .text ]
    | join("\n")
  ' "$transcript" 2>/dev/null || true)
  TURN_N=${#TURN_TEXT}

  # Edit/dispatch signals for THIS turn -> "<TOOL>\t<file_path>" rows (backslashes normalised).
  local signals
  signals=$(jq -rs '
    . as $all
    | ($all | length) as $len
    | [ range(0;$len) as $i
        | $all[$i] as $e
        | select($e.type=="user")
        | ($e.message.content) as $c
        | select( ($c|type=="string")
                  or ( ($c|type=="array")
                       and ([$c[]|select(.type=="text")]|length > 0)
                       and ([$c[]|select(.type=="tool_result")]|length == 0) ) )
        | $i ] as $humans
    | (if ($humans|length)>0 then ($humans|last) else -1 end) as $start
    | [ range($start+1;$len) as $j
        | $all[$j] as $e
        | select($e.type=="assistant")
        | ($e.message.content // [])[]
        | select(.type=="tool_use")
        | select(.name=="Edit" or .name=="MultiEdit" or .name=="Write" or .name=="NotebookEdit" or .name=="Task" or .name=="Agent")
        | [.name, ((.input.file_path // .input.path // "") | gsub("\\\\";"/"))] | @tsv ]
    | unique | .[]
  ' "$transcript" 2>/dev/null || true)

  local tool file
  while IFS=$'\t' read -r tool file; do
    file=${file%$'\r'}; tool=${tool%$'\r'}
    case "$tool" in
      Task|Agent) TURN_DISPATCHED=1 ;;
    esac
    [ -z "${file:-}" ] && continue
    case "$file" in
      */.claude/*|*/docs/*|*.md) continue ;;
    esac
    case "$file" in
      *.sql|*[Mm]igration*|*[Ff]lyway*|*/migrations/*|*[Ss]ecurity*|*[Aa]uth*|*[Cc]redential*|*.pem|*.key)
        TURN_HEAVY=1 ;;
    esac
    case "$file" in
      *.java|*.kt|*.kts|*.ts|*.tsx|*.js|*.jsx|*.mjs|*.cjs|*.py|*.go|*.rs|*.rb|*.php|*.cs|*.cpp|*.cc|*.c|*.h|*.hpp|*.swift|*.scala)
        TURN_PROD=$((TURN_PROD + 1)) ;;
    esac
  done <<EOF
$signals
EOF
  [ "$TURN_PROD" -ge 3 ] && TURN_HEAVY=1

  if [ "$TURN_HEAVY" = "1" ]; then
    TURN_TIER="FULL"
  elif [ "$TURN_N" -lt "$TURN_EXEMPT_MAX" ]; then
    # Short turn: a subagent dispatch did off-transcript work -> floor at LITE; else exempt.
    if [ "$TURN_DISPATCHED" = "1" ]; then TURN_TIER="LITE"; else TURN_TIER="TRIVIAL"; fi
  elif [ "$TURN_N" -lt "$TURN_REPORT_MIN" ]; then
    TURN_TIER="LITE"
  else
    TURN_TIER="REPORT"
  fi
}
