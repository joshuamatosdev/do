const fs = require("node:fs");
const { join } = require("node:path");
const crypto = require("node:crypto");
const { onPath } = require("./which");
const { loadModule, modulesDir } = require("./modules");

function sha(buf) { return crypto.createHash("sha256").update(buf).digest("hex").slice(0, 16); }
function readJsonOr(p, fallback) { try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch { return fallback; } }

function doctor(target) {
  const manifestPath = join(target, ".claude", "do.manifest.json");
  if (!fs.existsSync(manifestPath)) return { installed: false, drift: [], missingSoftDeps: [], settingsDrift: [] };
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  const drift = [];
  for (const [destRel, expected] of Object.entries(manifest.files || {})) {
    const p = join(target, destRel);
    if (!fs.existsSync(p)) { drift.push(destRel); continue; }
    // A tracked path that became a directory (EISDIR), or is otherwise unreadable, is drift —
    // not the expected file. Don't let the read crash the whole doctor report.
    let buf; try { buf = fs.readFileSync(p); } catch { drift.push(destRel); continue; }
    if (sha(buf) !== expected) drift.push(destRel);
  }
  const missingSoftDeps = [];
  const settingsDrift = [];
  // A module's settings partial union-merges env keys into .claude/settings.json at install
  // (e.g. agent-team sets CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1). That merge is never reconciled
  // afterward, so a later toggle-off / removal goes unnoticed unless we re-check it here.
  const settingsEnv = readJsonOr(join(target, ".claude", "settings.json"), {}).env || {};
  for (const name of manifest.modules || []) {
    let mod; try { mod = loadModule(name); } catch { continue; }
    for (const dep of mod.externalDeps || []) if (!onPath(dep)) missingSoftDeps.push(dep);
    if (mod.settingsPartial) {
      const partial = readJsonOr(join(modulesDir(), name, mod.settingsPartial), {});
      for (const [key, expected] of Object.entries(partial.env || {})) {
        const actual = Object.prototype.hasOwnProperty.call(settingsEnv, key) ? settingsEnv[key] : null;
        if (actual !== expected) settingsDrift.push({ module: name, key, expected, actual });
      }
    }
  }
  // docscheck (the @docscheck hook) only fires where a grounded-docs index exists; surface that
  // state so `do:run status` can tell the user when docscheck is dormant (no specs registered yet).
  const gdIndex = fs.existsSync(join(target, "grounded-docs")) || fs.existsSync(join(target, "agent-docs"));
  return { installed: true, version: manifest.version, modules: manifest.modules || [], drift, missingSoftDeps, settingsDrift,
    groundedDocs: { registered: gdIndex, docscheck: gdIndex ? "active" : "dormant" } };
}

if (require.main === module) {
  const i = process.argv.indexOf("--target");
  const target = i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : process.cwd();
  console.log(JSON.stringify(doctor(target), null, 2));
}
module.exports = { doctor };
