# /do:run update

1. Print the banner.
2. Run: `node "${CLAUDE_PLUGIN_ROOT}/lib/update.js" --target "$CLAUDE_PROJECT_DIR"`.
3. Relay the version delta (`from` → `to`) and that workflow files were refreshed and re-merged while the project's `do.config.json` was preserved. Suggest running `/do:run fix` to confirm a clean, change-free install.
