# /do:run add [<module>]

1. Print the banner.
2. List available modules: `node "${CLAUDE_PLUGIN_ROOT}/lib/modules.js" --list`.
   - If the user named one or more `<module>`s: confirm each exists; if any is unknown, show the list and stop.
   - If the user named NOTHING (no argument): present the multi-select picker by default — `AskUserQuestion` with `multiSelect: true`, one option per available module (label = module name; description = its `description`, and note any `externalDeps`), plus a final "None — cancel" option. Use the picked modules as the selection. If the user cancels, closes the picker, or picks none, stop without installing.
3. Read the current enabled set from `.claude/do.manifest.json` (`modules` array).
4. Re-install over the UNION of current modules + the picked one(s):
   `node "${CLAUDE_PLUGIN_ROOT}/lib/install.js" --target "$CLAUDE_PROJECT_DIR" --modules "<comma-separated-union>"`.
5. Relay the result; tell the user to run `/do:run fix` (it will flag any missing external deps the module needs).
