# /do:run review

1. Print the banner.
2. Pick by diff risk:
   - Routine local diff or PR → the `code-review` command.
   - Security / auth / data touched → `security-review`.
   - High-stakes production path → an adversarial pass (one agent generates findings, a second tries to push back on them).
3. Ground every finding in `file:line`; label each by severity; no praise filler.
