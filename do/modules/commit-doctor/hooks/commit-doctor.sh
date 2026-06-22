#!/usr/bin/env bash
# PostToolUse hook (commit-doctor module) — fires after Bash tool calls.
# Detects a FAILED `git commit` and emits additionalContext telling Claude to
# dispatch the do:commit agent to heal the failure. Self-gates on the
# commit-doctor module being recorded in the project's do.manifest.json.
#
# Retry state lives in <project>/.claude/incidents/.doctor-retry-state.json,
# keyed by a hash of the commit command, so a NEW commit command resets the
# counter automatically. Ported from an internal commit-doctor.sh; rewired
# to resolve the project from the hook payload (no hard-coded workspace path)
# and to dispatch the portable do:commit agent.

set -uo pipefail

payload=$(cat)

# Resolve the project dir (where the manifest + incident log live).
project="${CLAUDE_PROJECT_DIR:-$PWD}"

# Self-gate: only act where the commit-doctor module was installed.
manifest="$project/.claude/do.manifest.json"
[ -f "$manifest" ] || exit 0
node -e 'const fs=require("fs");try{const m=JSON.parse(fs.readFileSync(process.argv[1],"utf8"));process.exit((m.modules||[]).includes("commit-doctor")?0:1)}catch(e){process.exit(1)}' "$manifest" 2>/dev/null || exit 0

# Gate 1: only the Bash tool.
tool_name=$(printf '%s' "$payload" | jq -r '.tool_name // empty' 2>/dev/null)
[ "$tool_name" = "Bash" ] || exit 0

# Gate 2: command contains "git commit" (--amend/--no-verify are gate-blocked by default unless the user opts in).
cmd=$(printf '%s' "$payload" | jq -r '.tool_input.command // empty' 2>/dev/null)
printf '%s' "$cmd" | grep -qE \
  '(^|[[:space:]&;|])git([[:space:]]+(-[[:alpha:]][^[:space:]]*|--[^[:space:]=]+)([[:space:]]+[^[:space:]&;|]+|=[^[:space:]&;|]+)?)*[[:space:]]+commit([[:space:]]|$)' \
  || exit 0

# Gate 3: command failed.
exit_code=$(printf '%s' "$payload" | jq -r \
  '.tool_response.exit_code // .tool_response.exitCode // 0' 2>/dev/null)
case "$exit_code" in
  0|"") exit 0 ;;
esac

# Extract failure output (combine stdout + stderr).
output=$(printf '%s' "$payload" | jq -r \
  '(.tool_response.output // "") + "\n" + (.tool_response.stderr // "")' 2>/dev/null \
  | head -c 3000)

cwd=$(printf '%s' "$payload" | jq -r '.cwd // empty' 2>/dev/null)
[ -n "$cwd" ] || cwd="$project"

# --- Retry state ---
incidents_dir="$project/.claude/incidents"
state_file="$incidents_dir/.doctor-retry-state.json"
mkdir -p "$incidents_dir"

# Hash the commit command (new commit command => reset counter).
cmd_hash=$(printf '%s' "$cmd" | { command -v sha256sum >/dev/null 2>&1 && sha256sum || shasum -a 256; } 2>/dev/null | cut -c1-16 \
           || printf '%s' "$cmd" | cksum | awk '{print $1}')

retry_count=0
if [ -f "$state_file" ]; then
  stored_hash=$(jq -r '.cmd_hash // ""' "$state_file" 2>/dev/null || true)
  if [ "$stored_hash" = "$cmd_hash" ]; then
    retry_count=$(jq -r '.retry_count // 0' "$state_file" 2>/dev/null || echo 0)
  fi
fi

new_retry=$((retry_count + 1))

jq -nc --arg h "$cmd_hash" --argjson rc "$new_retry" \
  '{cmd_hash: $h, retry_count: $rc}' > "$state_file"

# --- Max retries exceeded ---
if [ "$new_retry" -ge 4 ]; then
  ts=$(date -u +%Y%m%dT%H%M%S 2>/dev/null || date +%Y%m%dT%H%M%S)
  incident_file="$incidents_dir/incident-${ts}.json"

  jq -nc \
    --arg ts "$ts" \
    --arg repo "$cwd" \
    --arg cmd "$cmd" \
    --arg out "$output" \
    '{
      timestamp: $ts,
      repo: $repo,
      command: $cmd,
      cause: "max-retries-exceeded",
      attempts: 4,
      finalOutput: $out,
      resolved: false,
      action_required: "Maximum automatic retries exceeded. Investigate the failing hook/formatter/linter/test output and fix the root cause before retrying the commit."
    }' > "$incident_file"

  rm -f "$state_file"

  jq -nc --arg f "$incident_file" --arg o "$output" '{
    hookSpecificOutput: {
      hookEventName: "PostToolUse",
      additionalContext: ("COMMIT-DOCTOR: maximum retries (4) exceeded.\nIncident written to: " + $f + "\n\nFinal failure output:\n" + $o + "\n\nDo NOT retry automatically. Present this to the user and request manual intervention.")
    }
  }'
  exit 0
fi

# --- Emit trigger context ---
msg="COMMIT-DOCTOR TRIGGERED (attempt ${new_retry} of 3):

A git commit just failed. Dispatch the do:commit agent now, before any other action, to heal it.

  Agent({
    subagent_type: \"do:commit\",
    description: \"Heal commit failure — attempt ${new_retry}\",
    prompt: \"FAILED_COMMAND: ${cmd}
ATTEMPT_NUMBER: ${new_retry}
REPO_PATH: ${cwd}
FAILURE_OUTPUT:
${output}\"
  })

The do:commit agent classifies the cause, fixes it, re-stages, and retries — never with --no-verify."

jq -nc --arg m "$msg" '{
  hookSpecificOutput: {
    hookEventName: "PostToolUse",
    additionalContext: $m
  }
}'
exit 0
