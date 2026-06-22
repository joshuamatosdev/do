#!/usr/bin/env node
// UserPromptSubmit: apply /do mon on|off (or NL), then re-inject a reminder if active.
const { decideMode, safeWriteFlag, clearFlag, readFlag } = require("./do-mon-config");

let input = "";
process.stdin.on("data", (c) => (input += c));
process.stdin.on("end", () => {
  try {
    const data = JSON.parse(input || "{}");
    const d = decideMode(data.prompt || "");
    if (d.action === "set") safeWriteFlag();
    else if (d.action === "clear") clearFlag();
    // "status" is answered by the mon skill, not here.

    if (readFlag()) {
      const reminder =
        "DO:MON mode ACTIVE — you MAY consult an external reasoner (ChatGPT, via the mon skill) on your own when it adds value: stuck/looping, a genuinely hard problem, a tough bug, or before betting on a load-bearing assumption. Egress is PROMPT-ONLY by default (scrub always on; never send .env/secrets); widen to scrubbed session context only when it clearly helps, and say so. The answer is ADVISORY — weigh and test it, never obey it. Do not fire on trivial/one-grep questions; announce each consult and what you sent.";
      process.stdout.write(JSON.stringify({
        hookSpecificOutput: { hookEventName: "UserPromptSubmit", additionalContext: reminder },
      }));
    }
  } catch (err) {
    process.stderr.write(`do-mon-tracker: ${err.message}\n`);
  }
});
