const { test, after } = require("node:test");
const assert = require("node:assert");
const { mkdtempSync, mkdirSync, writeFileSync } = require("node:fs");
const { join } = require("node:path");
const { tmpdir } = require("node:os");
const { execFileSync } = require("node:child_process");

function fakePlugin(modules) {
  const root = mkdtempSync(join(tmpdir(), "do-mods-"));
  for (const [name, mod] of Object.entries(modules)) {
    const dir = join(root, "do", "modules", name);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "module.json"), JSON.stringify({ name, description: name, files: [], deps: [], externalDeps: [], ...mod }));
  }
  process.env.DO_PLUGIN_ROOT = root;
  return root;
}

// fakePlugin mutates process.env.DO_PLUGIN_ROOT; restore it so it can't leak past this file.
const ORIG_DO_PLUGIN_ROOT = process.env.DO_PLUGIN_ROOT;
after(() => {
  if (ORIG_DO_PLUGIN_ROOT === undefined) delete process.env.DO_PLUGIN_ROOT;
  else process.env.DO_PLUGIN_ROOT = ORIG_DO_PLUGIN_ROOT;
});

test("lists modules found on disk", () => {
  fakePlugin({ a: {}, b: {} });
  const { listModules } = require("../lib/modules");
  const names = listModules().map((m) => m.name).sort();
  assert.deepEqual(names, ["a", "b"]);
});

test("resolveModules validates existence and pulls deps", () => {
  fakePlugin({ a: { deps: ["b"] }, b: {}, c: {} });
  const { resolveModules } = require("../lib/modules");
  const resolved = resolveModules(["a"]).map((m) => m.name);
  assert.ok(resolved.includes("a") && resolved.includes("b"), "dep b pulled in");
});

test("resolveModules throws on unknown module", () => {
  fakePlugin({ a: {} });
  const { resolveModules } = require("../lib/modules");
  assert.throws(() => resolveModules(["nope"]), /not available|unknown/i);
});

test("resolveModules detects a dependency cycle instead of stack-overflowing", () => {
  fakePlugin({ a: { deps: ["b"] }, b: { deps: ["a"] } });
  const { resolveModules } = require("../lib/modules");
  assert.throws(() => resolveModules(["a"]), /cycle/i);
});

test("--check-deps reports PATH status and flags a missing external dep", () => {
  const root = fakePlugin({ x: { externalDeps: ["node", "definitely-not-a-real-cmd-xyz"] } });
  const out = execFileSync("node", [join(__dirname, "..", "lib", "modules.js"), "--check-deps"],
    { env: { ...process.env, DO_PLUGIN_ROOT: root }, encoding: "utf8" });
  const r = JSON.parse(out);
  const x = r.modules.find((m) => m.name === "x");
  assert.equal(x.externalDeps.find((d) => d.dep === "node").onPath, true, "node resolves on PATH");
  assert.ok(r.missing.some((m) => m.dep === "definitely-not-a-real-cmd-xyz" && m.module === "x"),
    "the bogus dep is flagged missing with its module");
});
