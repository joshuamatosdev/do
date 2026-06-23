#!/usr/bin/env bash
# PreToolUse(Edit|Write|MultiEdit): docs & spec compliance gate (@docscheck).
#
# When the project registers references/specs in a grounded-docs index, FORCE the agent to verify
# the governed code against the registered source before code lands. Fires ONCE per session: the
# first governed edit is held with a directive to look the spec up and verify compliance; after the
# agent acts on it, the rest of the session proceeds. The always-on CLAUDE.md docscheck rule +
# .claude/ALWAYS-READ.md carry the continuous requirement (and reach subagents, which inherit
# CLAUDE.md but not this hook's one-shot marker).
#
# SCOPED: only fires where do is installed AND a grounded-docs index actually exists -- a project
# with no registered reference/spec has nothing to enforce, so the hook is a no-op there.
# FAIL-OPEN: any missing input -> exit 0. Never wedge editing on this gate.
set -uo pipefail

proj="${CLAUDE_PROJECT_DIR:-$PWD}"

# Self-gate 1: only in do-installed projects.
[ -f "$proj/.claude/do.manifest.json" ] || exit 0
# Self-gate 2: only where a grounded-docs index exists. Canonical home is grounded-docs/; the legacy
# agent-docs/ name is still honored. Name- and runtime-agnostic (a Node or Python index both count).
idx=""
for home in grounded-docs agent-docs; do [ -d "$proj/$home" ] && { idx="$home"; break; }; done
[ -n "$idx" ] || exit 0

input=$(cat 2>/dev/null || true)

# Once per session: a marker keyed to the session id. First governed edit holds once; rest pass.
sid=$(printf '%s' "$input" | grep -oE '"session_id"[[:space:]]*:[[:space:]]*"[^"]+"' | head -1 | sed -E 's/.*"([^"]+)"$/\1/')
[ -n "$sid" ] || sid="session"
mark_dir="$proj/.claude/state/docs-check"
mark="$mark_dir/$sid.done"
[ -f "$mark" ] && exit 0
mkdir -p "$mark_dir" 2>/dev/null || true
: > "$mark" 2>/dev/null || true

echo "do docscheck: grounded-docs index found ($idx/). Before editing governed code, lookup/cite the source, verify compliance, then retry. Need chunk_id + source_path:line. Node: node $idx/grounded-docs.mjs lookup \"<topic>\"; node $idx/grounded-docs.mjs cite <chunk_id>. Python index: use its lookup/cite CLI. Rule: .claude/ALWAYS-READ.md. Fires once/session." >&2
exit 2
