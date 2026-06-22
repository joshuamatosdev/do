# /adr catalog — bootstrap or extend the ADR catalog

The catalog deliverable produces one decision per file under the repo's ADR location
(`docs/adr/NNNN-*.md`, kebab-case, 4-digit numbers). Use multiple subagents for recon, then
multiple subagents to draft the ADRs the recon actually justifies. This is the original `adr`
behavior, unchanged.

## ADR shape

Use the repo's existing ADR convention if it has one (look for `docs/conventions/`,
`docs/adr/README.md`, or an `0000-*` template). If none exists, use this shape:

```
# ADR NNNN: <Title>
## Status
Proposed | Accepted | Superseded
## Context
## Decision
## Consequences
## Alternatives Considered
## Implementation Notes
```

## Phase 1 — dispatch reconnaissance subagents

Create separate subagents with bounded missions. Each returns: relevant files read, current-state
findings, architectural implications, ADR topics it recommends, risks/open questions — and makes no
code changes.

Pick bounded recon slices that match the repository. Common neutral axes:

- Repository purpose and current structure — README, package/build files, module layout, docs,
  conventions, ownership signals.
- Public interfaces and consumers — CLI commands, APIs, SDK surfaces, UI routes, events, file
  formats, or library entrypoints.
- State and data model — persistence, schemas, caches, local files, migrations, ownership of
  records, source-of-truth boundaries.
- Integrations and dependencies — external services, upstream/downstream contracts, generated
  clients, queues, plugins, third-party APIs.
- Runtime and operations — deployment, config, environments, observability, release process,
  failure/recovery behavior.
- Security and compliance — authn/authz, secrets, privacy, audit, data classification,
  supply-chain concerns.
- Testing and quality gates — test strategy, fixtures, contract tests, lint/type checks, CI,
  compatibility guarantees.

Adapt, split, or drop axes based on what the repo actually contains. Each subagent has a bounded
mission — no "look at everything".

## Phase 2 — synthesis

After subagents report, produce a short synthesis: what the repo should become; what it should not
become; if inherited code is in scope, what can be reused as-is and what must be hardened; the
recommended ADR list and numbering; and any existing ADRs to retain, refine, or supersede.

## Phase 3 — create ADRs

Create the smallest coherent ADR set the recon justifies; for a broad bootstrap, expect roughly
5–12. Add more only if recon surfaced distinct, material decisions. Continue numbering from existing
files; do not duplicate ADRs already present — review and improve them instead.

Candidate ADR topics (use only those the recon justifies): mission/scope/non-goals; public
interface contract and compatibility policy; module/package boundaries and ownership; state,
persistence, and source-of-truth; integration boundaries and dependency strategy; error handling and
failure semantics; security/privacy/authorization; configuration/environments/secrets;
observability and supportability; testing and release gates; performance/reliability budgets;
migration/versioning/deprecation; local development and tooling; build/packaging/deployment.

ADR quality bar: each ADR is concrete enough to guide implementation; states what is decided and
what is explicitly not decided; includes alternatives considered; calls out consequences and risks;
cites file paths where a decision depends on repo/org conventions or references current code; avoids
generic architecture prose and speculative "someday" technology prose (define concrete revisit
triggers for any deferral).

## Final integration pass

Update the ADR index (e.g. `docs/adr/README.md`); update the repo's top-level docs with the ADR list
and current direction, matching the repo's existing doc shape; ensure no broken links; ensure no
unintended prefix or rebranding leaked in; grep the README and ADR directory for legacy or off-mission
terminology and explain any remaining references; run `git status` and summarize changed files.

Do not commit. Return: the subagent synthesis summary, ADRs created/updated, key architectural
decisions, open questions requiring a human decision, and the verification performed.
