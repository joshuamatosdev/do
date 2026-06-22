const { join } = require("node:path");
// Plugin root = parent of lib/. Allows override for tests.
function pluginRoot() { return process.env.DO_PLUGIN_ROOT || join(__dirname, ".."); }
function spineDir() { return join(pluginRoot(), "do", "spine"); }
module.exports = { pluginRoot, spineDir };
