## agent-team

Run do's engineering agents as a Claude Code **agent team**: a lead decomposes a build, assigns each
task to an engineering specialist (engineer / distinguished-engineer / test-engineer / docs), then
integrates, gates, and ships the change. Classified residual findings converge to a neutral
`findings.json`, which a selectable **sink** renders to a tracker. (Security hardening is `red-blue`.)

- **Default sink is local and offline** — a Markdown issue tracker under `issues/`. No service, no
  account, no network. This is what teams without (or not wanting) GitHub use.
- **GitHub sink** is opt-in and needs `gh` (authenticated) + `jq`. Filing issues is outward-facing and
  hard to undo: always run it `--dry-run` first, review the planned issues, and confirm before filing.
- Agent teams are **experimental and token-heavy** (each teammate is a full Claude instance). This
  module enabled `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1` for this project on install.

See the `do-team` skill for the full workflow.
