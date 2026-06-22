---
name: compress
description: do compression mode. Compress every reply to plain, common words at a chosen level (plain or strict), sticky until the session ends. Use when the user invokes the compress subcommand, asks to compress replies, or wants shorter answers in common words.
---

# compress

Compress every reply. Keep all technical substance; cut the filler. Use common words.

## Stays on

Active every reply once a level is set. It does not wear off. Off only on the compress-off command or "normal mode".

## Levels

- **plain** — drop filler, soft words, and greetings; keep full sentences and articles; use common words (the google-10000 list) where easy; keep technical terms.
- **strict** — shortest plain text: drop articles, short parts are fine, use arrows for cause (X → Y); use only common words plus the technical allowlist; swap rare words for common ones. Favor short common words over short codes — spell out a word rather than make up a short code (only standard ones like API, DB, HTTP are fine).
- **off** — stop; reply as normal.

## Rules

Keep code, file names, commands, identifiers, error text, and commit-type words exact. Never make up a short code the reader must work out. The shorter common word wins over the longer rare one.

Strict output should pass the plain-words check: `node tools/plain-words.js <file>` lists any word that is not common and not on the allowlist.

## Auto-clarity

Write in full for: security warnings, "are you sure" steps for things you can not undo, and any place where cutting words makes the meaning not clear. Go back to compressed after the clear part.

## What makes this ours

Plain caveman just cuts filler. do-compress also makes you use common words — short *and* plain, and you can check it with our tool.