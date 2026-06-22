# /do:run verify

1. Print the banner.
2. Run `superpowers:verification-before-completion` — run the actual verification commands and confirm output. "It compiled" is not verification; a green test or a rendered page is.
3. Test-first work → `superpowers:test-driven-development`. To confirm behavior in the real app → the `run` and `verify` skills.
4. Before "I can't verify", climb the verification route (tests → project scripts → E2E/Playwright/browser → local probe → logs) — see `.claude/capability-gate.md`. "Can't log in" is not a dead-end.
