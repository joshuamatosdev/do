const { execFileSync } = require("node:child_process");
// Cross-platform "is this command resolvable on PATH?"
function onPath(cmd) {
  const probe = process.platform === "win32" ? "where" : "command";
  const args = process.platform === "win32" ? [cmd] : ["-v", cmd];
  try {
    execFileSync(probe, args, { stdio: "ignore", shell: process.platform !== "win32" });
    return true;
  } catch {
    return false;
  }
}
module.exports = { onPath };
