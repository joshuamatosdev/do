# /do:run status

1. Print the banner: `node "${CLAUDE_PLUGIN_ROOT}/lib/banner.js"`.
2. Run: `node "${CLAUDE_PLUGIN_ROOT}/lib/doctor.js" --target "$CLAUDE_PROJECT_DIR" --status`.
3. Relay the JSON it prints as a short table: installed? version, enabled modules, changed count, missing soft-deps, and grounded-docs/docscheck state. When `groundedDocs.docscheck` is `dormant`, say plainly that docscheck is installed but inactive until a governing reference/spec is registered — activate it by registering sources with `/do:grounded-docs` (or `do:docs`). Until then, agents have nothing to verify against and will skip the docs-compliance check.
4. Add `git status --short` (if a repo) so the user sees do + working-tree state together.
