// Regression tests for README.md docs-accuracy (public-readiness audit).
// Each test would FAIL on the old README and PASS on the corrected one.
"use strict";
const { test } = require("node:test");
const assert = require("node:assert");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");

const README = readFileSync(join(__dirname, "..", "README.md"), "utf8");

// (1) protect-user-work.sh must be labeled reserved no-op, not advertised as guarding work.
test("protect-user-work.sh is labeled reserved/no-op, not an active guard", () => {
  // Old text advertised it as actively guarding uncommitted work.
  assert.ok(
    !README.includes("(guard uncommitted work)"),
    'README must not advertise protect-user-work.sh as actively guarding uncommitted work'
  );
  // New text must describe it as reserved no-op.
  assert.ok(
    README.includes("reserved no-op"),
    'README must label protect-user-work.sh as reserved no-op'
  );
});

// (2) Runtime section must not claim zero runtime dependencies without qualifying the hook layer.
test("runtime section discloses bash/jq/PowerShell hook requirements", () => {
  // Old text: "Runtime: Node.js, zero runtime dependencies." — misleading.
  assert.ok(
    !README.match(/Runtime.*zero runtime dependencies/),
    'README must not claim unconditional zero runtime dependencies'
  );
  // New text must name bash, jq, and PowerShell.
  assert.ok(README.includes("bash"), "README must mention bash as a hook requirement");
  assert.ok(README.includes("jq"), "README must mention jq as a hook requirement");
  assert.ok(README.includes("PowerShell"), "README must mention PowerShell as a hook requirement");
  // And must still confirm no npm deps for Node core.
  assert.ok(
    README.match(/zero npm dependencies/),
    "README must confirm zero npm dependencies for Node core"
  );
});

// (3) codex-integrity module description must disclose external LLM data flow.
test("codex-integrity row discloses that assistant turn text is sent to an external LLM", () => {
  // Find the codex-integrity table row.
  const lines = README.split("\n");
  const row = lines.find((l) => l.includes("`codex-integrity`"));
  assert.ok(row, "codex-integrity row must exist in the modules table");
  // The row must disclose the external LLM, that (scrubbed) turn text is sent, that codex EDITS the
  // repo by default, and the read-only kill switch -- the honest published contract for every install.
  assert.ok(
    row.includes("external") && row.includes("LLM"),
    "codex-integrity row must disclose that an external LLM is called"
  );
  assert.ok(
    /edit/i.test(row),
    "codex-integrity row must disclose that codex edits the repo by default"
  );
  assert.ok(
    row.includes("ASK_CODEX_ALLOW_EDITS"),
    "codex-integrity row must disclose the read-only kill switch (ASK_CODEX_ALLOW_EDITS=0)"
  );
  // Must mention that turn text is sent (scrubbed).
  assert.ok(
    row.includes("scrubbed") || row.includes("turn text"),
    "codex-integrity row must disclose that (scrubbed) turn text is sent"
  );
});

// (4) License section must exist with Apache-2.0 and copyright notice.
test("README has a License section with Apache-2.0 and copyright", () => {
  assert.ok(
    README.includes("## License"),
    'README must contain a "## License" section'
  );
  assert.ok(
    README.includes("Apache-2.0"),
    "README License section must name Apache-2.0"
  );
  assert.ok(
    README.includes("Copyright 2026 Joshua Matos"),
    "README License section must include copyright notice"
  );
  assert.ok(
    README.includes("LICENSE"),
    "README License section must reference the LICENSE file"
  );
});

// (5) Top warning must name the autonomy surface: skills/agents plus hooks.
test("README warning ties unexpected autonomous behavior to skills/agents with hooks", () => {
  const warning = README.split("\n").find((l) => l.includes("> **Warning:**")) || "";
  assert.ok(warning, "README must keep a top-level warning");
  assert.match(warning, /unexpected autonomous behavior/i);
  assert.match(warning, /skills\/agents/i);
  assert.match(warning, /hooks/i);
});
