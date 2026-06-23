#!/usr/bin/env bash
# UserPromptSubmit: snapshot the capability-drop candidate fingerprints ALREADY present in the work
# tree, so the Stop gate (validate-capability-preservation.sh) flags only candidates INTRODUCED this
# turn -- never blames pre-existing dirty sentinels. Writes fingerprints to OS temp keyed by session
# id (never into the repo). Pure plumbing: fail-open everywhere, never blocks, no repo mutation.
set -uo pipefail

input=$(cat 2>/dev/null || true)

proj="${CLAUDE_PROJECT_DIR:-$PWD}"
[ -f "$proj/.claude/do.manifest.json" ] || exit 0   # only where /do:run setup opted this project in
command -v node >/dev/null 2>&1 || exit 0
command -v git  >/dev/null 2>&1 || exit 0
git -C "$proj" rev-parse --is-inside-work-tree >/dev/null 2>&1 || exit 0

sid=""
command -v jq >/dev/null 2>&1 && sid=$(printf '%s' "$input" | jq -r '.session_id // empty' 2>/dev/null || true)
[ -n "$sid" ] || sid="nosession"
sid=$(printf '%s' "$sid" | tr -cd 'A-Za-z0-9._-')

tmp="${TMPDIR:-${TEMP:-/tmp}}"
base="$tmp/do-cap-baseline-$sid.txt"

hookdir="$(cd "$(dirname "$0")" && pwd)"
repo_root="$(cd "$hookdir/../../.." && pwd)"          # hooks -> spine -> do -> repo root
lib="$repo_root/lib/capability-preservation.js"
[ -f "$lib" ] || exit 0

diff_file=$(mktemp 2>/dev/null || echo "$tmp/do-cap-snap-$sid.diff")
git -C "$proj" diff HEAD > "$diff_file" 2>/dev/null || { rm -f "$diff_file" 2>/dev/null || true; exit 0; }
# Size cap: skip the snapshot on a huge surface (the Stop gate caps the same way and stays quiet).
if [ "$(wc -c < "$diff_file" 2>/dev/null || echo 0)" -gt 2000000 ]; then rm -f "$diff_file" 2>/dev/null || true; exit 0; fi

node "$lib" --fingerprints --diff "$diff_file" > "$base" 2>/dev/null || true
rm -f "$diff_file" 2>/dev/null || true
exit 0
