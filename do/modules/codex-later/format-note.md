### Codex-later gate (codex-later module)

**Stop hook on parked work.** When a turn leaves `- [ ] [LATER] ...` items, the
`codex-later-stop.sh` Stop hook blocks once and directs you to consult Codex (the `codex`
skill) to EVALUATE each parked item — do-now if in-scope / safe / reversible / or if all in-scope items are complete, else keep-deferred with a reason — then ACT on the result that turn. Deferred work gets and independent review instead of silently accruing.

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
