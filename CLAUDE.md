# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this repo is

`do` is a **Claude Code plugin** (npm `@joshuamatosdev/do`, marketplace `doctrineone-labs`) — a
portable engineering workflow that other projects install into their `.claude/`. This repo is the
plugin *source*: most files here only become behavior in *other* repos after someone runs
`/do:run setup`. The `README.md` documents the user-facing surface (agents, skills, sigles,
commands); this file is for working **on the plugin itself**.

This repo dogfoods its own install — `.claude/do.manifest.json` is present — so the plugin's own
gates run on your sessions here. See **Gotchas**.

## Commands

- **Test (all):** `node --test "tests/*.test.js"` — the only npm script (`package.json:17`). Node ≥22 (`package.json:19`). ~37 test files under `tests/`.
- **Test (one file):** `node --test tests/<name>.test.js`.
- **No build and no lint step.** The Node core is plain JS with **zero npm dependencies**; the test suite is the gate.
- **Hook runtime deps:** `bash` everywhere; `jq` for a few hooks (e.g. `codex-frontier`, `commit-doctor`); PowerShell on Windows. The Node core needs none of these.

## Architecture — the big picture

Three things are non-obvious and each spans many files:

### 1. Two install surfaces with *different* propagation
`/do:run setup` does a **two-part** install (`lib/install.js`):

- **Portable docs are COPIED** into the target's `.claude/` (response format, the five moves,
  capability gate, execution policy). Source of truth lives under `do/spine/`. Editing these affects
  only projects installed or updated *after* your change.
- **Hook logic STAYS in the plugin** and loads live via `${CLAUDE_PLUGIN_ROOT}` (wired in
  `.claude-plugin/plugin.json` → `hooks`). Editing a hook changes behavior in **every**
  plugin-enabled project immediately, with no re-install.

Know which surface you are touching before you edit — the blast radius is completely different.

### 2. Spine vs. modules
- `do/spine/` = the always-on core: `CLAUDE.do.md`, `RESPONSE-FORMAT.md`, `ALWAYS-READ.md`,
  `capability-gate.md`, `one.md`, `policy/`, `settings.partial.json`, and `hooks/` — the gate
  scripts (`validate-continuation.sh`, `block-stub-write.sh`,
  `docs-compliance-check.sh`, `route-codex-to-skill.sh` — routes Codex consults through the
  `do:codex` skill) plus the `load-*` session-start loaders. (Turn-completion is enforced TWO ways
  off one spec, `terminal-discipline.md`: the self-run `terminal-check` skill + RESPONSE-FORMAT
  self-check as the primary, and the `validate-continuation.sh` Stop hook as the deterministic backstop.)
- `do/modules/` = 9 **opt-in**, self-contained modules: `completion-gates`, `memory-discipline`,
  `codex-integrity`, `codex-frontier`, `commit-doctor`, `git-gate`, `task-router`, `agent-team`,
  `oppihtnias`. Each ships its own hooks/skills and is enabled at setup or via `/do:run add <module>`.

### 3. Self-gating
Manifest hooks load in *every* plugin-enabled project, but the blocking ones first check for
`.claude/do.manifest.json` and **no-op when it is absent**. The system only enforces where someone
ran `/do:run setup` — which is why the same hook can be loaded yet silent.

### Supporting layout
- `lib/` = the `/do:run` engine: `install`, `uninstall`, `update`, `detect`, `doctor`, `modules`,
  `merge-settings`, `paths`, `version`, `which`. It is the logic behind the single command
  `commands/run.md` and the `setup` skill.
- `hooks/` (top-level) = JS activators/trackers for the two sticky session modes, **compress** and **mon**.
- `agents/` = 16 dispatchable subagents · `skills/` = 20 in-repo skills (4 more ship with modules,
  24 total per README) · `workflows/` = 3 deterministic multi-agent scripts (`adr-spec.js`,
  `adversarial-review.js`, `red-blue-sweep.js`), run with the Workflow tool by path.
- `tools/` = standalone helpers: `plain-words.js` + `wordlist` (the compress plain-words check),
  `adr-spec-*` (the ADR skill), `yaml-lite.js`, `frontmatter-schema.js`.

## Gotchas when editing here

- **Never hand-edit the `DO:BEGIN … DO:END` block in `AGENTS.md`** — it is generated from the source
  under `do/spine/` by the installer. Change the spine source and re-run `/do:run setup` to
  regenerate; editing the block directly is overwritten on the next setup/refresh.
- The gates you hit in-session (response-format tier, continuation, codex integrity review) are
  *this plugin's own hooks* acting on you because the repo is dogfooded. A failing Stop gate is
  feedback on your turn — fix the turn, do not suppress the gate.
- Hook scripts are bash/PowerShell; the install engine (`lib/`) and the mode activators (`hooks/`)
  are Node. Keep the Node core dependency-free.

---

@AGENTS.md
