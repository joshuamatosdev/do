const { test } = require("node:test");
const assert = require("node:assert");
const { mkdtempSync, readFileSync, existsSync } = require("node:fs");
const { join } = require("node:path");
const { tmpdir } = require("node:os");

// Uses the REAL plugin root (the three shipped modules).
delete require.cache[require.resolve("../lib/install")];
delete process.env.DO_PLUGIN_ROOT;
const { install } = require("../lib/install");
const { doctor } = require("../lib/doctor");

test("real modules install: files land, format appended, manifest records them", () => {
  const t = mkdtempSync(join(tmpdir(), "do-em-"));
  install({ target: t, modules: ["completion-gates", "memory-discipline"] });
  assert.ok(existsSync(join(t, ".claude", "do", "MEMORY.template.md")));
  assert.ok(existsSync(join(t, ".claude", "skills", "do-remember", "SKILL.md")));
  const fmt = readFileSync(join(t, ".claude", "RESPONSE-FORMAT.md"), "utf8");
  assert.ok(fmt.includes("DO-MODULE:completion-gates:BEGIN"));
  assert.ok(fmt.includes("DO-MODULE:memory-discipline:BEGIN"));
  const m = JSON.parse(readFileSync(join(t, ".claude", "do.manifest.json"), "utf8"));
  assert.deepEqual(m.modules.sort(), ["completion-gates", "memory-discipline"]);
});

test("doctor reports a clean module install", () => {
  const t = mkdtempSync(join(tmpdir(), "do-em2-"));
  install({ target: t, modules: ["memory-discipline"] });
  const r = doctor(t);
  assert.equal(r.installed, true);
  assert.deepEqual(r.modules, ["memory-discipline"]);
  assert.equal(r.drift.length, 0);
});
