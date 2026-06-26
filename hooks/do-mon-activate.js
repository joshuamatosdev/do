#!/usr/bin/env node
// SessionStart: if do:mon mode is active, re-arm it with a short banner; else no-op.
const { readFlag, readConfig } = require("./do-mon-config");

if (!readFlag()) process.exit(0);
const cfg = readConfig();
const browser = cfg.browser || "not chosen yet (try built-in Claude browser first, then browser MCP fallback)";
process.stdout.write(
  `DO:MON mode ACTIVE — browser: ${browser}. You may consult an external reasoner (ChatGPT via the mon skill) on your own when it adds value. Egress prompt-only by default; the answer is advisory (weigh and test it, don't obey it).`
);
