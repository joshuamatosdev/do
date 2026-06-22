# /do:run setup

1. Print the banner.
2. Detect the target: `node "${CLAUDE_PLUGIN_ROOT}/lib/detect.js" --target "$CLAUDE_PROJECT_DIR"`. Relay stack + existing-.claude findings.
3. Module selection. List EVERY module: `node "${CLAUDE_PLUGIN_ROOT}/lib/modules.js" --list`. The spine is always installed. Default to installing them ALL — ask via AskUserQuestion:
   - **All modules (recommended)** — enable every module the catalog lists.
   - **Pick a subset** — then present the modules with AskUserQuestion `multiSelect`. AskUserQuestion shows at most 4 options per question, so when the catalog has more than 4 modules you MUST split them across as many questions as needed — never drop a module to fit the 4-option cap (that silent skip is the bug this step exists to prevent). Order by `stackHint` against the detected stack.
   - **Spine only** — no modules.
   Fast path: if the argument after `setup` is `all` (`/do:run setup all`), skip the prompt and enable every module.
   For whichever modules end up chosen, name each one's `externalDeps` so the user knows what must be on PATH (e.g. codex-integrity → codex, commit-doctor → jq). A missing soft-dep never blocks install; `/do:run fix` reports it.
4. Install: `node "${CLAUDE_PLUGIN_ROOT}/lib/install.js" --target "$CLAUDE_PROJECT_DIR" --modules "<comma-separated-chosen, or every module name for 'all'>"`.
5. Dependency check. Run `node "${CLAUDE_PLUGIN_ROOT}/lib/modules.js" --check-deps` and report every `missing` entry whose module was just installed — name the dep and which module needs it (e.g. `jq` → commit-doctor, `codex` → codex-integrity) and that it must be on PATH. Advisory: install still succeeds; the dependent gate/feature stays inert until the dep resolves. Same soft-dep set `/do:run fix` re-checks later.
6. Relay the installer's JSON result: files written, settings merged (backup path), CLAUDE.md block added, manifest path.
7. Tell the user to reload (`/reload-plugins` is not needed — these are target-project hooks; a new session in the target picks them up) and run `/do:run fix` to verify.
