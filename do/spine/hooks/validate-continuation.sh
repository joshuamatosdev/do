#!/usr/bin/env bash
# Stop hook: SEMANTIC continuation gate. Where validate-response-format.sh checks report SHAPE,
# this checks COMPLETION -- it blocks a turn that is ENDING while its own response still lists
# actionable work (an open "- [ ]" item not tagged [USER]), a passive
# "awaiting your direction" hand-back, or a question mark (owner act-and-finish policy: ACT and FINISH the work, not hand it back -- never end a
# turn asking the user -- ACT, or tag a real [USER] decision phrased without a question mark).
# Implements the "Never stop; escalate" policy: a CLAIMED blocker, or repeated
# no-progress, routes to a codex --decide go/no-go (block-with-mandate -- the hook tells Claude to
# fire the codex skill on the next continuation; it does NOT call codex itself). Only a Codex HOLD,
# a [USER]-tagged decision, a complete turn, or the hard iteration cap ends it.
#
# Separate from the format gate by design (structural vs. semantic; independently testable).
# Self-gates on .claude/RESPONSE-FORMAT.md so it only runs in do-installed projects.
# FAIL-OPEN: jq missing / no transcript / spec absent / parse error / empty text -> exit 0.
# Loop-bounded: a per-session state file counts blocks + no-progress stalls; a hard cap is the
# ultimate failsafe so this can never loop forever. Design: docs/superpowers/specs/2026-06-19-continuation-gate-design.md
set -uo pipefail

input=$(cat 2>/dev/null || true)

# Fail-open if jq is unavailable.
command -v jq >/dev/null 2>&1 || exit 0

transcript=$(printf '%s' "$input" | jq -r '.transcript_path // empty' 2>/dev/null || true)
[ -n "$transcript" ] || exit 0
[ -f "$transcript" ] || exit 0

# Self-gate: only act where the do response-format spec is installed.
SPEC_FILE="${CLAUDE_PROJECT_DIR:-$PWD}/.claude/RESPONSE-FORMAT.md"
[ -f "$SPEC_FILE" ] || exit 0

# Tunables (env-overridable).
MAX=${DO_CONTINUATION_MAX:-25}        # hard cap on consecutive blocks before failsafe ALLOW
K=${DO_CONTINUATION_STALL:-2}         # consecutive no-progress blocks before escalating to codex
case "$MAX" in (*[!0-9]*|'') MAX=25;; esac
case "$K"   in (*[!0-9]*|'') K=2;;   esac

