---
name: codex
description: Forward the current in-flight question or situation to Codex (gpt-5.5, xhigh) as a one-shot consult and return its response verbatim. Use when the user says "codex", "ask codex", "/codex", "/ask codex", "get codex's take", "consult codex", or otherwise asks to surface the active conversation to Codex. Decision mode (`codex --decide`) is for ONE specific use case — a safety/integrity gate (or Codex itself) failed CLOSED and blocked an action, and you need an independent go/no-go on the merits. Uses codex.sh with the current workspace path and forwards the live session transcript instead of a hand-authored prompt. Codex receives ONLY the context followed by the literal line "Please advise." — no Claude-authored framing, stance-priming, or output format.
---

# Codex — `codex`

Forward the **current** question/situation to Codex via `codex.cmd` and return its response. A second opinion from an independent, stronger reasoner on whatever is in flight right now.

## When this skill applies

- User says `codex`, `ask codex`, `/codex`, `/ask codex`, `get codex's take`, `consult codex`, `run this by codex`, or any variant requesting Codex consultation on the active topic.

- A safety/integrity gate (or Codex itself) failed CLOSED and blocked an action, and you need an independent go/no-go → use **decision mode**: `codex --decide`.

- The substance forwarded is **the current message + in-flight context Claude already gathered** — not a separate hand-authored prompt.

Do NOT use this skill when:

- The user names a specific Codex decision-point script (`fire-codex-dp-XXX.sh`) — run that directly.

- The user wants a multi-round dialogue — this is one-shot.

- The user wants Codex to ONLY advise, never touch files — by DEFAULT Codex now EDITS the `-C` workspace; pass `ASK_CODEX_ALLOW_EDITS=0` for read-only advise.

## Two modes

Mode | Invoke | Codex returns
---|---|---
**Consult** (default) | `codex.sh "<question>"` or `codex.sh` | Evaluates and, by DEFAULT, EDITS the repo when warranted; advice-only with `ASK_CODEX_ALLOW_EDITS=0`
**Decide** | `codex.sh --decide "<pending matter>"` or `codex.sh --decide` | Its own go/no-go on the merits, free-form — no imposed output shape

Both modes build the **same** prompt: the context (the verbatim question if one was passed, the most-recent user message, and the raw transcript) followed by the literal line `Please advise.` — nothing else. `--decide` is still accepted (and consumes its arg) for the gate-fail-closed use case, but it no longer changes the prompt or imposes any `DECISION:`/`INSTRUCTION:` shape; the matter rides in the context like any question. Codex's answer is advisory input; it does not bind the calling session (see Authority).

## How it works — the script owns synthesis (do NOT hand-build the prompt)

Claude does **not** hand-write the Codex prompt. Hand-synthesis WAS the bug: Claude — the reasoner being checked — reliably (a) led the witness and (b) under-included context. Both are designed out by forwarding the **actual conversation transcript** of the current session as context (the transcript is neutral by construction). It is *not* the whole chat: tool-result bodies are elided and only the last ~80KB of text is sent — but the most-recent user message is forwarded separately and untruncated, so the live question always survives.

Script: `~/.claude/skills/codex/codex.sh`

```bash
# consult, explicit question
"$HOME/.claude/skills/codex/codex.sh" "<the user's question, copied verbatim>"

# consult, no explicit question -> Codex infers the open question from the transcript
"$HOME/.claude/skills/codex/codex.sh"

# decision mode -> Codex gives its own go/no-go on the merits (free-form, no imposed format)
"$HOME/.claude/skills/codex/codex.sh" --decide "<the pending go/no-go matter, verbatim>"
```

