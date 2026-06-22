const { pluginVersion } = require("./version");
const banner = [
  "  ┌────────────────────────────────────────┐",
  "  │              D O   ·   do              │",
  "  │   For better AI-assisted engineering   │",
  "  └────────────────────────────────────────┘",
  `  v${pluginVersion()}`,
].join("\n");
if (require.main === module) console.log(banner);
module.exports = { banner };
