const { test } = require("node:test");
const assert = require("node:assert");
const { onPath } = require("../lib/which");

test("finds node on PATH", () => {
  assert.equal(onPath("node"), true);
});

test("does not find a bogus command", () => {
  assert.equal(onPath("definitely-not-a-real-command-xyzzy"), false);
});

test("returns false for empty, whitespace, or path-like names", () => {
  assert.equal(onPath(""), false);
  assert.equal(onPath("   "), false);
  assert.equal(onPath("foo/bar"), false);
});
