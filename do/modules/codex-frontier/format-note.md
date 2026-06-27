### DO:MON frontier gate (codex-frontier module)

**Stop hook on discovered frontier.** When a turn leaves open non-`[EXTERNAL-INPUT]` items,
`codex-stop.sh` blocks once and directs you to consult DO:MON (the `do:mon` skill) with this
work frontier rule and reasoner brief:

1. Finish the requested objective.

2. Classify discovered work.

3. Immediately drain the discovered-work frontier when it is safe, relevant, and tool-executable.

4. Stop only when the frontier contains no worthwhile safe work, or only user-owned/irreversible decisions remain.

Clean up agent-owned processes before stopping. Terminate dev servers, watchers, worker pools,
hook/helper shells, and background toolchain commands you started; do not kill shared or user-owned
processes unless the user explicitly authorizes it.

Execution loop: `objective -> required fixes -> verification -> discovered frontier -> drain -> verify -> stop`.

For hard architecture, design, outward-impact, acceptance-criteria, tradeoff, or scalability
decisions, surface `- [ ] [DO:MON] <decision>`, consult `do:mon`, verify the advisory answer, choose,
and continue. The consult prompt should include relevant code/evidence and ask ChatGPT to act as a
senior tech-lead and AI creator of transforms: provide code where useful, discuss implementation
ideas, definition of done, acceptance criteria, tradeoffs, and the long-term scalable solution. The
user can interrupt the session if they disagree; do not stop waiting for user interjection.

Agent-created rollout / flip / readiness gates are frontier work, not terminal user decisions. If a
freshness barrier, backfill, reconciler, least-privilege role, migration, or operational prerequisite
is required for the requested feature to be coherent, build it in the drain loop or mark the feature
incomplete with evidence.

**ADR / spec alignment.** When a turn changes code AND the project has a registered ADR
(`docs/adr/`) or grounded-docs specification index, the same hook also directs a review of the
change against its governing decision record per `@docscheck` — and on divergence, ALIGN it:
DO:MON reviews and proposes the fix (apply it), with `do:distinguished-engineer` (implementation)
or `do:test-engineer` (tests) as fallbacks. Self-suppresses where no ADR / spec is registered. If
DO:MON is unavailable, use `codex --decide` or `do:change-skeptic`; direct Codex edits still require
the explicit `ASK_CODEX_ALLOW_EDITS=1` opt-in.

Self-gated on the manifest (fires only where the module is enabled), recursion-safe (once
per turn), decline-respecting (backs off right after you reject a consult), and FAIL-OPEN.
Disable with `export CODEX_FRONTIER_OFF=1`. Replaces the old local codex-on-question hooks,
which fired on any `?`. DO:MON is advisory — weigh it against the code.
