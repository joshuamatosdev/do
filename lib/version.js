const { readFileSync } = require("node:fs");
const { join } = require("node:path");
function pluginVersion() {
  const manifest = JSON.parse(readFileSync(join(__dirname, "..", ".claude-plugin", "plugin.json"), "utf8"));
  return manifest.version;
}
module.exports = { pluginVersion };
