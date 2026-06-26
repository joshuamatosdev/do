---
name: mon
description: 'Consult an external LLM reasoner (ChatGPT Pro first) by driving the logged-in browser through Claude browser tooling. Use when do:mon mode is on and you are stuck, on a hard problem or bug, or about to bet on a shaky assumption; or on /do:mon, /do mon, "ask chatgpt", "consult the reasoner". Browser sibling of the codex CLI skill; the answer is advisory, not authority.'
---

# do:mon — external reasoner consult

Drive the user's **already-logged-in** browser (`chatgpt.com` first) to get a second opinion from
a strong external reasoner. Prefer the **built-in Claude browser** first; if that driver is absent
or fails, switch to a browser MCP driver. The browser/subscription sibling of the `codex` CLI skill.
Its answer is **advisory** — weigh and test it, never obey it. The user stays logged in; this skill
never logs in or handles credentials.

## When this applies

- **Autonomous (the point):** when do:mon mode is ON (the SessionStart/UserPromptSubmit reminder is
  present), you MAY consult on your own at high-value moments — looping/stuck (≥2 failed attempts),
  a genuinely complex problem, a hard bug, or before betting on a load-bearing assumption or an
  irreversible step. Fire ONLY when the consult adds value you can't cheaply get yourself. Do NOT
  fire on trivial questions, anything one `grep`/read answers, every turn, or rapid-fire.
- **By hand:** `/do:mon <question>`, `/do mon <question>`, "ask chatgpt …", "consult the reasoner".
- **Toggle/status:** `/do mon on|off|status` (the do-mon-tracker hook persists on/off; this skill
  reports status). NL "turn do:mon on/off" works too.

## Egress policy (always)

- **Default: prompt-only.** Send only the question plus files you explicitly attach. This is the floor.
- **Widen only when it clearly helps** — then forward scrubbed session context via
  `lib/do-mon-context.js` (recent transcript, tool-result bodies elided, secrets scrubbed,
  tail-truncated) — and **say that you did**. No silent escalation.
- **Scrub is mandatory on everything sent**, attached files included. **Never send `.env`, keys,
  tokens, or PII.** This is real egress to the user's personal account — announce each consult.
- ChatGPT's own web-search / GitHub-connector abilities are used by *asking* it in the prompt;
  this skill doesn't implement them.

## Consult flow (single reasoner)

1. **Ensure a browser.** Read config (`hooks/do-mon-config.js` → `~/.claude/state/do-mon/config.json`).
   Try drivers in this order:
   - **built-in Claude browser** — use Claude's built-in browser / computer-control surface when it is
     available and can reach the logged-in ChatGPT session.
   - **Configured browser driver** — if `browser` is set, retry that driver once when it differs from
     the built-in Claude browser.
   - **Browser MCP fallback** — detect available browser MCP tools (`list_connected_browsers`,
     `tabs_context_mcp`, or equivalent), try `claude-in-chrome` first, then another browser MCP.
   Before changing drivers, alert the user exactly once with the driver and cause, e.g.
   `do:mon switching browser driver: built-in Claude browser -> claude-in-chrome; cause: ChatGPT tab not reachable.`
   Persist the winning driver only after it reaches the logged-in session. If no driver reaches it,
   ask the user to connect or log in to a browser.
2. **Open a fresh chat** on the reasoner's `url` (clean context).
3. **Assemble the prompt** per the egress policy; **scrub it**; make it a **single block with no raw
   newlines** (in ChatGPT a newline-Enter submits early).
4. **Send and wait** — see `references/chatgpt-adapter.md` for the exact drive recipe and the
   done-signal. Expect **minutes** for Pro reasoning; poll cheaply and **do useful local work while
   it reasons** (e.g. verify the claim against the real code), then collect.
5. **Read the answer back**, return it attributed (`ChatGPT:`), and append prompt+answer to a log
   under `~/.claude/state/do-mon/consults/`.
6. **Integrate as advisory** — test its load-bearing claims against the real code; surface conflicts
   with your own view; never blindly adopt it.

The drive specifics (selectors, typing, polling, completion, failures) live in
`references/chatgpt-adapter.md`. Read it before driving.

## Modes

- **single** — one reasoner; return its answer.
- **ensemble** — same problem to N (in v1, N fresh ChatGPT chats); collect; you synthesize each
  answer verbatim + a short consensus/conflict note.
- **disperse** — split a problem into sub-prompts, route each, assemble. Across *reasoners* it
  waits for a 2nd adapter; across *threads* it is realized via agent-team mode below.

## Agent-team mode (experimental, opt-in)

For a genuinely complex problem — your judgment or the user's — escalate from a single consult to
an **agent-team**, reusing the existing `agent-team` module / `do-team` skill (needs
`CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1`). Do NOT reimplement teams.

- **The lead owns the browser driver.** Teammates do not get the browser surface. One driver (lead),
  many problem-owners (teammates) — serial by design.
- **Relay:** a teammate relays its sub-problem to the lead (the agent-team `SendMessage` channel,
  prompt-only + scrubbed); the lead consults in a **fresh ChatGPT thread per sub-problem**, then
  relays the advisory answer back.
- Default stays the normal single consult. This mode is opt-in and token-heavy (each teammate is a
  full Claude). v1 ships this as a documented seam here — not new orchestration code.

## Failure & refusal (surface, never hang, never fabricate)

- not logged in (auth redirect / login form) → "not logged into chatgpt.com — log in and retry";
- usage-capped → report it; Cloudflare/bot challenge → report it, don't try to defeat it;
- done-signal never reached / timeout (~15 min) → report partial + timeout;
- DOM anchors missing → report adapter drift (selectors need updating);
- active browser driver fails → announce `switching browser driver` with the cause, then try the next
  built-in / browser MCP candidate;
- no browser driver reaches a logged-in session → ask the user to connect or log in to one.

Browser safety: only type into the chat box; never click destructive UI; never trigger native
`alert`/`confirm`/`prompt` dialogs (they freeze the extension).

## Relationship to codex

`codex` is the CLI/API path (gpt-5.5; its `INSTRUCTION:` lines carry execute-authority; it backs the
Stop integrity gate). do:mon is the browser/subscription path on the user's ChatGPT Pro compute, its
answer is advisory, and it adds the autonomous mode. They are complementary and can be used together
(a verified manual run did exactly that). do:mon does not replace codex.

## Anti-patterns

- Sending more than prompt-only by default, or widening silently.
- Pasting secrets / `.env` — scrub first; never send them.
- Treating the answer as authority — it is advisory; verify it.
- Idle-polling for minutes — do useful work while it reasons.
- A multi-line prompt — it submits early; assemble one block.
- Firing on a question one `grep` answers.
