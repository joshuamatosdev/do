const { test } = require("node:test");
const assert = require("node:assert");
const { mkdtempSync, writeFileSync, mkdirSync } = require("node:fs");
const { join } = require("node:path");
const { tmpdir } = require("node:os");
const { detect } = require("../lib/detect");

function tmpProject() { return mkdtempSync(join(tmpdir(), "do-detect-")); }

test("detects node stack from package.json", () => {
  const dir = tmpProject();
  writeFileSync(join(dir, "package.json"), "{}");
  const r = detect(dir);
  assert.ok(r.stacks.includes("node"));
});

test("detects existing .claude dir", () => {
  const dir = tmpProject();
  mkdirSync(join(dir, ".claude"));
  const r = detect(dir);
  assert.equal(r.hasClaudeDir, true);
});

test("reports empty stacks for a bare dir", () => {
  const r = detect(tmpProject());
  assert.deepEqual(r.stacks, []);
  assert.equal(r.hasClaudeDir, false);
});
