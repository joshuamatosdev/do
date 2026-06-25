const { execFileSync } = require("node:child_process");
const { join } = require("node:path");

const repoRoot = join(__dirname, "..");

function fwd(p) {
  return p.replace(/\\/g, "/");
}

let wslDriveMount;
function hasWslDriveMount() {
  if (wslDriveMount !== undefined) return wslDriveMount;
  try {
    execFileSync("bash", ["-lc", "test -d /mnt/c"], { stdio: "ignore" });
    wslDriveMount = true;
  } catch {
    wslDriveMount = false;
  }
  return wslDriveMount;
}

function bashPath(p) {
  const posix = fwd(p);
  const m = /^([A-Za-z]):\/(.*)$/.exec(posix);
  if (!m || !hasWslDriveMount()) return posix;
  return `/mnt/${m[1].toLowerCase()}/${m[2]}`;
}

function bashEnv(extra = {}, names = Object.keys(extra)) {
  const wanted = Array.from(new Set(names.filter(Boolean)));
  const existing = process.env.WSLENV ? process.env.WSLENV.split(":").filter(Boolean) : [];
  const env = { ...process.env, ...extra };
  if (wanted.length) env.WSLENV = Array.from(new Set([...existing, ...wanted])).join(":");
  return env;
}

module.exports = { bashEnv, bashPath, fwd, repoRoot };
