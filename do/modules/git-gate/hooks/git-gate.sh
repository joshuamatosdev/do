#!/usr/bin/env bash
# PreToolUse(Bash|PowerShell): default-deny git allowlist. Only read-only / explicitly-safe git
# forms pass; anything that mutates refs, the index, the working tree, or rewrites history is
# blocked with a reason. Non-git commands pass through. The decision logic lives in git-gate.cjs
# (a faithful, tuned allowlist); node is a plugin requirement.
set -euo pipefail
# OPT-IN MODULE: this hook is plugin-declared, so it loads in EVERY plugin-enabled project, but it
# self-gates on the git-gate MODULE being opted in -- recorded in .claude/do.manifest.json by
# `/do:run setup --modules=git-gate`. Without the module, destructive git is NOT blocked here.
manifest="${CLAUDE_PROJECT_DIR:-$PWD}/.claude/do.manifest.json"
# Self-gate 1: do must be set up in this project at all.
[ -f "$manifest" ] || exit 0
# node absent -> fail OPEN (do not break the shell). The companion policy needs node to decide.
command -v node >/dev/null 2>&1 || exit 0
# Self-gate 2: only enforce where the git-gate module is recorded in manifest.modules.
node -e 'const fs=require("fs");try{const m=JSON.parse(fs.readFileSync(process.argv[1],"utf8"));process.exit((m.modules||[]).includes("git-gate")?0:1)}catch(e){process.exit(1)}' "$manifest" 2>/dev/null || exit 0
# git-gate.cjs sits next to this script. Use dirname "$0" verbatim (no cd/pwd) so the path keeps
# the node-readable form Claude Code passed (a pwd in Git Bash would emit an MSYS /c/... path
# that node.exe cannot resolve).
exec node "$(dirname "$0")/git-gate.cjs"
