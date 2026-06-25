const fs = require("node:fs");
const { join, dirname } = require("node:path");
const { stripDelimited } = require("./install");
const { mergeSettings } = require("./merge-settings");
const { listModules } = require("./modules");

// The spine files install() always writes, by DEST path. Used as a fallback set
// when the manifest is missing/corrupt so removal still cleans a partial install.
// Kept in sync with install.js SPINE_FILES (dest side).
const SPINE_DEST_FILES = [
  ".claude/RESPONSE-FORMAT.md",
  ".claude/do/execution-policy.yaml",
  ".claude/do/one.md",
  ".claude/capability-gate.md",
  ".claude/ALWAYS-READ.md",
];

// do-owned bookkeeping files install() writes that are NOT in manifest.files.
const DO_OWNED_FILES = [
  ".claude/do.manifest.json",
  ".claude/do.config.json",
];

function readJsonOr(p, fallback) {
  if (!fs.existsSync(p)) return fallback;
  try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch { return fallback; }
}

function rmFileIfExists(p, removed) {
  if (fs.existsSync(p) && fs.statSync(p).isFile()) { fs.rmSync(p); removed.push(p); return true; }
  return false;
}

// Remove a directory only if it is empty (leaves user files in .claude/ alone).
function rmDirIfEmpty(p) {
  try { if (fs.existsSync(p) && fs.statSync(p).isDirectory() && fs.readdirSync(p).length === 0) fs.rmdirSync(p); } catch { /* not empty / racing — leave it */ }
}

// Belt-and-suspenders for the pre-tag migration: mergeSettings strips only `_do`-tagged hooks, but a
// pre-tag install could leave an UNTAGGED do hook (e.g. codex-frontier before its partial tagged _do).
// Such a hook would survive uninstall and then point at a script we just removed — a broken Stop hook
// every turn. Strip any hook whose command references a do-installed hook FILE we are removing (matched
// by its tracked dest path), even untagged. Mutates `settings` in place; returns true if it changed it.
function stripHooksReferencingFiles(settings, destRels) {
  const hookFiles = destRels.filter((r) => r.includes("/hooks/"));
  if (!settings.hooks || !hookFiles.length) return false;
  let changed = false;
  for (const event of Object.keys(settings.hooks)) {
    const groups = (settings.hooks[event] || []).flatMap((g) => {
      const before = (g.hooks || []).length;
      const kept = (g.hooks || []).filter((h) => !(h && typeof h.command === "string" && hookFiles.some((r) => h.command.includes(r))));
      if (kept.length !== before) changed = true;
      return kept.length ? [{ ...g, hooks: kept }] : [];
    });
    if (groups.length) settings.hooks[event] = groups; else delete settings.hooks[event];
  }
  return changed;
}

