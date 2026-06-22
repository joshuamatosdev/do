#!/usr/bin/env bash
# PreToolUse(Edit|Write): block writes whose content is a stub placeholder.
#
# Why node, not a regex over the raw payload: Claude Code sends the file content JSON-escaped inside
# tool_input.content (Write) / tool_input.new_string (Edit). Matching markers against the raw JSON
# fails open two ways -- a [^}]* span stops at the first `}` (so any code with a brace before the
# marker slips through), and a quote-anchored pattern like Error("not implemented") never matches the
# JSON-escaped bytes Error(\"not implemented\"). So: parse the payload, extract the field, JSON-decode
# it, and test the DECODED string against the markers (case-insensitive). node is a plugin requirement.
set -euo pipefail
# Self-gate: do is a plugin-declared hook, so it loads in EVERY plugin-enabled project. Only enforce
# where /do:run setup opted this project in -- install writes .claude/do.manifest.json.
[ -f "${CLAUDE_PROJECT_DIR:-$PWD}/.claude/do.manifest.json" ] || exit 0
# node absent -> fail OPEN (do not break the editor). Decoding the payload needs node.
command -v node >/dev/null 2>&1 || exit 0

# Read stdin, JSON-parse, pull the written content out of the tool payload, JSON-decode is already
# done by JSON.parse (the field value is the real string), then scan the DECODED string for stub
# markers. Missing field / parse error / no content -> exit 0 (allow). A marker -> exit 2 (block).
node -e '
  let raw = "";
  process.stdin.setEncoding("utf8");
  process.stdin.on("data", (d) => { raw += d; });
  process.stdin.on("end", () => {
    let payload;
    try { payload = JSON.parse(raw || "{}"); } catch { process.exit(0); } // not our shape -> allow
    const ti = (payload && payload.tool_input) || {};
    const content = ti.content != null ? ti.content : ti.new_string; // Write: content; Edit: new_string
    if (typeof content !== "string" || content.length === 0) process.exit(0); // nothing to judge -> allow
    // Stub markers, matched case-insensitively against the decoded source. No brace-span, no quote
    // anchoring -- the JSON.parse already gave us the real characters (a `"` is a `"`, not `\"`).
    const MARKERS = [
      /TODO:\s*implement/i,
      /FIXME:\s*stub/i,
      /not\s+implemented/i,                          // covers Error("not implemented"), # not implemented, etc.
      /\bunimplemented\b/i,
      /\bNotImplementedError\b/i,                    // python raise NotImplementedError
      /\bunimplemented!\s*\(/i,                      // rust unimplemented!()
      /\btodo!\s*\(/i,                               // rust todo!()
    ];
    if (MARKERS.some((re) => re.test(content))) {
      process.stderr.write("do: stub/placeholder write blocked. Implement it or say why it is N/A.\n");
      process.exit(2);
    }
    process.exit(0);
  });
'
