## commit-doctor

When a `git commit` fails, do not retry it blindly. The commit-doctor hook fires on the failed
command and tells you to dispatch the **do:commit** agent, which classifies the cause (failing hook,
formatter, linter, test), fixes it, re-stages, and retries — **never** with `--no-verify` or `SKIP=`.

- Bounded to **3** automatic heal attempts per commit command; a new commit command resets the count.
- On the 4th failure it stops, writes an incident to `.claude/incidents/`, and hands the decision back
  to you. A commit left unfinished is honest; a skipped gate is not.