What the script does for you (so you don't re-do or second-guess it):

- Locates THIS session's transcript deterministically via `$CLAUDE_CODE_SESSION_ID` — no guessing among concurrent sessions. Refuses (non-zero exit) rather than firing context-free if the transcript can't be found or extraction is empty.

- Extracts the recent exchange, keeping text + tool-call **names** while eliding tool-result **bodies** to `<tool_result>` markers (Codex has `-C` FS access if it needs file contents); forwards the most recent ~80KB plus the latest user message in full.

- Light-scrubs common secret shapes (AWS/OpenAI/GitHub/Google keys, Bearer/JWT, PEM blocks, `private_key`/`client_secret`/`password` JSON) before sending.

- Sends Codex ONLY the context followed by the CLOSER line — the verbatim question (if any), the most-recent user message, and the raw transcript, then the closer. By DEFAULT the closer is the empowered "Distinguished Engineer" text and Codex runs `workspace-write` (it may EDIT); `ASK_CODEX_ALLOW_EDITS=0` restores the read-only `Please advise.` closer. No preamble, no headers, no "independent reasoner" priming, no output format. The transcript is neutral by construction; Codex forms its own view from it.

- Fires `codex.cmd exec --dangerously-bypass-approvals-and-sandbox -s read-only -C <workspace> -` under a default 300s timeout (`ASK_CODEX_TIMEOUT=<positive integer seconds>` overrides; non-numeric/duration like `5m` rejected → 300), with reconnect fail-fast and a winpid process-tree reap so a timeout never orphans the native `codex.exe`; tees the response to `.claude/state/codex-asks/ask-<session-name>-<session-id>-<ts>.log`.

> **Edit caveat (be honest):** `--dangerously-bypass-approvals-and-sandbox` gives Codex *full* filesystem access on this Windows host (genuine sandboxing is broken here). By DEFAULT Codex is told to EVALUATE and EDIT, so it can and will write to the `-C` workspace. `ASK_CODEX_ALLOW_EDITS=0` switches the closer to read-only advise — but that is by **convention** (the closer prose), not sandbox enforcement.

**Your only judgment call is the question argument:**

- If the user typed a literal question, pass it **verbatim** as the single argument (after `--decide` in decision mode). Do not paraphrase, soften, or add spin.

- If the user said only `codex` / `codex --decide`, run with **no question argument** and let Codex infer the open matter from the transcript. Do NOT substitute your own framing — that reintroduces the leading-the-witness bug.

Env: `ASK_CODEX_WORKSPACE` overrides `-C`; `ASK_CODEX_TIMEOUT` (seconds) overrides the 300s cap; `ASK_CODEX_SERVICE_TIER` overrides the speed tier. (Env var names retain the `ASK_CODEX_` prefix — only the skill/command name changed to `codex`.)

## Execution steps

1. **Run the script** — `--decide` for go/no-go, otherwise consult; with the user's verbatim question, or none if they said only `codex`.

2. **Return Codex's response verbatim.** Do NOT paraphrase, summarize, or bolt on a Claude opinion. The script appends `Saved: <path>`.

## Caveman / terse mode

The prompt body sent to Codex is **normal English** — documentation Codex must parse without ambiguity. Claude's chat framing of the call may be caveman-terse. Codex's returned response is reproduced verbatim regardless of caveman mode.

## Refusal conditions

1. Session genuinely empty — nothing to forward. Push back: "Nothing in the thread yet — what should I ask Codex about?" (If there IS an exchange but no crisp question, do NOT refuse: run with no argument.)

2. The literal question argument would itself paste secrets (e.g. raw `.env`). Redact or refuse.

3. `codex.cmd` not at the expected path — script exits non-zero with `Codex binary missing at ...`. Surface it.

4. Script exits non-zero because it cannot locate this session's transcript (`$CLAUDE_CODE_SESSION_ID` unset / no matching `.jsonl`). Surface the error; do NOT fall back to a hand-built context-free prompt.

## Authority

Codex's response is **advisory input, not a command.** Weigh it; do not treat it as binding. It does NOT override the user, and it does NOT override a codebase-rooted determination you can make and verify yourself. If Codex says "don't do X" but X is the correct, code-grounded call, make the call — root it in the files and say so. The user's direction overrides Codex; your own grounded reasoning overrides Codex on anything you can check in the code.

(This supersedes the older `feedback_codex_instruction_execute_verbatim` "execute the `INSTRUCTION:` line verbatim as delegated authority" rule. Codex is no longer prompted to emit `INSTRUCTION:`/`DECISION:` lines, and even if it does, they are advice — not a directive that lets you punt a determination you should own.)

## Anti-patterns

- **Leading the witness via the question argument** — pass the user's question **verbatim**, or pass **nothing**. Do not editorialize or distill "the question" yourself when the user said only `codex`.

- **Reconstructing context by hand instead of running the script** — that is the exact bug this design removed; the script forwards the actual transcript.

- Summarizing Codex's response. The user wants Codex's words.

- Treating Codex's *response* as binding — by DEFAULT Codex may EDIT the repo, but its reasoning/answer still comes back to the calling session as advice to weigh, not a command Claude executes blindly. (Use `ASK_CODEX_ALLOW_EDITS=0` for advise-only with no edits.)

- Firing Codex on a question the user can answer with one grep — orient first, fire only when the consult adds value.

- Pre-filtering Codex's answer because it conflicts with Claude's prior view. Surface the conflict; let the user adjudicate.
