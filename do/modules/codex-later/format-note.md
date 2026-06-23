### Codex-later gate (codex-later module)

**Stop hook on discovered frontier.** When a turn leaves open non-`[USER]` items,
`codex-later-stop.sh` blocks once and directs you to consult Codex (the `codex` skill) with this
work frontier rule:

1. Finish the requested objective.

2. Classify discovered work.

3. Immediately drain the discovered-work frontier when it is safe, relevant, and tool-executable.

4. Stop only when the frontier contains no worthwhile safe work, or only user-owned/irreversible decisions remain.

Execution loop: `objective -> required fixes -> verification -> discovered frontier -> drain -> verify -> stop`.

**ADR / spec alignment.** When a turn changes code AND the project has a registered ADR
(`docs/adr/`) or grounded-docs specification index, the same hook also directs a review of the
change against its governing decision record per `@docscheck` — and on divergence, ALIGN it:
Codex reviews and proposes the fix (apply it), with `do:distinguished-engineer` (implementation)
or `do:test-engineer` (tests) as fallbacks. Self-suppresses where no ADR / spec is registered.
By default Codex only proposes and you apply; set `ASK_CODEX_ALLOW_EDITS=1` to let Codex apply
the fix directly (codex.sh then runs with the workspace-write sandbox — an external LLM writing
to your repo, so it is opt-in and off by default).

Self-gated on the manifest (fires only where the module is enabled), recursion-safe (once
per turn), decline-respecting (backs off right after you reject a consult), and FAIL-OPEN.
Disable with `export CODEX_LATER_OFF=1`. Replaces the old local codex-on-question hooks,
which fired on any `?`. Codex is advisory — weigh it against the code.
