---
description: 'do engineering workflow. Subcommands: setup, add, fix, status, execute, review, verify, handoff.'
argument-hint: setup [all] | add <module> | status | fix | compress plain|strict|off | style | mon on|off|status | codex on|off|status|toggle | execute | review | verify | handoff
---

You are running the `/do:run` command. The argument is: $ARGUMENTS

Invoke the `setup` skill and route on the first token of the argument:
- `setup`  -> follow skills/setup/references/setup.md (offers all modules; `/do:run setup all` enables every module without prompting — none skipped)
- `status` -> follow skills/setup/references/status.md
- `fix`    -> run `node "${CLAUDE_PLUGIN_ROOT}/lib/doctor.js" --target "$CLAUDE_PROJECT_DIR"`, then report installed / version / modules / drift / missing soft-deps / settings drift (env flags like `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS` turned off after install) in plain text (diagnose only — it does not auto-repair)
- `add`    -> follow skills/setup/references/add.md (enable a module: /do:run add <module-name>)
- `compress` -> follow skills/setup/references/compress.md (set reply compression: /do:run compress plain|strict|off)
- `style`   -> follow skills/setup/references/style.md (load the engineering style: /do:run style)
- `mon`     -> follow skills/setup/references/mon.md (do:mon external-reasoner consult + mode: /do:run mon on|off|status)
- `codex`   -> run `node "${CLAUDE_PLUGIN_ROOT}/do/modules/codex-integrity/lib/adversarial-mode.js" <on|off|status|toggle>` and relay the result (codex-integrity adversarial Stop-review mode, ON by default: non-trivial turns get an auto Codex review that blocks on anything flagged; `off` reverts to the advisory reminder, `toggle` flips the state; needs the codex-integrity module)
- `execute` -> follow skills/setup/references/execute.md
- `review`  -> follow skills/setup/references/review.md
- `verify`  -> follow skills/setup/references/verify.md
- `handoff` -> follow skills/setup/references/handoff.md
- (empty)  -> print the do banner and list available subcommands
- anything else -> tell the user that subcommand is not in the MVP and list what is.

Do not improvise file operations: the setup flow delegates deterministic work to the Node installer under ${CLAUDE_PLUGIN_ROOT}/lib.
