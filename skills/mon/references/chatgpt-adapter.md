# chatgpt.com adapter recipe

Grounded in manual session `b6b946f2` (a verified by-hand run). Re-verify selectors against the
live DOM — the DOM drifts; prefer role/text anchors over brittle CSS, and be defensive.

## Connect

1. Load the `claude-in-chrome` tools (one ToolSearch with the core set:
   `tabs_context_mcp,navigate,computer,read_page,get_page_text`).
2. `tabs_context_mcp { createIfEmpty: true }` to learn current tabs.
3. `navigate { url: "https://chatgpt.com/", tabId }`.
4. One `computer { action: "screenshot" }` to confirm the page loaded and is **logged in** (Pro
   shows the "What's on the agenda today?" composer). If a login/auth screen shows → not logged in.

## Send

- New chat = navigate fresh to `https://chatgpt.com/`.
- Click the composer: `computer { action: "left_click", coordinate: [..] }`, then type:
  `computer { action: "type", text: "<the whole prompt>" }`.
- **The prompt MUST be a single block with NO raw newlines** — in ChatGPT a newline-bearing Enter
  submits early. Assemble one line.
- Verify the full prompt is in the box (read it back), then submit: `computer { action: "key", text: "Return" }`.

## Wait for completion — expect MINUTES

- Pro deep-reasoning ran **8m56s** then **9m29s** in the source session. Treat a consult as a
  multi-minute op. Default hard timeout ~15 min (`timeoutSec: 900`).
- Poll with **light `get_page_text` every ~10s** — cheap. Do NOT poll with screenshots (50–96 KB each).
- While streaming, `get_page_text` returns the *thinking trace* ("Finalizing answer", etc.) and may
  not surface the rendered final answer. **Confirm completion with ONE `screenshot`**: the composer
  has returned / generation stopped. Plus the answer text stable across 2 polls.
- **Pitfall:** a `browser_batch` with too many stacked `wait` actions **times out** — poll in small
  steps (a couple of waits + one `get_page_text`). Recover from transient "extension blip" errors by re-reading.
- **Work while it reasons:** don't idle. Verify the claim against the real code meanwhile; the
  external answer is a cross-check, not a bottleneck.

## Read back

- After completion, `get_page_text` returns the full answer (~18–34 KB observed). Take the latest
  assistant message. Return it attributed (`ChatGPT:`) and log it.

## Multi-consult (agent-team / disperse mode)

Validated in an agent-team run (`3e9a10ad`). The single-browser limit is on **driving**
(one mouse/keyboard → serial), NOT on **reasoning** (many tabs reason at once). So:

- The **lead** owns the browser; teammates never drive it. A teammate relays its sub-problem prompt
  to the lead (native `SendMessage` when `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1` was set *at launch*;
  otherwise the lead spawns background `Agent`-tool subagents and collects their prompts itself — same
  fan-out, no native cross-talk). The flag loads at launch; setting it mid-session needs a restart.
- **Serial-open, parallel-reason:** the lead opens one **fresh tab per sub-problem**, submits each,
  and lets them reason **in parallel** (e.g. 3 Pro chats × ~9 min concurrently — not 27 min serial).
- **Collect with `ScheduleWakeup`,** not idle-poll: schedule ~600s with a resume prompt naming each
  tab id + topic to read, then converge the verdicts (e.g. → `findings.json` → local sink).

## Driving gotchas (observed in b6b946f2 + 3e9a10ad + the do:mon e2e)

- **`get_page_text` is NOT valid inside `browser_batch`** ("unknown tool") — call it standalone.
- **Long-text `type` can return a CDP timeout while the text actually landed** (slow renderer on a big
  paste) — don't blindly re-type; **screenshot to confirm** the prompt is in the box first.
- **A send click at a stale/remembered coordinate misses → the typed text drops on blur.** Screenshot
  to locate the send button (or just press `Return`) — never click a coordinate from an earlier screenshot.
- **`get_page_text` can miss a just-finished answer** (streaming-extraction gap, even after "Thought for
  Nm") — take ONE screenshot to read the verdict, then retry `get_page_text` once streaming settled.

## Failure states (surface, don't hang)

- login/auth redirect or login form → not logged in;
- usage-cap message → capped;
- Cloudflare / bot challenge → report, don't defeat;
- no completion before timeout → partial + timeout;
- composer/selectors not found → adapter drift, selectors need updating.

## Registry entry (config.json)

```json
{ "id": "chatgpt", "label": "ChatGPT", "url": "https://chatgpt.com/", "enabled": true,
  "newChat": "navigate-fresh", "input": { "strategy": "click-composer-then-type" },
  "submit": "return-key", "promptShape": "single-block-no-newlines",
  "doneSignal": "composer-returned+text-stable-2-polls", "pollSec": 10, "timeoutSec": 900 }
```

A second reasoner (Gemini/Perplexity/Copilot) is added as another such entry + its own recipe
section — **data, not engine code**.
