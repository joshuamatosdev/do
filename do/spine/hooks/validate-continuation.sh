#!/usr/bin/env bash
# Stop hook: SEMANTIC continuation gate -- checks COMPLETION, not report shape.
# It blocks a turn that is ENDING while its own response still lists
# actionable work (an open "- [ ]" item not tagged [EXTERNAL-INPUT]), a passive
# "awaiting your direction" hand-back, or a question mark (owner act-and-finish policy: ACT and FINISH the work, not hand it back -- never end a
# turn asking the user -- ACT, or tag a real [EXTERNAL-INPUT] decision (RoundLog-backed) phrased without a question mark).
# Implements the "Never stop; escalate" policy: a CLAIMED blocker, or repeated
# no-progress, routes to a DO:MON external-reasoner consult (block-with-mandate -- the hook tells
# Claude to fire the do:mon skill on the next continuation; it does NOT call ChatGPT itself).
# Only a verified path, a true EXTERNAL-INPUT terminal (RoundLog-backed), a complete turn, or the hard
# iteration cap ends it.
#
# Semantic, not structural, by design (independently testable).
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
K=${DO_CONTINUATION_STALL:-2}         # consecutive no-progress blocks before escalating to DO:MON
case "$MAX" in (*[!0-9]*|'') MAX=25;; esac
case "$K"   in (*[!0-9]*|'') K=2;;   esac

