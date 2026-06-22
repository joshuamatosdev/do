# Contributing to `do`

Thank you for considering a contribution. `do` is a Claude Code plugin that ships a
portable engineering workflow. Contributions must follow the same discipline the plugin
enforces.

## Prerequisites

- **Node.js 22 LTS** (`node --version` should print `v22.x.x`)
- **bash** — required for the hook layer (all shell hooks are POSIX bash)
- **jq** — required by some hooks (`commit-doctor`, `docs-compliance-check`); the opt-in `git-gate` uses **node** (already required above), not jq
- **PowerShell** — required on Windows (some hooks call `pwsh`)
- **No npm install needed** — the plugin has zero npm runtime dependencies (Node core only)

## Getting started

```bash
git clone https://github.com/joshuamatosdev/do.git
cd do
```

That is it. No `npm install`. Open the project in your editor and you are ready.

## Running the tests

```bash
node --test "tests/*.test.js"
```

Tests use Node's built-in test runner (`node:test`). There are no third-party test
dependencies. Tests run on both Ubuntu and Windows in CI.

## Engineering conventions

This repository uses its own workflow. Before you write code, read:

- [`AGENTS.md`](AGENTS.md) — the grounding rule: cite file:line, never recall-only claims.
- [`CLAUDE.md`](CLAUDE.md) — engineering workflow, model discipline, and git safety rules.
- The five moves in `README.md` — engineer before implementing, minimum sufficient
  architecture, invariant-first, bounded change surface, lifecycle ownership.

In short: **draw the basis before you code**. If the change is non-trivial, open an issue
or draft PR and describe the need, the invariants it touches, and the options you
considered before writing a line.

## Commit and PR expectations

- **One logical change per commit.** Do not bundle unrelated fixes.
- **Clear commit messages.** Subject line ≤ 72 characters; explain *why*, not just *what*.
- **No `--no-verify`.** Hook failures must be fixed, not skipped.
- **No stubs or TODOs** left in merged code. The `block-stub-write` hook enforces this;
  your PR will not pass CI if stubs slip through.
- **Tests for new behavior.** Add or update a test in `tests/` for every behavior you
  change or add.
- **PR description** should state: what changed, why, which invariants it touches, and
  how you tested it.

## Hook dependencies note

The hooks under `do/spine/hooks/` and `do/modules/*/hooks/` are bash scripts. Some of
them require `jq` at runtime:

- `commit-doctor.sh`
- `docs-compliance-check.sh`

`git-gate.sh` (the opt-in `git-gate` module) requires `node`, not `jq`.

If you are modifying or adding hooks, make sure they degrade gracefully when the
dependency is absent (print a clear error; do not silently no-op).

## Reporting bugs and requesting features

Open a [GitHub issue](https://github.com/joshuamatosdev/do/issues). For security
issues, see [SECURITY.md](SECURITY.md).

## Code of Conduct

All participation is governed by the [Contributor Covenant](CODE_OF_CONDUCT.md).
