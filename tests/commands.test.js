const { test } = require("node:test");
const assert = require("node:assert");
const { readFileSync, existsSync, readdirSync } = require("node:fs");
const { join } = require("node:path");

// The /do:run slash command must ship in the format Claude Code actually registers: a Markdown file
// under commands/ with YAML frontmatter and the $ARGUMENTS token. A .toml command (the prior bug)
// is silently ignored -> the command resolves as Unknown after a plugin reload. The file is named
// run.md (not do.md) so the canonical command is do:run, never the doubled do:do.
const ROOT = join(__dirname, "..");
const CMD = join(ROOT, "commands", "run.md");

test("the /do:run command ships as Markdown (Claude Code registers .md, not .toml)", () => {
  assert.ok(existsSync(CMD), "commands/run.md must exist");
  const files = readdirSync(join(ROOT, "commands"));
  assert.ok(!files.includes("do.md"), "commands/do.md must not exist (it registers as the doubled do:do)");
  assert.ok(!files.some((f) => f.toLowerCase().endsWith(".toml")), "no stale .toml command files remain");
});

test("the /do:run command has valid frontmatter and uses $ARGUMENTS (not {{args}})", () => {
  const src = readFileSync(CMD, "utf8");
  assert.match(src, /^---\r?\n[\s\S]*?\r?\n---/, "must open with a YAML frontmatter block");
  assert.match(src, /\ndescription:\s*\S/, "frontmatter needs a description");
  assert.ok(src.includes("$ARGUMENTS"), "must use the $ARGUMENTS token");
  assert.ok(!src.includes("{{args}}"), "must not use the non-Claude {{args}} token");
});

test("every /do:run subcommand routes to a reference that exists (and fix has its lib script)", () => {
  const src = readFileSync(CMD, "utf8");
  const refs = [...src.matchAll(/skills\/setup\/references\/([a-z]+\.md)/g)].map((m) => m[1]);
  assert.ok(refs.length >= 8, "expected the documented subcommand routes");
  for (const r of new Set(refs)) {
    assert.ok(existsSync(join(ROOT, "skills", "setup", "references", r)), `missing reference: ${r}`);
  }
  assert.ok(existsSync(join(ROOT, "lib", "doctor.js")), "the fix route shells out to lib/doctor.js");
});

// Regression guard: AskUserQuestion shows at most 4 options, but the catalog has >4 modules.
// setup MUST default to all + split a subset-pick across questions, never silently drop a module.
test("setup offers all modules and never drops one to the 4-option cap", () => {
  const src = readFileSync(join(ROOT, "skills", "setup", "references", "setup.md"), "utf8");
  assert.match(src, /lib\/modules\.js/, "lists the full module catalog");
  assert.match(src, /all modules/i, "offers an install-all path");
  assert.match(src, /never drop a module|split them across/i, "warns against dropping modules past the cap");
});
