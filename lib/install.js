const fs = require("node:fs");
const { join, dirname } = require("node:path");
const crypto = require("node:crypto");
const { spineDir } = require("./paths");
const { pluginVersion } = require("./version");
const { mergeSettings } = require("./merge-settings");
const { resolveModules, modulesDir, listModules } = require("./modules");

const SPINE_FILES = [
  ["RESPONSE-FORMAT.md", ".claude/RESPONSE-FORMAT.md"],
  ["policy/execution-policy.yaml", ".claude/do/execution-policy.yaml"],
  ["one.md", ".claude/do/one.md"],
  ["capability-gate.md", ".claude/capability-gate.md"],
  ["ALWAYS-READ.md", ".claude/ALWAYS-READ.md"], // @docscheck — docs & spec compliance rule
  ["policy/terminal-discipline.md", ".claude/do/terminal-discipline.md"], // terminal-state discipline (the shared spec behind the validate-continuation.sh gate + the terminal-check skill + the RESPONSE-FORMAT self-check)
];

function sha(buf) { return crypto.createHash("sha256").update(buf).digest("hex").slice(0, 16); }
function ensureDir(p) { fs.mkdirSync(p, { recursive: true }); }
function copy(src, dest) { ensureDir(dirname(dest)); const b = fs.readFileSync(src); fs.writeFileSync(dest, b); return sha(b); }

function install({ target, modules = [] }) {
  const resolved = resolveModules(modules); // throws on unknown; pulls deps
  const spine = spineDir();
  const written = {};

  // Migration: legacy installs kept the spine in .claude/doctrine/; it now lives in .claude/do/.
  // Remove the plugin-owned legacy dir so an update does not leave stale duplicates behind.
  const legacyDir = join(target, ".claude", "doctrine");
  if (fs.existsSync(legacyDir)) fs.rmSync(legacyDir, { recursive: true, force: true });

  // 1. Copy spine docs (dest-path keyed).
  for (const [rel, destRel] of SPINE_FILES) {
    written[destRel] = copy(join(spine, rel), join(target, destRel));
  }

  // 2. Copy module files.
  for (const mod of resolved) {
    const base = join(modulesDir(), mod.name);
    for (const [srcRel, destRel] of mod.files || []) {
      written[destRel] = copy(join(base, srcRel), join(target, destRel));
    }
  }

  // 3. Merge settings.json (spine + module partials), backing up first.
  const settingsPath = join(target, ".claude", "settings.json");
  let merged = readJsonOr(settingsPath, {});
  // Back up the PRE-do original only — never overwrite an existing .bak, or a re-install would
  // clobber the genuine pre-do settings with do's already-merged output (losing the original).
  if (fs.existsSync(settingsPath)) { if (!fs.existsSync(settingsPath + ".bak")) fs.copyFileSync(settingsPath, settingsPath + ".bak"); } else ensureDir(dirname(settingsPath));
  merged = mergeSettings(merged, JSON.parse(fs.readFileSync(join(spine, "settings.partial.json"), "utf8")));
  for (const mod of resolved) {
    if (mod.settingsPartial) merged = mergeSettings(merged, JSON.parse(fs.readFileSync(join(modulesDir(), mod.name, mod.settingsPartial), "utf8")));
  }
  fs.writeFileSync(settingsPath, JSON.stringify(merged, null, 2));

  // 4. CLAUDE.md managed block (replace if present).
  const claudePath = join(target, "CLAUDE.md");
  const block = fs.readFileSync(join(spine, "CLAUDE.do.md"), "utf8").trim();
  let body = fs.existsSync(claudePath) ? fs.readFileSync(claudePath, "utf8") : "";
  body = stripDelimited(body, "DO");
  body = stripDelimited(body, "DOCTRINEONE"); // legacy marker — strip pre-rename installs on update
  // Strip leading blank lines: when the managed block sat at the top, stripping it leaves the body
  // starting with newlines. Without this, re-running install bakes a permanent leading blank-line
  // prefix into CLAUDE.md (not idempotent). trimEnd() alone only handles the trailing side.
  body = body.replace(/^\s*\n/, "");
  fs.writeFileSync(claudePath, (body.trim() ? body.trimEnd() + "\n\n" : "") + block + "\n");

  // 4b. Append per-module CLAUDE.md blocks (idempotent, delimited) so a module's guidance reaches
  //     EVERY agent. Dispatched subagents inherit CLAUDE.md but NOT hook-injected session context
  //     or RESPONSE-FORMAT.md, so anything that must reach subagents lives here, not only step 5.
  // Strip EVERY known module's CLAUDE block first, so disabling a module (reinstall WITHOUT it)
  // removes its inherited directive too — not just the resolved set; then re-add the resolved ones.
  for (const known of listModules()) {
    fs.writeFileSync(claudePath, stripDelimited(fs.readFileSync(claudePath, "utf8"), `DO-MODULE-CLAUDE:${known.name}`));
  }
  for (const mod of resolved) {
    if (!mod.appendClaude) continue;
    const add = fs.readFileSync(join(modulesDir(), mod.name, mod.appendClaude), "utf8").trim();
    const cm = fs.readFileSync(claudePath, "utf8");
    const wrapped = `\n<!-- DO-MODULE-CLAUDE:${mod.name}:BEGIN -->\n${add}\n<!-- DO-MODULE-CLAUDE:${mod.name}:END -->\n`;
    fs.writeFileSync(claudePath, cm.trimEnd() + "\n" + wrapped);
  }

  // 5. Append module format blocks to RESPONSE-FORMAT.md (idempotent, delimited per module).
  const fmtPath = join(target, ".claude", "RESPONSE-FORMAT.md");
  for (const mod of resolved) {
    if (!mod.appendFormat) continue;
    const add = fs.readFileSync(join(modulesDir(), mod.name, mod.appendFormat), "utf8").trim();
    let fmt = fs.readFileSync(fmtPath, "utf8");
    fmt = stripDelimited(fmt, `DO-MODULE:${mod.name}`);
    const wrapped = `\n<!-- DO-MODULE:${mod.name}:BEGIN -->\n${add}\n<!-- DO-MODULE:${mod.name}:END -->\n`;
    fs.writeFileSync(fmtPath, fmt.trimEnd() + "\n" + wrapped);
  }

  // 5b. Re-hash RESPONSE-FORMAT.md after any module appends (appends mutate it after initial copy).
  if (resolved.some((mod) => mod.appendFormat)) {
    written[".claude/RESPONSE-FORMAT.md"] = sha(fs.readFileSync(fmtPath));
  }

  // 6. Manifest + config.
  const manifest = { version: pluginVersion(), installedAt: new Date().toISOString(), modules: resolved.map((m) => m.name), files: written };
  fs.writeFileSync(join(target, ".claude", "do.manifest.json"), JSON.stringify(manifest, null, 2));
  const configPath = join(target, ".claude", "do.config.json");
  if (!fs.existsSync(configPath)) fs.writeFileSync(configPath, JSON.stringify({ pushPolicy: "main-only", gitDenyList: "default", contexts: [] }, null, 2));

  return { target, written: Object.keys(written), modules: manifest.modules, settingsBackedUp: fs.existsSync(settingsPath + ".bak"), manifest };
}

