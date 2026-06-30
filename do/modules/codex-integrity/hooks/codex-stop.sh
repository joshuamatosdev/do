#!/usr/bin/env bash
# codex-stop.sh — unified Codex Stop hook. ONE Stop registration replacing the former split hooks.
# Each concern
# self-gates on its OWN module, so codex-integrity and codex-frontier stay independently installable:
#
#   A. codex-integrity (module: codex-integrity)
#        - adversarial mode (default ON): run Codex adversarially over the turn, BLOCK on anything
#          flagged. Codex unavailable / scrub-fail -> stderr advisory naming do:change-skeptic.
#        - advisory mode (flag "off"):     emit a stderr reminder to run the review (no Codex call).
#   B. codex-frontier (module: codex-frontier)
#        - discovered frontier + ADR/spec alignment -> BLOCK with a directive to consult DO:MON.
#
# Behavior-preserving merge: each concern keeps its own Codex path (integrity calls Codex in-hook;
# codex-frontier blocks and Claude makes the reasoner consult). The shared prologue (recursion guard, manifest
# gate, transcript) runs ONCE. When both concerns BLOCK in one turn their reasons are combined into a
# SINGLE block. FAIL-OPEN throughout: any infra failure degrades to advisory, never a hard wedge.
set -uo pipefail

input=$(cat 2>/dev/null || true)

# jq drives the recursion guard, transcript parse, and block emission. The ADVISORY branch
# (codex-integrity with adversarial mode off) needs NONE of those, so jq is not a hard requirement:
# without it we skip the jq-dependent branches but still emit the advisory reminder.
have_jq=0; command -v jq >/dev/null 2>&1 && have_jq=1

# Recursion guard (shared): a block re-prompts once; let the consult's own stop through.
if [ "$have_jq" = 1 ]; then
  active=$(printf '%s' "$input" | jq -r '.stop_hook_active // false' 2>/dev/null || echo false)
else
  active=$(printf '%s' "$input" | grep -q '"stop_hook_active"[[:space:]]*:[[:space:]]*true' && echo true || echo false)
fi
[ "$active" = "true" ] && exit 0

proj="${CLAUDE_PROJECT_DIR:-$PWD}"
manifest="$proj/.claude/do.manifest.json"
[ -f "$manifest" ] || exit 0

# Which concerns are opted in (recorded in do.manifest.json)?
has_module() { node -e 'const fs=require("fs");try{const m=JSON.parse(fs.readFileSync(process.argv[1],"utf8"));process.exit((m.modules||[]).includes(process.argv[2])?0:1)}catch(e){process.exit(1)}' "$manifest" "$1" 2>/dev/null; }
integrity_on=0; has_module codex-integrity && integrity_on=1
frontier_on=0;     has_module codex-frontier     && frontier_on=1
[ "$integrity_on" = 0 ] && [ "$frontier_on" = 0 ] && exit 0

# Transcript is REQUIRED by the adversarial + codex-frontier branches, but NOT by the advisory branch
# (which only reminds, based on codex-on-PATH). So extract it softly and guard each branch below.
transcript=""
[ "$have_jq" = 1 ] && transcript=$(printf '%s' "$input" | jq -r '.transcript_path // empty' 2>/dev/null || true)
have_transcript=0; { [ -n "$transcript" ] && [ -f "$transcript" ]; } && have_transcript=1

hookdir="$(cd "$(dirname "$0")" && pwd)"
repo_root="$(cd "$hookdir/../../../.." && pwd)"   # hooks -> codex-integrity -> modules -> do -> repo root

# Accumulators: block reasons are combined into ONE block; advisories print to stderr (non-blocking).
block_reasons=()
advisories=()

