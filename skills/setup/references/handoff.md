# /do:run handoff

1. Print the banner.
2. Run the `hp` skill to write a YAML handoff to the OS temp dir: phase status, test status, findings, next actions, path/URL references; remove secrets and PII.
3. If the `memory-discipline` module is installed and a durable fact came up this session, use the `do-remember` skill before ending.
