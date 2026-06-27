#!/usr/bin/env bash
# PreToolUse(Bash|PowerShell): route Codex consults through the do:codex skill.
#
# A direct `codex exec` / `codex.sh` run (without the skill's internal marker) is blocked with a
# redirect to the do:codex skill, which applies the scrub + transcript-forward + verbatim-return
# discipline a raw call skips. Non-codex commands, codex-file INSPECTION, the test suite, and
# non-consult codex subcommands pass. Decision logic lives in route-codex-to-skill.cjs.
set -euo pipefail
# Self-gate: this hook is plugin-declared, so it loads in EVERY plugin-enabled project. Only enforce
# where /do:run setup opted this project in -- install writes .claude/do.manifest.json.
[ -f "${CLAUDE_PROJECT_DIR:-$PWD}/.claude/do.manifest.json" ] || exit 0
# node absent -> fail OPEN (do not break the shell). The decision logic needs node. The user kill
# switch (DO_CODEX_ROUTE_OFF=1) is honored inside the .cjs so it works on every host.
command -v node >/dev/null 2>&1 || exit 0
# Use dirname "$0" verbatim (no cd/pwd) so the path keeps the node-readable form Claude Code passed
# (a pwd in Git Bash would emit an MSYS /c/... path node.exe cannot resolve).
exec node "$(dirname "$0")/route-codex-to-skill.cjs"
