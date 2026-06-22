# /do:run execute

1. Print the banner.
2. With a written plan, run `superpowers:subagent-driven-development` (same session, fresh subagent per task + review) or `superpowers:executing-plans` (separate session).
3. Apply model discipline from `.claude/do/execution-policy.yaml`: mechanical edits → hand off to a Sonnet subagent with an explicit file list + exact pattern; judgment stays on the strongest model. Verify each phase before the next.