# ============================ Concern A: codex-integrity ===================================
if [ "$integrity_on" = 1 ]; then
  flag="${CLAUDE_CONFIG_DIR:-$HOME/.claude}/.do-codex-adversarial-active"
  if [ -f "$flag" ] && [ "$(cat "$flag" 2>/dev/null)" = "off" ]; then
    # ----- advisory mode: only when adversarial is explicitly off
    if command -v codex >/dev/null 2>&1; then
      advisories+=("do codex-integrity: run a Codex integrity review on this integrity-watchlist turn (fire the codex skill). If codex errors or times out, fall back to the do:change-skeptic agent (in-session, degraded).")
    else
      advisories+=("do codex-integrity: codex NOT on PATH -- dispatch the do:change-skeptic agent as the in-session fallback integrity review of this turn (degraded: same-model self-review, weaker than an independent Codex).")
    fi
  elif [ "$have_transcript" = 1 ]; then
    # ----- adversarial mode: ON by default (needs a transcript)
    . "$hookdir/../../../spine/hooks/lib/turn-tier.sh"
    classify_turn "$transcript"
    # Non-trivial gate: a TRIVIAL turn (short, no edits, no dispatch) is not worth a Codex run.
    if [ "${TURN_N:-0}" -ne 0 ] && [ "$TURN_TIER" != "TRIVIAL" ]; then
      text="$TURN_TEXT"
      # SCRUB the turn text before egress to the external LLM. Fail-closed: scrubber missing/erroring
      # -> do NOT send raw text; degrade to the in-session do:change-skeptic advisory.
      if [ -n "${DO_SCRUB_CMD:-}" ]; then
        scrubbed_text=$(printf '%s' "$text" | bash -c "$DO_SCRUB_CMD" 2>/dev/null); scrub_status=$?
      else
        scrubbed_text=$(printf '%s' "$text" | node "$repo_root/lib/do-mon-context.js" --scrub 2>/dev/null); scrub_status=$?
      fi
      if [ "$scrub_status" -ne 0 ] || { [ -n "$text" ] && [ -z "$scrubbed_text" ]; }; then
        advisories+=("do codex-integrity (adversarial mode): secret scrubber unavailable -- refusing to send unscrubbed turn text to Codex; run the do:change-skeptic agent as the in-session adversarial review of this turn (fail-open: infra failure does not block).")
      else
        pkt=$(mktemp 2>/dev/null || echo "${TMPDIR:-/tmp}/do-adv-$$.txt")
        # Empower mode (DEFAULT, owner directive 2026-06-30): codex reviews at MAXIMAL depth AND
        # applies the fix directly when it judges one better -- not advise-only. Kill switch
        # ASK_CODEX_ALLOW_EDITS=0 forces read-only/advise (mirrors skills/codex/codex.sh).
        # SECURITY: the secret-scrub before egress (run-integrity step 2) is UNCHANGED and still
        # fail-closed -- empowering WRITE does NOT relax the egress scrub.
        if [ "${ASK_CODEX_ALLOW_EDITS:-}" = "0" ]; then
          adv_sandbox="read-only"
          adv_act='You have READ-ONLY access this run -- do NOT edit. Report each finding and the exact fix you would apply.'
        else
          adv_sandbox="workspace-write"
          adv_act='You have full workspace access (read AND write). When a problem is real and a correct, COMPLETE fix is within reach, APPLY it directly -- edit the repo and adjust/add its tests; do not merely advise, defer, stub, or ship a partial patch. State exactly what you changed. If a problem is real but you should NOT fix it autonomously (irreversible, needs a human decision, or out of scope), say so and leave it for the user.'
        fi
        {
          echo "ADVERSARIAL INTEGRITY REVIEW -- maximal effort, no shallow pass. You are a Distinguished"
          echo "Engineer reviewing the assistant's most recent turn in this repository. Assume failure."
          echo
          echo "Do NOT judge from the pasted turn text alone. GROUND the review in the actual repo: read the"
          echo "changed files, the surrounding code, and the tests; verify every claim against what is on disk."
          echo "Be exhaustive across: correctness; the invariants (security, tenant/authz isolation, data"
          echo "integrity, contracts, auditability, failure behavior); feature loss; stub/fixture-only delivery;"
          echo "hidden behavior changes; bugs introduced or left unfixed; discovered frontier work left undone;"
          echo "dropped blockers/options; and tech debt created or preserved."
          echo
          echo "$adv_act"
          echo
          echo "End with exactly one final line:"
          echo "DECISION: ALLOW   (turn is correct and complete; nothing left to fix)"
          echo "DECISION: BLOCK   followed by a numbered list of what remains (and what you changed, if anything)"
          echo
          echo "=== TURN WORK (assistant text this turn) ==="
          printf '%s\n' "$scrubbed_text"
        } > "$pkt" 2>/dev/null
        runner="$hookdir/../run-integrity.sh"
        if [ -f "$runner" ]; then
          if [ -z "${INTEGRITY_CODEX_CMD:-}" ] && command -v codex >/dev/null 2>&1; then
            # Maximal, consistent invocation -- mirrors skills/codex/codex.sh (the proven path on this
            # host): pin gpt-5.5 + xhigh + priority, and use the bypass flag because genuine sandboxing
            # is broken on this Windows host. -s carries the sandbox intent (workspace-write by default,
            # read-only under the kill switch). One literal arg per line: no shell parse, no injection.
            export INTEGRITY_CODEX_ARGV="exec
