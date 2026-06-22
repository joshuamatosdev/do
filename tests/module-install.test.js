const { test } = require("node:test");
const assert = require("node:assert");
const { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, cpSync } = require("node:fs");
const { join } = require("node:path");
const { tmpdir } = require("node:os");

// Build a throwaway plugin root containing the real spine + one fake module.
function fakePluginWithModule() {
  const root = mkdtempSync(join(tmpdir(), "do-plug-"));
  cpSync(join(__dirname, "..", "do", "spine"), join(root, "do", "spine"), { recursive: true });
  cpSync(join(__dirname, "..", ".claude-plugin"), join(root, ".claude-plugin"), { recursive: true });
  const md = join(root, "do", "modules", "demo");
  mkdirSync(md, { recursive: true });
  writeFileSync(join(md, "module.json"), JSON.stringify({
    name: "demo", description: "demo", files: [["extra.md", ".claude/do/extra.md"]],
    appendFormat: "append.md", settingsPartial: null, deps: [], externalDeps: [],
  }));
  writeFileSync(join(md, "extra.md"), "demo extra doc\n");
  writeFileSync(join(md, "append.md"), "## Demo gate\nDemo appended content.\n");
  process.env.DO_PLUGIN_ROOT = root;
  return root;
}

test("installs a module's files and records it in the manifest", () => {
  fakePluginWithModule();
  delete require.cache[require.resolve("../lib/install")];
  const { install } = require("../lib/install");
  const t = mkdtempSync(join(tmpdir(), "do-mt-"));
  install({ target: t, modules: ["demo"] });
  assert.ok(existsSync(join(t, ".claude", "do", "extra.md")), "module file copied");
  const m = JSON.parse(readFileSync(join(t, ".claude", "do.manifest.json"), "utf8"));
  assert.deepEqual(m.modules, ["demo"]);
  assert.ok(m.files[".claude/do/extra.md"], "module file tracked in manifest");
});

test("appends the module format block exactly once (idempotent)", () => {
  fakePluginWithModule();
  delete require.cache[require.resolve("../lib/install")];
  const { install } = require("../lib/install");
  const t = mkdtempSync(join(tmpdir(), "do-mt2-"));
  install({ target: t, modules: ["demo"] });
  install({ target: t, modules: ["demo"] });
  const fmt = readFileSync(join(t, ".claude", "RESPONSE-FORMAT.md"), "utf8");
  assert.equal((fmt.match(/Demo appended content\./g) || []).length, 1, "appended once");
  assert.ok(fmt.includes("DO-MODULE:demo:BEGIN"), "delimited block present");
});

test("doctor reports enabled modules and flags missing external deps", () => {
  fakePluginWithModule();
  // give the demo module an external dep that cannot exist
  const mj = join(process.env.DO_PLUGIN_ROOT, "do", "modules", "demo", "module.json");
  const m = JSON.parse(require("node:fs").readFileSync(mj, "utf8"));
  m.externalDeps = ["definitely-not-a-real-command-xyzzy"];
  require("node:fs").writeFileSync(mj, JSON.stringify(m));
  delete require.cache[require.resolve("../lib/install")];
  delete require.cache[require.resolve("../lib/doctor")];
  const { install } = require("../lib/install");
  const { doctor } = require("../lib/doctor");
  const t = mkdtempSync(join(tmpdir(), "do-dm-"));
  install({ target: t, modules: ["demo"] });
  const r = doctor(t);
  assert.deepEqual(r.modules, ["demo"]);
  assert.ok(r.missingSoftDeps.includes("definitely-not-a-real-command-xyzzy"), "missing external dep reported");
});
