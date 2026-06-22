# /do:run remove

The do workflow's own lifecycle Move 5 — a clean uninstall that reverses `setup`.

1. Print the banner.
2. Run: `node "${CLAUDE_PLUGIN_ROOT}/lib/uninstall.js" --target "$CLAUDE_PROJECT_DIR"`.
3. Relay the JSON summary of what was removed:
   - the do-managed `DO:BEGIN..DO:END` block was stripped from `CLAUDE.md` (the rest of the file is left intact);
   - `.claude/settings.json` was either restored from its pre-do `settings.json.bak` or had do's hooks and env vars stripped in place (symmetric with the install merge);
   - the do-installed spine and module files recorded in the manifest were removed, along with `do.manifest.json` and `do.config.json`, and any directories left empty were tidied up.

Running `remove` again is safe — every step is idempotent. After removal, the only do footprint that may remain is content the user added themselves (a non-do `CLAUDE.md` body, user-authored settings). Re-install any time with `/do:run setup`.
