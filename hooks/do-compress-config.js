const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");

const VALID_LEVELS = ["plain", "strict"];
const MAX_FLAG_BYTES = 32;

function claudeDir() { return process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), ".claude"); }
function flagPath() { return path.join(claudeDir(), ".do-compress-active"); }

function isSafeTarget(fp) {
  const st = fs.lstatSync(fp, { throwIfNoEntry: false });
  return !st || (!st.isSymbolicLink()); // missing is fine; symlink is not
}

function safeWriteFlag(level, fp = flagPath()) {
  if (!VALID_LEVELS.includes(level)) return false;
  try {
    if (!isSafeTarget(fp)) return false;
    fs.writeFileSync(fp, level, { encoding: "utf8" });
    return true;
  } catch { return false; }
}

function clearFlag(fp = flagPath()) {
  try { if (isSafeTarget(fp)) fs.unlinkSync(fp); } catch {}
  return true;
}

function readFlag(fp = flagPath()) {
  try {
    const st = fs.lstatSync(fp, { throwIfNoEntry: false });
    if (!st || st.isSymbolicLink() || !st.isFile() || st.size > MAX_FLAG_BYTES) return null;
    const v = fs.readFileSync(fp, "utf8").trim();
    return VALID_LEVELS.includes(v) ? v : null;
  } catch { return null; }
}

// Pure: decide what a user prompt does to the compress level.
// -> { action: 'set'|'clear'|'none', level?: 'plain'|'strict' }
function decideLevel(prompt) {
  const p = String(prompt || "").trim().toLowerCase();
  if (/\bnormal mode\b/.test(p) ||
      /\b(stop|disable|deactivate|turn off)\b[^.]*\bcompress\b/.test(p) ||
      /\bcompress\b[^.]*\b(off|stop|disable)\b/.test(p)) {
    return { action: "clear" };
  }
  const m = /^\/do(?::(?:do|run))?\s+compress(?:\s+(\S+))?/.exec(p);
  if (m) {
    const arg = m[1];
    if (!arg) return { action: "set", level: "plain" };
    if (arg === "off" || arg === "stop") return { action: "clear" };
    if (VALID_LEVELS.includes(arg)) return { action: "set", level: arg };
    return { action: "none" };
  }
  if (/\bcompress (mode|replies|every reply)\b/.test(p)) return { action: "set", level: "plain" };
  return { action: "none" };
}

module.exports = { VALID_LEVELS, MAX_FLAG_BYTES, claudeDir, flagPath, safeWriteFlag, clearFlag, readFlag, decideLevel };