function readJsonOr(p, fallback) {
  if (!fs.existsSync(p)) return fallback;
  try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch { return fallback; }
}

// Generalized delimited-block stripper for `<!-- <TAG>:BEGIN ... <!-- <TAG>:END -->`.
function stripDelimited(text, tag) {
  const begin = `<!-- ${tag}:BEGIN`;
  const end = `<!-- ${tag}:END -->`;
  const b = text.indexOf(begin);
  if (b === -1) return text;
  const e = text.indexOf(end, b);
  if (e === -1) {
    // Unclosed BEGIN marker: do NOT drop everything after it (silent data loss).
    // Leave the file untouched and warn — the malformed block is the user's to fix.
    process.stderr.write(`do: WARNING: unclosed "${tag}:BEGIN" marker — leaving file unchanged.\n`);
    return text;
  }
  return (text.slice(0, b) + text.slice(e + end.length)).replace(/\n{3,}/g, "\n\n");
}

if (require.main === module) {
  const arg = (f) => { const i = process.argv.indexOf(f); return i >= 0 ? process.argv[i + 1] : undefined; };
  const target = arg("--target") || process.cwd();
  const modules = (arg("--modules") || "").split(",").map((s) => s.trim()).filter(Boolean);
  console.log(JSON.stringify(install({ target, modules }), null, 2));
}
module.exports = { install, stripDelimited };
