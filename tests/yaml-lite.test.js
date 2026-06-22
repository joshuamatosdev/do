const { test } = require("node:test");
const assert = require("node:assert");
const { parseYaml } = require("../tools/yaml-lite");

test("yaml-lite: single-quoted '' is an escaped apostrophe", () => {
  const fm = parseYaml("msg: 'it''s here'");
  assert.equal(fm.msg, "it's here");
});

test("yaml-lite: booleans, ints, and bare scalars", () => {
  const fm = parseYaml("a: true\nb: false\nc: hello world\nd: 42");
  assert.equal(fm.a, true);
  assert.equal(fm.b, false);
  assert.equal(fm.c, "hello world");
  assert.equal(fm.d, 42);
});

test("yaml-lite: flow sequence parses to an array", () => {
  const fm = parseYaml('tools: ["Read", "Grep"]');
  assert.deepEqual(fm.tools, ["Read", "Grep"]);
});
