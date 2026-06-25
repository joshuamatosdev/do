#!/usr/bin/env node
// codex-integrity adversarial mode: a global on/off flag (mirrors do:mon's flag pattern).
// When ON, codex-stop.sh auto-runs Codex to adversarially review
// the turn and BLOCKS on anything flagged. ON by default (opt-out): adversarial review runs
// unless the flag file explicitly says "off". The per-project manifest self-gate in the hook
// means the flag only acts where codex-integrity is installed, and the hook fails OPEN when the
// codex CLI is absent (falls back to a do:change-skeptic advisory, never a hard block).
// CLI: `node adversarial-mode.js on|off|status|toggle`.
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");

const ON_VALUE = "on";
const OFF_VALUE = "off";
const MAX_FLAG_BYTES = 8;

function claudeDir() { return process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), ".claude"); }
function flagPath() { return path.join(claudeDir(), ".do-codex-adversarial-active"); }

function isSafeTarget(fp) {
  const st = fs.lstatSync(fp, { throwIfNoEntry: false });
  return !st || !st.isSymbolicLink(); // missing is fine; a symlink target is not
}

// ON by default. Adversarial mode is OFF only when the flag is a plain file whose trimmed content
// is exactly "off"; every other case (absent, "on", unreadable, symlink, oversized) reads as ON.
function isOn(fp = flagPath()) {
  try {
    const st = fs.lstatSync(fp, { throwIfNoEntry: false });
    if (!st || st.isSymbolicLink() || !st.isFile() || st.size > MAX_FLAG_BYTES) return true;
    return fs.readFileSync(fp, "utf8").trim() !== OFF_VALUE;
  } catch { return true; }
}

function setOn(fp = flagPath()) {
  try {
    if (!isSafeTarget(fp)) return false;
    fs.mkdirSync(path.dirname(fp), { recursive: true });
    fs.writeFileSync(fp, ON_VALUE, { encoding: "utf8" });
    return true;
  } catch { return false; }
}

// Persist an explicit "off" — absent now means ON, so disabling MUST write the marker.
function setOff(fp = flagPath()) {
  try {
    if (!isSafeTarget(fp)) return false;
    fs.mkdirSync(path.dirname(fp), { recursive: true });
    fs.writeFileSync(fp, OFF_VALUE, { encoding: "utf8" });
    return true;
  } catch { return false; }
}

// Flip the current state; returns the new state (true = ON).
function toggle(fp = flagPath()) {
  if (isOn(fp)) { setOff(fp); return false; }
  setOn(fp); return true;
}

module.exports = { flagPath, isOn, setOn, setOff, toggle };

if (require.main === module) {
  const arg = (process.argv[2] || "status").toLowerCase();
  const ON_MSG = "codex adversarial mode: ON — non-trivial turns get an auto Codex review at Stop; blocks on anything flagged (fail-open to do:change-skeptic if Codex is unavailable).";
  const OFF_MSG = "codex adversarial mode: OFF — Stop reverts to the advisory reminder.";
  if (arg === "on" || arg === "enable") {
    setOn();
    console.log(ON_MSG);
  } else if (arg === "off" || arg === "disable" || arg === "stop") {
    setOff();
    console.log(OFF_MSG);
  } else if (arg === "toggle") {
    console.log(toggle() ? ON_MSG : OFF_MSG);
  } else {
    console.log(`codex adversarial mode: ${isOn() ? "ON" : "OFF"} (ON by default; opt out with: adversarial-mode.js off)`);
  }
}