# --- Assistant text for THIS turn (every text block since the last genuine human prompt). -----
# Same human-boundary logic as validate-response-format.sh so "the turn" means the same thing.
text=$(jq -rs '
  . as $all | ($all|length) as $len
  | [ range(0;$len) as $i | $all[$i] as $e
      | select($e.type=="user")
      | ($e.message.content) as $c
      | select( ($c|type=="string")
                or ( ($c|type=="array")
                     and ([$c[]|select(.type=="text")]|length>0)
                     and ([$c[]|select(.type=="tool_result")]|length==0) ) )
      | $i ] as $humans
  | (if ($humans|length)>0 then ($humans|last) else -1 end) as $start
  | [ range($start+1;$len) as $j | $all[$j] as $e
      | select($e.type=="assistant")
      | ($e.message.content // [])[] | select(.type=="text") | .text ]
  | join("\n")
' "$transcript" 2>/dev/null || true)

# Nothing to judge -> fail-open.
[ -n "$text" ] || exit 0

# --- tool_use count THIS turn (progress signal). ----------------------------------------------
toolcount=$(jq -rs '
  . as $all | ($all|length) as $len
  | [ range(0;$len) as $i | $all[$i] as $e
      | select($e.type=="user")
      | ($e.message.content) as $c
      | select( ($c|type=="string")
                or ( ($c|type=="array")
                     and ([$c[]|select(.type=="text")]|length>0)
                     and ([$c[]|select(.type=="tool_result")]|length==0) ) )
      | $i ] as $humans
  | (if ($humans|length)>0 then ($humans|last) else -1 end) as $start
  | [ range($start+1;$len) as $j | $all[$j] as $e
      | select($e.type=="assistant")
      | ($e.message.content // [])[] | select(.type=="tool_use") ] | length
' "$transcript" 2>/dev/null || echo 0)
case "$toolcount" in (*[!0-9]*|'') toolcount=0;; esac

# --- Signals over the turn text. --------------------------------------------------------------
# Open checkbox items: any "- [ ]" line. Only a [USER] decision can be non-actionable.
# [LATER] is not an escape hatch. Open non-[USER] work is frontier work.
# Drain safe, relevant, tool-executable frontier work before stopping.
open_lines=$(printf '%s' "$text" | grep -E '^[[:space:]]*-[[:space:]]*\[ \]' || true)
untagged_open=0; has_open=0; action_user=0; user_action_lines=""
if [ -n "$open_lines" ]; then
  has_open=1
  printf '%s' "$open_lines" | grep -qvE '\[USER\]' && untagged_open=1
  # A [USER] tag legitimately ENDS the turn ONLY when it encodes a DECISION the user must make (a
  # choice: approve / which / whether / pick). A [USER] item phrased as a doable ACTION (restart,
  # run, commit, build, install, deploy, fix, ...) is the agent handing back its OWN work -- that
  # must NOT end the turn. Decision-worded [USER] items are exempt first, so a genuine "choose A or
  # B" never gets stuck. Closes the park-doable-work-as-[USER] escape hatch (the "[USER] restart the
  # backend" hand-back that should have just been done).
  user_lines=$(printf '%s' "$open_lines" | grep -E '\[USER\]' || true)
  if [ -n "$user_lines" ]; then
    user_action_lines=$(printf '%s' "$user_lines" \
      | grep -viE '\b(choose|choice|decide|decision|whether|which|approve|approval|pick|prefer|consent|sign[- ]?off|go/?no-?go|trade-?off)\b' \
      | grep -iE '\b(restart|reboot|re-?run|rerun|run|start|stop|commit|push|pull|build|rebuild|deploy|redeploy|install|reinstall|uninstall|fix|add|remove|delete|drop|update|upgrade|sync|resync|re-?sync|wire|enable|disable|configure|create|write|merge|rebase|revert|rollback|bump|patch|migrate|seed|launch|execute|exec|apply|generate|regenerate|refactor|rename|move|copy|implement|finish|complete|provision|scaffold|kill)\b' \
      || true)
    [ -n "$user_action_lines" ] && action_user=1
  fi
fi

# Passive hand-back phrasing.
idle=0
printf '%s' "$text" | grep -qiE 'awaiting your direction|awaiting (your )?(further )?(direction|instruction|guidance)|no immediate actions|nothing (more )?(else )?to do|nothing outstanding|let me know how you( ?| woul)d like|standing by( for)?|ready for your direction' && idle=1

# Claimed blocker.
blocker=0
printf '%s' "$text" | grep -qiE "blocked on|not mine|foreign[- ]?blocked|foreign owner|can'?t (because|until|do this until)|out of scope for this turn|gated on|waiting on (the )?(foreign|external|owner)" && blocker=1

# Owner policy (act-and-finish): ACT and FINISH the work, don't hand it back -- a LITERAL question mark fires the
# gate. Do NOT end a turn asking the user -- ACT on the answer, or record a genuine user-only
# decision as '- [ ] [USER] <choice>' phrased WITHOUT a question mark. Literal match by design: no
# phrase list, no heuristics -- the character itself is the condition (owner directive 2026-06-20).
#
# But a '?' inside CODE is not a question to the user: optional-chaining (?.), nullish (??), a
# ternary, a regex, a URL query, etc. Strip CODE spans first -- fenced blocks (``` ... ```) and
# inline spans (` ... `) -- then apply the literal-? rule to the remaining PROSE only. Other signals
# above (open checkboxes, idle, blocker) still read the full $text; only the '?' check is prose-only.
prose=$(printf '%s' "$text" | awk '
  BEGIN { infence = 0 }
  {
    line = $0
    # Toggle on a fence line (first non-space token is ``` , optionally with a lang/info string);
    # drop the fence line itself and every line inside the fenced block.
    if (line ~ /^[[:space:]]*```/) { infence = !infence; next }
    if (infence) { next }
    # Remove inline code spans (shortest ` ... ` runs) from surviving prose lines.
    gsub(/`[^`]*`/, "", line)
    print line
  }
' 2>/dev/null || printf '%s' "$text")
question=0
printf '%s' "$prose" | grep -qF '?' && question=1

# --- ALLOW conditions. ------------------------------------------------------------------------
state_dir="${CLAUDE_PROJECT_DIR:-$PWD}/.claude/state/continuation"
sid=$(printf '%s' "$input" | jq -r '.session_id // empty' 2>/dev/null || true)
[ -n "$sid" ] || sid=$(basename "$transcript" 2>/dev/null | tr -cd 'A-Za-z0-9._-')
[ -n "$sid" ] || sid="session"
state_file="$state_dir/$sid.json"

allow_clean() { rm -f "$state_file" 2>/dev/null || true; exit 0; }

# 1. There IS open work but every open item is a legitimate [USER] DECISION
#    -> nothing actionable remains in scope -> ALLOW. A [USER] item that is really a
#    doable ACTION (action_user=1) does NOT qualify -- the agent must do it, not hand it back. A
#    question mark (question=1) also disqualifies -- the turn is still asking the user something.
if [ "$has_open" = "1" ] && [ "$untagged_open" = "0" ] && [ "$action_user" = "0" ] && [ "$question" = "0" ]; then allow_clean; fi
# 2. No actionable open work (untagged, or a doable [USER] action), no passive hand-back, and no
#    question mark -> ALLOW.
if [ "$untagged_open" = "0" ] && [ "$action_user" = "0" ] && [ "$idle" = "0" ] && [ "$question" = "0" ]; then allow_clean; fi

# --- BLOCK path. Read state, decide layer, write state. ---------------------------------------
mkdir -p "$state_dir" 2>/dev/null || true
blocks=0; stall=0; lastcount=0
if [ -f "$state_file" ]; then
  blocks=$(jq -r '.blocks // 0' "$state_file" 2>/dev/null || echo 0)
  stall=$(jq -r '.stall // 0' "$state_file" 2>/dev/null || echo 0)
  lastcount=$(jq -r '.lastToolCount // 0' "$state_file" 2>/dev/null || echo 0)
fi
case "$blocks"    in (*[!0-9]*|'') blocks=0;;    esac
case "$stall"     in (*[!0-9]*|'') stall=0;;     esac
case "$lastcount" in (*[!0-9]*|'') lastcount=0;; esac

blocks_new=$((blocks + 1))

# Hard cap -> failsafe ALLOW (never loop forever).
if [ "$blocks_new" -gt "$MAX" ]; then
  printf 'do continuation gate: hard cap (%s) reached -- releasing to avoid a loop. If work truly remains, restate the goal or use /goal.\n' "$MAX" >&2
  allow_clean
fi

# Progress = more tool calls this turn than at the last block.
progress=0
[ "$toolcount" -gt "$lastcount" ] && progress=1
if [ "$progress" = "1" ]; then stall_new=0; else stall_new=$((stall + 1)); fi

escalate=0
{ [ "$blocker" = "1" ] || [ "$stall_new" -ge "$K" ]; } && escalate=1

# Quote up to 3 actionable frontier items for the reason.
items=$( { printf '%s\n' "$open_lines" | grep -vE '\[USER\]'; printf '%s\n' "$user_action_lines"; } | grep -E '\[ \]' | head -3 | sed 's/^[[:space:]]*//' | tr '\n' ' ' || true)

frontier_policy="1. Finish the requested objective. 2. Classify discovered work. 3. Immediately drain the discovered-work frontier when it is safe, relevant, and tool-executable. 4. Stop only when the frontier contains no worthwhile safe work, or only user-owned/irreversible decisions remain. Execution loop: objective -> required fixes -> verification -> discovered frontier -> drain -> verify -> stop."

if [ "$escalate" = "1" ]; then
  reason="do continuation gate (Never-Stop-Escalate): blocker/no-progress while frontier work remains. $frontier_policy Run \`codex --decide\`. PROCEED: continue only on a verified safe path. HOLD or irreversible/outward-facing approval: return with \`- [ ] [USER] <choice>\`. If Codex is unavailable, dispatch do:change-skeptic. Frontier work: ${items:-<see your Remaining Steps>}"
else
  reason="do continuation gate: frontier work remains. $frontier_policy \`[USER]\` is only for irreversible/outward-facing choices, never agent-runnable work. Ground local details in code or test a hypothesis. Frontier work: ${items:-<see your Remaining Steps>}"
fi

# Act-and-finish policy: whenever a question mark contributed to the block, name the rule on the
# reason (EVERY path, not only the no-open-work case) so the agent always sees WHY a '?' fired.
if [ "$question" = "1" ]; then
  reason="$reason  --  act-and-finish: a prose question mark means you are asking instead of acting. Act on the answer, ground/test it, or record a real user-only choice as \`- [ ] [USER] <choice>\` without a question mark."
fi

printf '{"blocks":%s,"stall":%s,"lastToolCount":%s}\n' "$blocks_new" "$stall_new" "$toolcount" > "$state_file" 2>/dev/null || true

jq -nc --arg r "$reason" '{decision:"block", reason:$r}'
exit 0
