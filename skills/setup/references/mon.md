# /do:run mon

Router entry for the do:mon external-reasoner consult and its sticky mode.

- `/do:run mon on` / `/do:run mon off` — enable/disable do:mon mode. The `do-mon-tracker` hook
  (UserPromptSubmit) persists the flag at `~/.claude/.do-mon-active`; just confirm the new state to
  the user. (`/do:mon on|off` and natural language like "turn off do:mon" do the same thing.)
- `/do:run mon status` — report: mode on/off, the chosen browser, the reasoner registry, and recent
  consults — read via `hooks/do-mon-config.js` (`readFlag`, `readConfig`) + `~/.claude/state/do-mon/`.
- `/do:run mon <question>` — invoke the `mon` skill to run a consult now.

The `mon` skill (`/do:mon`) owns the behavior — the consult engine, the prompt-only egress policy,
the advisory stance, and the chatgpt.com drive recipe. This route is the `/do:run` router entry and a
discoverability shim; it does not duplicate that logic.
