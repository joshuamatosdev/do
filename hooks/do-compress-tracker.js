#!/usr/bin/env node
// UserPromptSubmit: apply /do:run compress <level> (or NL), then re-inject a reminder if active.
const { decideLevel, safeWriteFlag, clearFlag, readFlag } = require("./do-compress-config");

let input = "";
process.stdin.on("data", (c) => (input += c));
process.stdin.on("end", () => {
  try {
    const data = JSON.parse(input || "{}");
    const d = decideLevel(data.prompt || "");
    if (d.action === "set") safeWriteFlag(d.level);
    else if (d.action === "clear") clearFlag();

    const level = readFlag();
    if (level) {
      const reminder = level === "strict"
        ? "DO-COMPRESS strict: shortest plain text in common words (google-10000) + technical allowlist; drop articles/filler; fragments OK; arrows for cause; code/errors/identifiers verbatim; write in full for security/irreversible/ambiguous."
        : "DO-COMPRESS plain: drop filler/hedging/pleasantries; full sentences; prefer common words; keep technical terms.";
      process.stdout.write(JSON.stringify({
        hookSpecificOutput: { hookEventName: "UserPromptSubmit", additionalContext: reminder },
      }));
    }
  } catch (err) {
    process.stderr.write(`do-compress-tracker: ${err.message}\n`);
  }
});
