const { test } = require("node:test");
const assert = require("node:assert");
const { mkdtempSync, readFileSync, writeFileSync } = require("node:fs");
const { join } = require("node:path");
const { tmpdir } = require("node:os");

// Real plugin root (real spine + real memory-discipline module).
delete process.env.DO_PLUGIN_ROOT;
const { install } = require("../lib/install");
const { update } = require("../lib/update");

function tmpTarget() { return mkdtempSync(join(tmpdir(), "do-upd-")); }

test("update refreshes drifted docs and preserves modules + user config", () => {
  const t = tmpTarget();
  install({ target: t, modules: ["memory-discipline"] });
  const cfg = join(t, ".claude", "do.config.json");
  const c = JSON.parse(readFileSync(cfg, "utf8")); c.contexts = ["custom"]; writeFileSync(cfg, JSON.stringify(c));
  const rf = join(t, ".claude", "RESPONSE-FORMAT.md"); writeFileSync(rf, "TAMPERED\n");
  const r = update(t);
  assert.deepEqual(r.modules, ["memory-discipline"], "modules preserved");
  assert.ok(readFileSync(rf, "utf8").includes("RESPONSE FORMAT"), "drifted doc restored from plugin source");
  assert.deepEqual(JSON.parse(readFileSync(cfg, "utf8")).contexts, ["custom"], "user config preserved");
});

test("update throws on a project that was never set up", () => {
  assert.throws(() => update(tmpTarget()), /not installed/i);
});

test("update throws a clear error on a corrupt manifest", () => {
  const t = tmpTarget();
  install({ target: t, modules: [] });
  writeFileSync(join(t, ".claude", "do.manifest.json"), "{ not json");
  assert.throws(() => update(t), /corrupt manifest/i);
});
