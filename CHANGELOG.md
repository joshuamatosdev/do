# Changelog

All notable changes to this project are documented here. The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- **README "Security tools" note** — documents that the security skills (`bb-methodology`, `security-arsenal`, `red-blue`, `do:security-recon`) route to external security CLIs `do` does not bundle or require; all optional, authorized / local-only, with each skill's tool-routing table as the list.

## [0.1.20] — 2026-06-21

### Added

- **`+promote` sigle** — graduate a reusable sigle into a real Claude Code skill: promote/decline criteria, skill-directory routing, and an explicit "no auto-promotion" rule, routed through `superpowers:writing-skills`. Catalogued in `SIGLES.md` and `README.md`.

### Changed

- **git-gate is now an opt-in module** (`do/modules/git-gate/`), not an always-on spine hook. Destructive-git blocking enforces only where the `git-gate` module is recorded in `do.manifest.json` (add it with `/do:run setup --modules git-gate` or `/do:run add git-gate`). The plugin-declared PreToolUse hook self-gates on `manifest.modules`, mirroring `codex-integrity`. Without the module, do does not restrict git — so a PR / branch workflow needs no special handling.
- **Codex Stop hooks are merged into one** — the prior split hooks become a single plugin-declared `codex-stop.sh`. Behavior-preserving: each concern self-gates on its own module (`codex-integrity` / `codex-frontier`) and keeps its own behavior and Codex path; when both block in one turn the reasons combine into a single block. Result: one Stop registration and one transcript classification instead of three. `codex-frontier` no longer injects a hook into `settings.json` (it is plugin-declared via the merged hook); existing installs are migrated on update.

### Fixed

- **Skill/command frontmatter** (`skills/adr/SKILL.md`, `commands/run.md`): unquoted `description` values contained a colon-space (`do: subagents`, `Subcommands: setup`), which YAML parses as a nested mapping key — frontmatter failed to load and every field was silently dropped at runtime (name + description → empty), costing the skill/command its triggering description. Single-quoted both. Surfaced by `claude plugin tag` validation; all 26 component files were scanned and these were the only two affected.
- **codex-frontier / merge-settings / uninstall**: the codex-frontier Stop hook is now tagged `_do: true`, so it is stripped on module opt-out / uninstall instead of lingering. `merge-settings.js` now also dedups by exact command on merge, so reinstalling collapses any pre-existing untagged copy instead of stacking a duplicate Stop hook. Uninstall additionally strips any hook whose command references a do-installed hook file it removes, so a pre-tag untagged hook can no longer be left orphaned (pointing at a deleted script).

## [0.1.19] — 2026-06-20

First public release. Public-readiness hardening driven by a multi-agent audit.

### Added

- Apache-2.0 `LICENSE` and `NOTICE`; `license` field in `plugin.json` and `marketplace.json`.
- GitHub Actions CI: full `node --test` suite on Ubuntu + Windows (Node 22), plus a TypeScript type-check.
- `/do:run remove` — clean uninstall (lifecycle Move 5): strips the managed `CLAUDE.md` block, removes do-owned hooks/env from `settings.json`, restores the pre-do backup, and deletes the manifest + installed spine files.
- Community-health files: `SECURITY.md`, `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`.
- Root `package.json` with a `test` script; `tsconfig.json` for the type-check.
- Regression tests for every security-gate bypass listed below.

### Fixed

- **git-gate**: closed the newline-separated and env-prefix/wrapper bypasses (`GIT_DIR=… git reset --hard`, `env/nice/time git clean`); restricted `symbolic-ref`/`reflog` to read-only forms.
- **block-stub-write**: JSON-decodes the payload and matches markers on decoded content (it previously failed open on most real code).
- **do:mon scrubber**: now covers unquoted `.env` and single-quoted secret values; exposed as a `--scrub` CLI.
- **codex-integrity**: routes turn text through the scrubber before egress (fail-closed), runs codex read-only, and invokes via direct argv (no `bash -c` string interpolation); egress disclosed in `module.json`.
- **validate-continuation**: strips fenced/inline code before the question-mark check, so a code-span token no longer blocks a finished turn.
- **merge-settings**: strips do-owned env vars on module disable.
- **install/doctor**: preserves an existing `settings.json.bak`, appends to `CLAUDE.md` idempotently, and handles `EISDIR`.

### Changed

- README corrected: `protect-user-work.sh` is labeled a reserved no-op; the "zero runtime dependencies" claim now notes the hooks need bash/jq/PowerShell; the codex egress is disclosed.
- Scrubbed private residue (personal email, internal project names, absolute machine paths) from docs and skill references.

[Unreleased]: https://github.com/joshuamatosdev/do/compare/do--v0.1.20...HEAD
[0.1.20]: https://github.com/joshuamatosdev/do/compare/do--v0.1.19...do--v0.1.20
[0.1.19]: https://github.com/joshuamatosdev/do/releases/tag/do--v0.1.19
