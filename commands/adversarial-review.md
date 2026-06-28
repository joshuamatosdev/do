---
description: 'Two-pass change review: a generator finds issues in the diff, then a skeptic refutes each; only survivors are reported.'
argument-hint: (no args — reviews the current staged/working diff)
---

You are running `/do:adversarial-review`.

Run the adversarial-review workflow **by path** with the Workflow tool — pass `scriptPath`, never an
inline `script`:

```
Workflow({ scriptPath: "${CLAUDE_PLUGIN_ROOT}/workflows/adversarial-review.js" })
```

Why by path: the inline-`script` ("dynamic") form trips the harness approval validator
(`script contains control characters that would be hidden in the approval dialog`) even when the
script file is byte-clean; the `scriptPath` form carries no inline script string, so the check does
not fire. This matches the documented intent — these workflows are "run with the Workflow tool by
path" (CLAUDE.md).

The workflow gathers the diff itself (`git diff HEAD`, then `git diff --cached`) and returns
`{ confirmed, dropped }`. Report the confirmed findings (severity, title, file, detail); if
`confirmed` is empty, state the change passed adversarial review with nothing to report.