// Reverse install(): the plugin's own lifecycle Move 5 — clean uninstall.
// Idempotent: running twice is safe (every step is existence-guarded and
// the delimited-block strips are no-ops when the markers are already gone).
function remove({ target }) {
  const result = { target, claudeBlockRemoved: false, settings: "untouched", removedFiles: [], removedDirs: [] };
  const removed = result.removedFiles;

  // The manifest is the authoritative record of every file install wrote (spine + module),
  // keyed by dest path. Prefer it; fall back to the static spine set for a partial install
  // whose manifest never landed or got corrupted.
  const manifestPath = join(target, ".claude", "do.manifest.json");
  const manifest = readJsonOr(manifestPath, null);
  const trackedDestRels = manifest && manifest.files ? Object.keys(manifest.files) : SPINE_DEST_FILES;

  // 1. Strip the do-managed block(s) from CLAUDE.md, leaving the rest intact.
  const claudePath = join(target, "CLAUDE.md");
  if (fs.existsSync(claudePath)) {
    const before = fs.readFileSync(claudePath, "utf8");
    let body = before;
    body = stripDelimited(body, "DO");            // the spine managed block
    body = stripDelimited(body, "DOCTRINEONE");   // legacy marker (pre-rename installs)
    // Per-module CLAUDE blocks: strip every KNOWN module's block (not just the manifest's),
    // symmetric with install which strips all known modules before re-adding the active set.
    for (const known of safeListModules()) body = stripDelimited(body, `DO-MODULE-CLAUDE:${known.name}`);
    // Mirror install's whitespace handling so removal is a clean inverse and stays idempotent.
    body = body.replace(/^\s*\n/, "");
    const cleaned = body.trim() ? body.trimEnd() + "\n" : "";
    if (cleaned !== before) result.claudeBlockRemoved = true;
    if (cleaned) {
      if (cleaned !== before) fs.writeFileSync(claudePath, cleaned);
    } else {
      // Nothing of the user's left — do created/owned the whole file. Remove it.
      rmFileIfExists(claudePath, removed);
    }
  }

  // 2. settings.json — restore the pre-do .bak if present (the faithful inverse), else strip
  //    do's hooks + env in place (symmetric with install's merge: empty partial == pure cleanup).
  const settingsPath = join(target, ".claude", "settings.json");
  const bakPath = settingsPath + ".bak";
  if (fs.existsSync(bakPath)) {
    // Restore the genuine pre-do original, then drop the backup.
    fs.copyFileSync(bakPath, settingsPath);
    fs.rmSync(bakPath);
    removed.push(bakPath);
    result.settings = "restored-from-bak";
  } else if (fs.existsSync(settingsPath)) {
    const current = readJsonOr(settingsPath, {});
    stripHooksReferencingFiles(current, trackedDestRels); // strip untagged do hooks pointing at removed files
    const stripped = mergeSettings(current, {}); // strips _do hooks + _doEnv-ledgered env keys
    // If do created this file (no pre-do .bak) and nothing of the user's remains, remove it; else
    // write the stripped result back. "Nothing remains" must account for the empty do scaffold:
    // install creates settings.json as { "hooks": {} } (mergeSettings always seeds an empty hooks
    // container and never deletes the container itself), so an all-do file strips to that, not {}.
    if (isDoEmpty(stripped)) {
      rmFileIfExists(settingsPath, removed);
      result.settings = "removed-empty";
    } else {
      fs.writeFileSync(settingsPath, JSON.stringify(stripped, null, 2));
      result.settings = "do-hooks-env-stripped";
    }
  }

  // 3. Remove the do-installed files recorded in the manifest (spine + module files), plus
  //    the do-owned bookkeeping files. RESPONSE-FORMAT.md is tracked, so its appended module
  //    format blocks go with it — no separate strip needed.
  for (const destRel of trackedDestRels) rmFileIfExists(join(target, destRel), removed);
  for (const destRel of DO_OWNED_FILES) rmFileIfExists(join(target, destRel), removed);

  // 4. Tidy up now-empty do-owned directories (never touch a dir that still holds user files).
  const dirs = new Set();
  for (const destRel of [...trackedDestRels, ...DO_OWNED_FILES]) dirs.add(dirname(join(target, destRel)));
  // Deepest-first so a parent can empty after its children are gone.
  for (const d of [...dirs].sort((a, b) => b.length - a.length)) {
    const had = fs.existsSync(d) && fs.statSync(d).isDirectory() && fs.readdirSync(d).length === 0;
    rmDirIfEmpty(d);
    if (had && !fs.existsSync(d)) result.removedDirs.push(d);
  }
  // The .claude/skills dir is a common module install target; sweep it and .claude last.
  for (const extra of [join(target, ".claude", "skills"), join(target, ".claude", "do"), join(target, ".claude")]) {
    const had = fs.existsSync(extra) && fs.statSync(extra).isDirectory() && fs.readdirSync(extra).length === 0;
    rmDirIfEmpty(extra);
    if (had && !fs.existsSync(extra)) result.removedDirs.push(extra);
  }

  result.installed = manifest != null;
  return result;
}

// A settings object that holds nothing but the empty do scaffold (an empty `hooks` and/or empty
// `env` container, no other keys) is what an all-do settings.json strips down to. Treat it as
// do-owned-and-empty so a clean uninstall removes the file install created.
function isDoEmpty(obj) {
  for (const [k, v] of Object.entries(obj)) {
    if ((k === "hooks" || k === "env") && v && typeof v === "object" && Object.keys(v).length === 0) continue;
    return false; // a real user key (or a non-empty hooks/env) — keep the file
  }
  return true;
}

// listModules reads the plugin tree; never let an unreadable plugin dir abort a removal.
function safeListModules() { try { return listModules(); } catch { return []; } }

if (require.main === module) {
  const arg = (f) => { const i = process.argv.indexOf(f); return i >= 0 ? process.argv[i + 1] : undefined; };
  const target = arg("--target") || process.cwd();
  console.log(JSON.stringify(remove({ target }), null, 2));
}
module.exports = { remove };
