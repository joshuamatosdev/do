const { test } = require("node:test");
const assert = require("node:assert");
const { mkdtempSync, writeFileSync } = require("node:fs");
const { join } = require("node:path");
const { tmpdir } = require("node:os");
const { decideLevel, safeWriteFlag, clearFlag, readFlag, VALID_LEVELS } = require("../hooks/do-compress-config");

const tmpFlag = () => join(mkdtempSync(join(tmpdir(), "do-cmp-")), ".do-compress-active");

test("decideLevel sets a valid level from the slash command", () => {
  assert.deepEqual(decideLevel("/do compress strict"), { action: "set", level: "strict" });
  assert.deepEqual(decideLevel("/do compress plain"), { action: "set", level: "plain" });
});

test("decideLevel accepts the namespaced command form (/do:run compress)", () => {
  assert.deepEqual(decideLevel("/do:run compress strict"), { action: "set", level: "strict" });
  assert.equal(decideLevel("/do:run compress off").action, "clear");
});

test("decideLevel clears on off / stop / normal mode", () => {
  assert.equal(decideLevel("/do compress off").action, "clear");
  assert.equal(decideLevel("normal mode").action, "clear");
  assert.equal(decideLevel("stop compress").action, "clear");
});

test("decideLevel ignores an unknown level (no silent overwrite)", () => {
  assert.deepEqual(decideLevel("/do compress turbo"), { action: "none" });
});

test("decideLevel ignores unrelated prompts", () => {
  assert.deepEqual(decideLevel("add a button to the page"), { action: "none" });
});

test("safeWriteFlag + readFlag roundtrip", () => {
  const fp = tmpFlag();
  assert.equal(safeWriteFlag("strict", fp), true);
  assert.equal(readFlag(fp), "strict");
  clearFlag(fp);
  assert.equal(readFlag(fp), null);
});

test("readFlag rejects an invalid or oversized flag", () => {
  const fp = tmpFlag();
  writeFileSync(fp, "turbo");
  assert.equal(readFlag(fp), null, "invalid level -> null");
  writeFileSync(fp, "x".repeat(100));
  assert.equal(readFlag(fp), null, "oversized -> null");
});

test("safeWriteFlag refuses an invalid level", () => {
  const fp = tmpFlag();
  assert.equal(safeWriteFlag("turbo", fp), false);
  assert.equal(readFlag(fp), null);
});
