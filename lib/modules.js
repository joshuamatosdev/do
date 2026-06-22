const fs = require("node:fs");
const { join } = require("node:path");
const { pluginRoot } = require("./paths");

function modulesDir() { return join(pluginRoot(), "do", "modules"); }

function listModules() {
  const dir = modulesDir();
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter((n) => fs.existsSync(join(dir, n, "module.json")))
    .map((n) => loadModule(n));
}

function loadModule(name) {
  const p = join(modulesDir(), name, "module.json");
  if (!fs.existsSync(p)) throw new Error(`Module not available: ${name}`);
  return JSON.parse(fs.readFileSync(p, "utf8"));
}

// Resolve requested names + their deps into a deduped install order.
function resolveModules(names) {
  const out = new Map();
  const visiting = new Set(); // in-progress guard: detects dependency cycles
  const visit = (name) => {
    if (out.has(name)) return;
    if (visiting.has(name)) throw new Error(`Dependency cycle detected involving: ${name}`);
    visiting.add(name);
    const mod = loadModule(name);
    for (const dep of mod.deps || []) visit(dep);
    visiting.delete(name);
    out.set(name, mod);
  };
  for (const n of names) visit(n);
  return [...out.values()];
}

module.exports = { listModules, loadModule, resolveModules, modulesDir };

if (require.main === module && process.argv.includes("--list")) {
  console.log(JSON.stringify(listModules().map((m) => ({ name: m.name, description: m.description, externalDeps: m.externalDeps || [] })), null, 2));
}

// --check-deps: for every module, is each externalDep (e.g. jq, codex) resolvable on PATH?
// `missing` is the flat list setup/doctor warn on. Advisory: a missing soft-dep never blocks install.
if (require.main === module && process.argv.includes("--check-deps")) {
  const { onPath } = require("./which");
  const modules = listModules().map((m) => ({
    name: m.name,
    externalDeps: (m.externalDeps || []).map((dep) => ({ dep, onPath: onPath(dep) })),
  }));
  const missing = modules.flatMap((m) => m.externalDeps.filter((d) => !d.onPath).map((d) => ({ module: m.name, dep: d.dep })));
  console.log(JSON.stringify({ modules, missing }, null, 2));
}