--dangerously-bypass-approvals-and-sandbox
-s
$adv_sandbox
-m
gpt-5.5
-c
model_reasoning_effort=\"xhigh\"
-c
service_tier=\"priority\"
-C
$proj
-"
          fi
          export INTEGRITY_CODEX_TIMEOUT="${INTEGRITY_CODEX_TIMEOUT:-600}"
          # Detect codex's OWN edits this run so external writes are SEEN before stop. A plain status
          # delta would MISS a codex re-edit of a file Claude already changed (same status line) -- the
          # common turn-end case -- so snapshot status --porcelain PLUS a hash of the unstaged diff
          # (content). Best-effort: cleanly no-ops when git is absent or $proj is not a repo.
          adv_have_git=0; adv_changed=0; adv_pre=""
          command -v git >/dev/null 2>&1 && adv_have_git=1
          adv_snap() { ( cd "$proj" 2>/dev/null || exit 0; git status --porcelain 2>/dev/null; git diff 2>/dev/null | git hash-object --stdin 2>/dev/null ); }
          [ "$adv_have_git" = 1 ] && adv_pre=$(adv_snap)
          out=$(bash "$runner" "$pkt" 2>/dev/null || true)
          rm -f "$pkt" 2>/dev/null || true
          [ "$adv_have_git" = 1 ] && [ "$(adv_snap)" != "$adv_pre" ] && adv_changed=1
          if printf '%s' "$out" | grep -q '^SOURCE: codex'; then
            verdict=$(printf '%s' "$out" | sed 's/^SOURCE: codex//')
            worktree=""
            [ "$adv_have_git" = 1 ] && worktree=$( cd "$proj" 2>/dev/null && git status --porcelain 2>/dev/null || true )
            # Audit log: persist the review so external writes are inspectable after the fact.
            log_dir="$proj/.claude/state/codex-integrity"
            if mkdir -p "$log_dir" 2>/dev/null; then
              ts=$(date -u +%Y%m%dT%H%M%SZ 2>/dev/null || echo review)
              {
                echo "codex-integrity review @ ${ts}  sandbox=${adv_sandbox}  model=gpt-5.5 reasoning=xhigh tier=priority  codex_edited=${adv_changed}"
                echo "---- worktree (git status --porcelain) ----"
                printf '%s\n' "$worktree"
                echo "---- codex verdict ----"
                printf '%s\n' "$verdict"
              } > "$log_dir/review-${ts}-$$.log" 2>/dev/null || true
            fi
            if [ "$adv_changed" = 1 ]; then
              # Codex EDITED the repo this turn -> surface it and require verification before stop.
              block_reasons+=("Codex (turn-end integrity review, workspace-write) EDITED the repo this turn. External-LLM writes must be reviewed before you stop. Current worktree changes (your turn + codex's edits):
$worktree
Verify now: run 'git diff' to see exactly what codex changed, run the project tests, confirm it is correct and complete -- then re-emit. Codex verdict:
$verdict")
            elif ! printf '%s' "$out" | grep -q 'DECISION: ALLOW'; then
              block_reasons+=("Adversarial Codex review flagged this turn (codex-integrity adversarial mode: block-on-anything-flagged). Address the issues, then re-emit. Codex verdict:
$verdict")
            fi
          else
            advisories+=("do codex-integrity (adversarial mode): Codex unavailable -- run the do:change-skeptic agent as the in-session adversarial review of this turn (fail-open: infra failure does not block).")
          fi
        else
          rm -f "$pkt" 2>/dev/null || true
        fi
      fi
    fi
  fi
fi

# ============================ Concern B: codex-frontier =======================================
if [ "$frontier_on" = 1 ] && [ "${CODEX_FRONTIER_OFF:-}" != "1" ] && [ "$have_transcript" = 1 ]; then
  # Decline-respect: if the user rejected a consult or interrupted a tool call recently, stay quiet.
  if ! tail -c 200000 "$transcript" 2>/dev/null | grep -qiE "doesn't want to proceed|request interrupted by user"; then
    # Branch 1: open non-[EXTERNAL-INPUT] items in the most recent assistant turn.
    last_assistant=$(jq -rs '
      [ .[] | select(.type=="assistant")
        | (.message.content) as $c
        | if ($c|type=="string") then $c
          else ([$c[]? | select(.type=="text") | .text] | join("\n")) end ]
      | last // ""
    ' "$transcript" 2>/dev/null || true)
    frontier=$(printf '%s\n' "$last_assistant" | grep -E '^[[:space:]]*-[[:space:]]*\[ \]' | grep -vE '\[EXTERNAL-INPUT\]' || true)

    # Branch 2: code changed THIS turn (Edit/Write/NotebookEdit since the last user message).
    changed=$(jq -rs '
      (map(.type=="user") | rindex(true)) as $lu
      | .[ (($lu // -1) + 1) : ]
      | [ .[] | select(.type=="assistant") | .message.content[]?
          | select(.type=="tool_use")
          | select(.name=="Edit" or .name=="Write" or .name=="NotebookEdit")
          | (.input.file_path // .input.notebook_path // empty) ]
      | .[]
    ' "$transcript" 2>/dev/null || true)
    code_changed=$(printf '%s\n' "$changed" | grep -iE '\.(js|mjs|cjs|ts|tsx|jsx|vue|svelte|py|java|kt|kts|go|rs|rb|sh|bash|c|cc|cpp|h|hpp|cs|php|swift|scala|sql|gradle)$' || true)

    # Alignment only where an ADR catalog or grounded-docs spec index is registered (@docscheck).
    adr_present=0
    { [ -d "$proj/docs/adr" ] && ls "$proj"/docs/adr/*.md >/dev/null 2>&1; } && adr_present=1
    [ -f "$proj/grounded-docs/grounded-docs.mjs" ] && adr_present=1
    [ -d "$proj/agent-docs" ] && adr_present=1
    align=""
    { [ -n "$code_changed" ] && [ "$adr_present" = "1" ]; } && align=1

    if [ -n "$frontier" ] || [ -n "$align" ]; then
      do_mon_brief='DO:MON automated reasoner: run the do:mon skill (ChatGPT). Send the smallest scrubbed prompt that includes relevant code, local evidence, failing output, and the specific decision. Ask it to act as a senior tech-lead and AI creator of transforms: provide code where useful, discuss implementation ideas, definition of done, acceptance criteria, tradeoffs, and the long-term scalable solution. Treat the answer as advisory; verify it against code/tests, choose the best path, then act this turn. The user can interrupt the session if they disagree; do not stop waiting for user interjection.'
      if [ "${ASK_CODEX_ALLOW_EDITS:-}" = "0" ]; then
        fix_clause='ALIGN: codex edits are disabled this run (ASK_CODEX_ALLOW_EDITS=0) -- have DO:MON propose the fix, apply it yourself, then verify. If DO:MON advice is insufficient, dispatch do:distinguished-engineer / do:test-engineer and continue this turn.'
      else
        fix_clause='ALIGN: consult DO:MON first; codex edits are enabled by default, so you may take the Codex edit path -- verify the direct edits before continuing. If the advice is insufficient, dispatch do:distinguished-engineer / do:test-engineer and continue this turn.'
      fi
      sections=()
      [ -n "$frontier" ] && sections+=("$(printf 'WORK FRONTIER:\n%s\n1. Finish the requested objective.\n2. Classify discovered work.\n3. Immediately drain the discovered-work frontier when it is safe, relevant, and tool-executable.\n4. Stop only when the frontier contains no worthwhile safe work, or only user-owned/irreversible decisions remain.\nClean up agent-owned processes before stopping. Terminate dev servers, watchers, worker pools, hook/helper shells, and background toolchain commands you started; do not kill shared or user-owned processes unless the user explicitly authorizes it.\nAgent-created rollout / flip / readiness gates are frontier work, not terminal user decisions.\nExecution loop: objective -> required fixes -> verification -> discovered frontier -> drain -> verify -> stop.' "$frontier")")
      [ -n "$align" ] && sections+=("$(printf 'ADR/SPEC: changed code has a registered ADR/spec. Per @docscheck, review via docs/adr or grounded-docs lookup/cite. If divergent, %s If no source governs, say so and proceed.' "$fix_clause")")
      body=$(printf '%s\n\n' "${sections[@]}")
      block_reasons+=("$(printf '[CODEX-FRONTIER] Before stopping:\n\n%s\nConsult DO:MON via the do:mon skill for these review(s), weigh advice against code/docs, then act this turn. %s Fires once.' "$body" "$do_mon_brief")")
    fi
  fi
fi

# ============================ Combine outcomes ============================================
# Advisories are non-blocking reminders -> stderr. Block reasons (from either concern) -> ONE block.
if [ "${#advisories[@]}" -gt 0 ]; then
  for a in "${advisories[@]}"; do [ -n "$a" ] && printf '%s\n' "$a" >&2; done
fi
if [ "${#block_reasons[@]}" -gt 0 ]; then
  combined=$(printf '%s\n\n' "${block_reasons[@]}")
  jq -nc --arg r "$combined" '{decision:"block", reason:$r}'
fi
exit 0
