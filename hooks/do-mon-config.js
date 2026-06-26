const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");

const FLAG_VALUE = "on";
const MAX_FLAG_BYTES = 8;
const MAX_CONFIG_BYTES = 64 * 1024;

const DEFAULT_CONFIG = {
  browser: null, // set after first successful driver: "built-in-claude-browser" | "claude-in-chrome" | other MCP browser
  defaultReasoner: "chatgpt",
  reasoners: [
    {
      id: "chatgpt",
      label: "ChatGPT",
      url: "https://chatgpt.com/",
      enabled: true,
      newChat: "navigate-fresh",
      input: { strategy: "click-composer-then-type" },
      submit: "return-key",
      promptShape: "single-block-no-newlines",
      doneSignal: "composer-returned+text-stable-2-polls",
      pollSec: 10,
      timeoutSec: 900,
    },
  ],
};

function claudeDir() { return process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), ".claude"); }
function flagPath() { return path.join(claudeDir(), ".do-mon-active"); }
function stateDir() { return path.join(claudeDir(), "state", "do-mon"); }
function configPath() { return path.join(stateDir(), "config.json"); }

function isSafeTarget(fp) {
  const st = fs.lstatSync(fp, { throwIfNoEntry: false });
  return !st || !st.isSymbolicLink(); // missing is fine; symlink is not
}

function safeWriteFlag(fp = flagPath()) {
  try {
    if (!isSafeTarget(fp)) return false;
    fs.writeFileSync(fp, FLAG_VALUE, { encoding: "utf8" });
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
    return fs.readFileSync(fp, "utf8").trim() === FLAG_VALUE ? "on" : null;
  } catch { return null; }
}

function readConfig(fp = configPath()) {
  try {
    const st = fs.lstatSync(fp, { throwIfNoEntry: false });
    if (!st || st.isSymbolicLink() || !st.isFile() || st.size > MAX_CONFIG_BYTES) {
      return structuredClone(DEFAULT_CONFIG);
    }
    const parsed = JSON.parse(fs.readFileSync(fp, "utf8"));
    if (!parsed || typeof parsed !== "object" || !Array.isArray(parsed.reasoners)) {
      return structuredClone(DEFAULT_CONFIG);
    }
    return parsed;
  } catch { return structuredClone(DEFAULT_CONFIG); }
}

function writeConfig(cfg, fp = configPath()) {
  try {
    if (!isSafeTarget(fp)) return false;
    fs.mkdirSync(path.dirname(fp), { recursive: true });
    fs.writeFileSync(fp, JSON.stringify(cfg, null, 2), { encoding: "utf8" });
    return true;
  } catch { return false; }
}

// Pure: decide what a user prompt does to do:mon mode.
// -> { action: 'set' | 'clear' | 'status' | 'none' }
function decideMode(prompt) {
  const p = String(prompt || "").trim().toLowerCase();
  // Explicit slash command FIRST — a leading "/do[:run] mon ..." is a command and must NEVER be
  // reinterpreted by the NL heuristics below; otherwise a consult whose QUESTION mentions
  // "disable"/"off"/"enable" would be misread as a toggle (losing the consult AND silently flipping
  // mode). Forms: "/do mon <arg>", "/do:mon <arg>", or the renamed "/do:run mon <arg>".
  const m = /^\/do(?::run)?(?:\s+|:)mon(?:\s+(\S+))?/.exec(p);
  if (m) {
    const arg = m[1];
    if (!arg) return { action: "none" };                 // bare "/do:mon" -> consult, not toggle
    if (arg === "on" || arg === "enable") return { action: "set" };
    if (arg === "off" || arg === "stop" || arg === "disable") return { action: "clear" };
    if (arg === "status") return { action: "status" };
    return { action: "none" };                            // a question -> consult
  }
  // NL / phrased disable (only reached when NOT a slash command): "turn off do:mon", "disable domon"
  if (/\b(off|stop|disable|deactivate|turn off)\b[^.]*\bdo:?mon\b/.test(p) ||
      /\bdo:?mon\b[^.]*\b(off|stop|disable)\b/.test(p)) {
    return { action: "clear" };
  }
  // NL enable
  if (/\b(turn on|enable)\b[^.]*\bdo:?mon\b/.test(p) || /\bdo:?mon mode\b/.test(p)) {
    return { action: "set" };
  }
  return { action: "none" };
}

module.exports = {
  FLAG_VALUE, MAX_FLAG_BYTES, MAX_CONFIG_BYTES, DEFAULT_CONFIG,
  claudeDir, flagPath, stateDir, configPath,
  safeWriteFlag, clearFlag, readFlag, readConfig, writeConfig, decideMode,
};