# --- Assistant text for THIS turn (every text block since the last genuine human prompt). -----
# Same human-boundary logic the do Stop hooks share (see lib/turn-tier.sh) so "the turn" means the same thing.
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
# Open checkbox items: any "- [ ]" line. Only an [EXTERNAL-INPUT] terminal (with a RoundLog) can be
# non-actionable. Legacy escape tags are not escape hatches; [USER] is repealed (a banned token).
# Open non-[EXTERNAL-INPUT] work is frontier work. Drain safe, relevant, tool-executable frontier work
# before stopping.
open_lines=$(printf '%s' "$text" | grep -E '^[[:space:]]*-[[:space:]]*\[ \]' || true)
untagged_open=0; has_open=0; action_user=0; self_gate_user=0; do_mon=0; technical_user=0; repealed_user=0
user_action_lines=""; self_gate_user_lines=""; do_mon_lines=""; technical_user_lines=""; repealed_user_lines=""
if [ -n "$open_lines" ]; then
  has_open=1
  # The terminal tag is [EXTERNAL-INPUT] (terminal-discipline §2/§3). An open item NOT tagged
  # [EXTERNAL-INPUT] is actionable frontier work.
  printf '%s' "$open_lines" | grep -qvE '\[EXTERNAL-INPUT\]' && untagged_open=1
  do_mon_lines=$(printf '%s' "$open_lines" | grep -iE '\[DO:MON\]' || true)
  [ -n "$do_mon_lines" ] && do_mon=1
  # [USER] is REPEALED. Any [USER] checkbox tag -- or a modality of it ([USER: ...], [User],
  # [USER-DECISION]) -- is a banned token: it never earns terminal status and is flagged. Matched only
  # as a checkbox tag, so [USER] appearing in ordinary prose does not trip it.
  repealed_user_lines=$(printf '%s' "$open_lines" | grep -iE '\[[[:space:]]*USER([:_-][^]]*)?[[:space:]]*\]' || true)
  [ -n "$repealed_user_lines" ] && repealed_user=1
  # An [EXTERNAL-INPUT] terminal claim ENDS the turn ONLY when it encodes EXTERNAL-INPUT the agent
  # cannot compute (a credential) or a SAFETY_GATE (irreversible AND outward AND consequential), and
  # carries a RoundLog. A technical/design/hard call goes to DO:MON first; an item phrased as a doable
  # ACTION (restart, run, commit, build, install, deploy, fix, ...) is the agent handing back its OWN
  # work -- neither ends the turn.
  terminal_lines=$(printf '%s' "$open_lines" | grep -E '\[EXTERNAL-INPUT\]' || true)
  if [ -n "$terminal_lines" ]; then
    technical_user_lines=$(printf '%s' "$terminal_lines" \
      | grep -iE '\b(architecture|architectural|design|technical decision|hard call|difficult|complex|approach|implementation idea|definition of done|acceptance criteria|trade-?off|long[- ]term|scalab(le|ility)|outward[- ]?facing)\b' \
      || true)
    if [ -n "$technical_user_lines" ]; then
      technical_user=1
      action_user=1
    fi
    # An [EXTERNAL-INPUT] item is still invalid when it asks the user whether the agent should build,
    # finish, or defer prerequisites the agent itself introduced ("flip-gates", rollout readiness,
    # cutover blockers). Those are frontier work unless an actual irreversible / outward-facing
    # decision remains after implementation is complete.
    self_gate_user_lines=$(printf '%s' "$terminal_lines" \
      | grep -iE '\b(flip[- ]?(gate|gates|readiness|rollout)|leave (it|them )?deferred|deferred until|defer(red)? (until|to) (a )?(scheduled )?(cutover|rollout|release|later)|build .*defer|implement .*defer|finish .*defer)\b' \
      || true)
    if [ -n "$self_gate_user_lines" ]; then
      self_gate_user=1
      action_user=1
    fi
    user_action_lines=$(printf '%s' "$terminal_lines" \
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
# gate. Do NOT end a turn asking the user -- ACT on the answer, or record a genuine EXTERNAL-INPUT
# decision as '- [ ] [EXTERNAL-INPUT] <choice>' (RoundLog-backed) phrased WITHOUT a question mark.
# Literal match by design: no phrase list, no heuristics -- the character itself is the condition (owner directive 2026-06-20).
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

# --- RoundLog (terminal-discipline §5 contract) presence. -------------------------------------
# A TERMINAL / EXTERNAL-INPUT claim is admissible ONLY if it carries a well-formed RoundLog -- the
# §5 struct proving the §4 falsification protocol ran (>=5 lenses, converged, an independent
# concurrence). Presence of the distinctive keys is the satisfiable, checkable bar; full schema
# validation is out of scope for a shell gate. Bare [USER] is repealed: a terminal hand-back with
# no RoundLog is INADMISSIBLE. See .claude/do/terminal-discipline.md.
roundlog=0
if printf '%s' "$text" | grep -q 'RoundLog' \
  && printf '%s' "$text" | grep -q 'trials' \
  && printf '%s' "$text" | grep -q 'converged' \
  && printf '%s' "$text" | grep -q 'concurrence'; then roundlog=1; fi

# --- ALLOW conditions. ------------------------------------------------------------------------
state_dir="${CLAUDE_PROJECT_DIR:-$PWD}/.claude/state/continuation"
sid=$(printf '%s' "$input" | jq -r '.session_id // empty' 2>/dev/null || true)
[ -n "$sid" ] || sid=$(basename "$transcript" 2>/dev/null | tr -cd 'A-Za-z0-9._-')
[ -n "$sid" ] || sid="session"
state_file="$state_dir/$sid.json"

allow_clean() { rm -f "$state_file" 2>/dev/null || true; exit 0; }

# 1. There IS open work but every open item is a legitimate AUTHORITY DECISION (the terminal claim)
#    -> ADMISSIBLE only with a RoundLog (terminal-discipline §5/§6: bare [USER] is repealed -- a
#    terminal must be EARNED by the §4 protocol and carry its log). A [USER] item that is really a
#    technical DO:MON decision or doable ACTION (action_user=1) does NOT qualify; a question mark
#    (question=1) also disqualifies. Without a RoundLog the terminal is INADMISSIBLE -> fall to BLOCK.
inadmissible_terminal=0
if [ "$has_open" = "1" ] && [ "$untagged_open" = "0" ] && [ "$action_user" = "0" ] && [ "$question" = "0" ]; then
  if [ "$roundlog" = "1" ]; then allow_clean; fi
  inadmissible_terminal=1
fi
# 2. No open work at all -> ordinary reversible completion. No RoundLog required (§6: the fixture is
#    optional and usually omitted during ordinary reversible action). ALLOW.
if [ "$inadmissible_terminal" = "0" ] && [ "$untagged_open" = "0" ] && [ "$action_user" = "0" ] && [ "$idle" = "0" ] && [ "$question" = "0" ]; then allow_clean; fi

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
items=$( { printf '%s\n' "$open_lines" | grep -vE '\[EXTERNAL-INPUT\]'; printf '%s\n' "$user_action_lines"; printf '%s\n' "$self_gate_user_lines"; printf '%s\n' "$technical_user_lines"; } | grep -E '\[ \]' | head -3 | sed 's/^[[:space:]]*//' | tr '\n' ' ' || true)

frontier_policy="1. Finish the requested objective. 2. Classify discovered work. 3. Immediately drain the discovered-work frontier when it is safe, relevant, and tool-executable. 4. Stop only when the frontier contains no worthwhile safe work, or only user-owned/irreversible decisions remain. Clean up agent-owned processes before stopping. Terminate dev servers, watchers, worker pools, hook/helper shells, and background toolchain commands you started; do not kill shared or user-owned processes unless the user explicitly authorizes it. Agent-created rollout / flip / readiness gates are frontier work, not terminal user decisions. Execution loop: objective -> required fixes -> verification -> discovered frontier -> drain -> verify -> stop."
do_mon_brief="DO:MON automated reasoner: run the do:mon skill (ChatGPT). Send the smallest scrubbed prompt that includes relevant code, local evidence, failing output, and the specific decision. Ask it to act as a senior tech-lead and AI creator of transforms: provide code where useful, discuss implementation ideas, definition of done, acceptance criteria, tradeoffs, and the long-term scalable solution. Treat the answer as advisory; verify it against code/tests, choose the best path, then act this turn. The user can interrupt the session if they disagree; do not stop waiting for user interjection."

if [ "$escalate" = "1" ]; then
  reason="do continuation gate (Never-Stop-Escalate): blocker/no-progress while frontier work remains. $frontier_policy Run \`do:mon\` with the DO:MON brief. PROCEED: continue only on a verified safe path. HOLD only for true EXTERNAL-INPUT -- a credential the agent cannot compute, or a SAFETY_GATE (irreversible AND outward AND consequential): return with \`- [ ] [EXTERNAL-INPUT] <choice>\` carrying a RoundLog (terminal-discipline §4/§5). If do:mon is unavailable, use codex --decide or dispatch do:change-skeptic. $do_mon_brief Frontier work: ${items:-<see your Remaining Steps>}"
else
  reason="do continuation gate: frontier work remains. $frontier_policy The only terminal is EXTERNAL-INPUT, earned via the §4 falsification protocol and carried as a RoundLog (\`[USER]\` is repealed) -- never agent-runnable work or a technical design decision. Ground local details in code or test a hypothesis. If this is hard, design-sensitive, outward-facing, or difficult, surface it as \`[DO:MON]\` and run \`do:mon\` with the DO:MON brief. $do_mon_brief Frontier work: ${items:-<see your Remaining Steps>}"
fi

# Act-and-finish policy: whenever a question mark contributed to the block, name the rule on the
# reason (EVERY path, not only the no-open-work case) so the agent always sees WHY a '?' fired.
if [ "$question" = "1" ]; then
  reason="$reason  --  act-and-finish: a prose question mark means you are asking instead of acting. Act on the answer, ground/test it, or record a real EXTERNAL-INPUT choice as \`- [ ] [EXTERNAL-INPUT] <choice>\` (with a RoundLog) without a question mark."
fi
if [ "$self_gate_user" = "1" ]; then
  reason="$reason  --  agent-created gate handoff: rollout or flip prerequisites the agent identified are frontier work, not a user decision. Finish them now, or mark the feature incomplete with grounded evidence."
fi
if [ "$technical_user" = "1" ]; then
  reason="$reason  --  technical design decision: do not surface hard architecture, design, acceptance-criteria, tradeoff, or long-term scalability calls as a terminal. Surface them as [DO:MON], consult do:mon, verify the result, and continue."
fi
if [ "$inadmissible_terminal" = "1" ]; then
  reason="$reason  --  terminal-discipline: a TERMINAL / EXTERNAL-INPUT claim is INADMISSIBLE without a RoundLog (§5). Run the §4 falsification protocol (>= 5 lenses: internal-reasoner, consult-reasoner, adversarial-review, creative-analysis, driven-directive, machine-intelligence; converged; an independent concurrence) and carry the RoundLog block, or it is not terminal. See .claude/do/terminal-discipline.md."
fi
if [ "$repealed_user" = "1" ]; then
  reason="$reason  --  [USER] is REPEALED: it is a banned token and never earns terminal status. Resolve the work (AGENT / DERIVE / TEST / CONSULT / PARAMETERIZE / DEFAULT), or assert EXTERNAL-INPUT with a RoundLog (terminal-discipline §2/§3). See .claude/do/terminal-discipline.md."
fi

printf '{"blocks":%s,"stall":%s,"lastToolCount":%s}\n' "$blocks_new" "$stall_new" "$toolcount" > "$state_file" 2>/dev/null || true

jq -nc --arg r "$reason" '{decision:"block", reason:$r}'
exit 0
