---
name: setup
description: do workflow — installer, dashboard, and phase router. Use when the user invokes any do workflow subcommand (setup, add, fix, status, execute, review, verify, handoff) or asks to install/verify/inspect the do workflow or run a phase in a project.
---

# setup — do workflow

Route on the command the user ran. Each command has a reference file — read it and follow it exactly. Do NOT perform file operations by hand; the deterministic work lives in the Node installer at `${CLAUDE_PLUGIN_ROOT}/lib`.

| Command | Reference |
|---|---|
| `setup`   | `references/setup.md`   |
| `status`  | `references/status.md`  |
| `fix`     | runs `${CLAUDE_PLUGIN_ROOT}/lib/doctor.js` — reports version / drift / missing soft-deps / settings drift (module env flags turned off after install) |
| `add`     | `references/add.md`     |
| `remove`  | `references/remove.md`  |
| `execute` | `references/execute.md` |
| `review`  | `references/review.md`  |
| `verify`  | `references/verify.md`  |
| `handoff` | `references/handoff.md` |
| `compress` | `references/compress.md` |
| `style`    | `references/style.md`    |
| `codex`    | runs `${CLAUDE_PLUGIN_ROOT}/do/modules/codex-integrity/lib/adversarial-mode.js on\|off\|status\|toggle` — codex adversarial Stop-review mode (ON by default; `off` reverts to advisory, `toggle` flips) |

Print the banner first on any command: `node "${CLAUDE_PLUGIN_ROOT}/lib/banner.js"`.

> `${CLAUDE_PLUGIN_ROOT}` resolves only inside the Claude Code plugin runtime. These commands run via the registered slash command, so it is present at invocation; outside the plugin runtime it is unset and these paths will not resolve.
