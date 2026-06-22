const { test } = require("node:test");
const assert = require("node:assert");
const { mkdtempSync, writeFileSync, readFileSync, rmSync, mkdirSync } = require("node:fs");
const { join } = require("node:path");
const { tmpdir } = require("node:os");
const { install } = require("../lib/install");
const { doctor } = require("../lib/doctor");

function tmpTarget() { return mkdtempSync(join(tmpdir(), "do-doctor-")); }

test("reports a clean install", () => {
  const t = tmpTarget();
  install({ target: t, modules: [] });
  const r = doctor(t);
  assert.equal(r.installed, true);
  assert.equal(r.drift.length, 0);
});

test("detects drift when a copied doc is edited", () => {
  const t = tmpTarget();
  install({ target: t, modules: [] });
  const f = join(t, ".claude", "RESPONSE-FORMAT.md");
  writeFileSync(f, readFileSync(f, "utf8") + "\nlocal edit\n");
  const r = doctor(t);
  assert.ok(r.drift.includes(".claude/RESPONSE-FORMAT.md"));
});

test("reports not-installed for a bare project", () => {
  assert.equal(doctor(tmpTarget()).installed, false);
});

test("clean agent-team install has no settings drift", () => {
  const t = tmpTarget();
  install({ target: t, modules: ["agent-team"] });
  assert.deepEqual(doctor(t).settingsDrift, []);
});

test("does not crash when a tracked file path is a directory (EISDIR)", () => {
  // Regression: reading a tracked path that became a directory threw EISDIR and crashed doctor.
  // It must instead be reported as drift.
  const t = tmpTarget();
  install({ target: t, modules: [] });
  const tracked = join(t, ".claude", "RESPONSE-FORMAT.md");
  rmSync(tracked, { force: true });
  mkdirSync(tracked); // tracked file is now a directory
  let r;
  assert.doesNotThrow(() => { r = doctor(t); }, "doctor survives EISDIR on a tracked path");
  assert.ok(r.drift.includes(".claude/RESPONSE-FORMAT.md"), "the directory'd tracked file is drift");
});

test("detects the agent-team flag toggled off after install", () => {
  const t = tmpTarget();
  install({ target: t, modules: ["agent-team"] });
  const sp = join(t, ".claude", "settings.json");
  const s = JSON.parse(readFileSync(sp, "utf8"));
  delete s.env.CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS; // user toggled it off
  writeFileSync(sp, JSON.stringify(s, null, 2));
  const r = doctor(t);
  assert.deepEqual(r.settingsDrift, [
    { module: "agent-team", key: "CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS", expected: "1", actual: null },
  ]);
});
