# Changelog

All notable changes to this project are documented here. The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.1.28] — 2026-06-27

### Added

- **terminal-discipline** — `terminal-discipline.md` (the stop-or-act spec: legal · mathematical ·
  code · falsification) installs to `.claude/do/`, with the **`terminal-check`** skill as its
  self-run application: before stopping, classify every open item, take the first ACT, and stop only
  on a RoundLog-backed `[EXTERNAL-INPUT]`. The skill is the self-run primary; the
  `validate-continuation.sh` Stop hook is the deterministic backstop.
- **`prompt-builder` skill** — build ONE structured prompt from six components (role + task, context,
  instructions, example, repeated critical info, anti-hallucination block).
- **False-done tells** — `DO-CAP-002` (a masking fallback — an empty / null-object / no-op stub in
  place of a real implementation — is a fabrication unless mode-scoped and proven inert), plus the
  false-done-on-failing-gate and rhetorical-wall rules and a §6 worked RED in `terminal-discipline.md`.

### Changed

- **`[USER]` is repealed** — the sole turn-terminal is now `[EXTERNAL-INPUT]` (a credential, or a
  SAFETY_GATE), admissible only with a §5 RoundLog. Migrated across the continuation gate, the
  codex-frontier drain, `RESPONSE-FORMAT.md`, `execution-policy.yaml`, agents, and skills. (The
  conversation role-label `[USER]` / `[ASSISTANT]` is a separate namespace and is untouched.)
- **Continuation gate reason language** → the terminal-discipline register, each clause tagged with
  the section it enforces: `§1 ASK`, `§3 PUNT`, `§3 CONSULT`, `§5 INADMISSIBLE`, `[USER] REPEALED`,
  `§4 escalation`.

### Removed

- **`/do:run update`** — removed; it only ever re-merged the already-loaded plugin, never downloaded
  one (the name lied). The refresh path is `claude plugin update do@doctrineone-labs` + restart, then
  `/do:run setup` per project.

## [0.1.27] — 2026-06-26

### Changed

- Maintenance release: version bump only; no functional changes since 0.1.26.

## [0.1.26] — 2026-06-26

### Added

- **`route-codex-to-skill` gate** — a self-gated `PreToolUse(Bash|PowerShell)` hook routes Codex
  consults through the `do:codex` skill: a direct `codex exec` / `codex.sh` run that lacks the
  skill's marker is blocked and redirected to the skill (which applies secret-scrubbing, transcript
  forwarding, the pinned model, and verbatim return). The skill's own run carries
  `DO_CODEX_VIA_SKILL=1`; kill switch `DO_CODEX_ROUTE_OFF=1`. Allows non-codex commands, codex-file
  inspection, the test suite, and non-consult codex subcommands.

### Changed

- **Codex consult output is metadata-free** — `codex.sh` captures Codex's final answer via
  `--output-last-message` and emits only that (no prompt echo / grounding tool-calls / progress);
  the full stream is still saved to the audit log, with a fail-safe fallback when the answer file is
  empty. The same extraction is applied to the `codex-integrity` review path so the Stop block
  reason carries the clean verdict.

## [0.1.25] — 2026-06-26

### Changed

- **Stop-hook process cleanup guidance** — `validate-continuation` and `codex-frontier` now tell
  agents to clean up agent-owned dev servers, watchers, worker pools, helper shells, and background
  toolchain commands before stopping, while preserving shared or user-owned processes unless the
  user explicitly authorizes killing them.

## [0.1.24] — 2026-06-26

### Changed

- **DO:MON frontier decisions** — hard architecture, design, outward-impact, acceptance-criteria,
  tradeoff, or scalability decisions are now surfaced as `[DO:MON]` and routed through `do:mon`
  instead of being parked as `[USER]`. The stop-hook brief asks ChatGPT for code, implementation
  ideas, definition of done, acceptance criteria, tradeoffs, and the long-term scalable solution,
  then tells the agent to verify and continue.
- **`codex-frontier` dependency surface** — frontier draining and ADR/spec alignment now use
  `DO:MON` as the primary advisory reasoner, with `codex --decide` only as fallback, so the
  `codex-frontier` module no longer declares the Codex CLI as a required soft dependency.

## [0.1.23] — 2026-06-26

### Added

- **README workflow callouts** — highlights Spec YOLO mode near the top of the README, including the
  20-section ADR + Implementation Spec contract table and an ASCII flow diagram, plus a `do:mon`
  mode callout with concrete use cases.

### Changed

- **`do:mon` browser driver policy** — the skill now tries the built-in Claude browser first, falls
  back to browser MCP tooling when that driver is unavailable or fails, and requires an explicit
  user alert naming the browser-driver switch and cause before changing drivers.

## [0.1.22] — 2026-06-25

### Added

- **`prompt-base` skill** — a guided author for a reusable, presaved prompt as a registered skill: walk six prompt-engineering slots (persona, task, context, exemplar, format, tone) with draft-or-options at each, producing a `.claude/skills/<name>/SKILL.md` where only the task and context are supplied per use. A second mode promotes an existing `+sigle` into a registered skill (the `+promote` sigle now routes to it as its authoring engine). Catalogued in `README.md`.

### Fixed

- **Hook-test drive-path detection** (`tests/bash-paths.js`) — the helper now probes the running shell's real convention (WSL `/mnt/<d>` → git-bash `/<d>` → native) instead of treating a stray `/mnt/c` as WSL. Previously, paths rewritten to an unreadable form made the bash-hook suites fail-open under git-bash; this restored 48 failing tests to green.

## [0.1.21] — 2026-06-25

### Added

- **README "Security tools" note** — documents that the security skills (`bb-methodology`, `security-arsenal`, `red-blue`, `do:security-recon`) route to external security CLIs `do` does not bundle or require; all optional, authorized / local-only, with each skill's tool-routing table as the list.

### Changed

- **Frontier drain over deferred gates** — strengthens `validate-continuation` and codex-frontier guidance so agent-created rollout / flip / readiness prerequisites stay agent-runnable frontier work, not `[USER]` handoffs. Adds Windows/WSL bash-path test support for the hook suites.

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

[Unreleased]: https://github.com/joshuamatosdev/do/compare/do--v0.1.28...HEAD
[0.1.28]: https://github.com/joshuamatosdev/do/compare/do--v0.1.27...do--v0.1.28
[0.1.27]: https://github.com/joshuamatosdev/do/compare/do--v0.1.26...do--v0.1.27
[0.1.26]: https://github.com/joshuamatosdev/do/compare/do--v0.1.25...do--v0.1.26
[0.1.25]: https://github.com/joshuamatosdev/do/compare/do--v0.1.24...do--v0.1.25
[0.1.24]: https://github.com/joshuamatosdev/do/compare/do--v0.1.23...do--v0.1.24
[0.1.23]: https://github.com/joshuamatosdev/do/compare/do--v0.1.22...do--v0.1.23
[0.1.22]: https://github.com/joshuamatosdev/do/compare/do--v0.1.21...do--v0.1.22
[0.1.21]: https://github.com/joshuamatosdev/do/compare/do--v0.1.20...do--v0.1.21
[0.1.20]: https://github.com/joshuamatosdev/do/compare/do--v0.1.19...do--v0.1.20
[0.1.19]: https://github.com/joshuamatosdev/do/releases/tag/do--v0.1.19
