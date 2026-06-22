const fs = require("node:fs");
const { join } = require("node:path");
const { install } = require("./install");
const { pluginVersion } = require("./version");

// Refresh an installed project's workflow files to the current plugin version by
// re-running the idempotent installer over the modules already recorded in
// the manifest. install() preserves an existing do.config.json (it only
// writes the default when absent), so user config survives.
function update(target) {
  const manifestPath = join(target, ".claude", "do.manifest.json");
  if (!fs.existsSync(manifestPath)) throw new Error("Not installed: run /do:run setup first.");
  let before;
  try {
    before = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  } catch (e) {
    throw new Error(`Corrupt manifest at ${manifestPath}: ${e.message}. Re-run /do:run setup.`);
  }
  if (!before.version) throw new Error(`Manifest at ${manifestPath} is missing "version" — re-run /do:run setup.`);
  const result = install({ target, modules: before.modules || [] });
  return { from: before.version, to: pluginVersion(), modules: result.modules };
}

if (require.main === module) {
  const i = process.argv.indexOf("--target");
  const target = i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : process.cwd();
  console.log(JSON.stringify(update(target), null, 2));
}
module.exports = { update };
