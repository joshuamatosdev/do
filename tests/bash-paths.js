const { execFileSync } = require("node:child_process");
const { join } = require("node:path");

const repoRoot = join(__dirname, "..");

function fwd(p) {
  return p.replace(/\\/g, "/");
}

// How the bash that will RUN the hooks maps a Windows drive letter to a path:
//   "wsl"  -> /mnt/<d>/...   (real WSL)
//   "msys" -> /<d>/...       (git-bash / MSYS)
//   "none" -> leave it as C:/... (native Linux; or a Windows bash that takes C:/ directly)
//
// Detection by probing alone is required, and the FORM matters in two ways at once:
//   1. Readability — git-bash can carry a stray, empty /mnt/c yet resolve nothing under it
//      (and never exposes other drives like an E: tmpdir), so "/mnt/c exists" is a false signal.
//   2. PATH-safety — these helpers also build $PATH entries, and ':' is the PATH separator,
//      so the colon-bearing C:/... form silently splits a PATH entry in two. Only the
//      colon-free POSIX forms (/mnt/<d>/... or /<d>/...) are safe there.
// So we PROBE this repo's own root in each form with the SAME launcher the tests use
// (execFileSync("bash", ...)) and pick the first the shell can actually stat. Detection and
// execution therefore never disagree. Cached: the shell does not change within a run.
let cachedDriveStyle;
function driveStyle() {
  if (cachedDriveStyle !== undefined) return cachedDriveStyle;
  const m = /^([A-Za-z]):\/(.*)$/.exec(fwd(repoRoot));
  if (!m) {
    cachedDriveStyle = "none";
    return cachedDriveStyle;
  }
  const d = m[1].toLowerCase();
  const rest = m[2];
  const resolves = (form) => {
    try {
      execFileSync("bash", ["-lc", `test -e "${form}"`], { stdio: "ignore" });
      return true;
    } catch {
      return false;
    }
  };
  if (resolves(`/mnt/${d}/${rest}`)) cachedDriveStyle = "wsl";
  else if (resolves(`/${d}/${rest}`)) cachedDriveStyle = "msys";
  else cachedDriveStyle = "none";
  return cachedDriveStyle;
}

function bashPath(p) {
  const posix = fwd(p);
  const m = /^([A-Za-z]):\/(.*)$/.exec(posix);
  if (!m) return posix;
  const style = driveStyle();
  if (style === "wsl") return `/mnt/${m[1].toLowerCase()}/${m[2]}`;
  if (style === "msys") return `/${m[1].toLowerCase()}/${m[2]}`;
  return posix;
}

function bashEnv(extra = {}, names = Object.keys(extra)) {
  const wanted = Array.from(new Set(names.filter(Boolean)));
  const existing = process.env.WSLENV ? process.env.WSLENV.split(":").filter(Boolean) : [];
  const env = { ...process.env, ...extra };
  if (wanted.length) env.WSLENV = Array.from(new Set([...existing, ...wanted])).join(":");
  return env;
}

module.exports = { bashEnv, bashPath, fwd, repoRoot };
