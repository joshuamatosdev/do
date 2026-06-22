#!/usr/bin/env node
// SessionStart: if a compress level is active, emit that level's rules; else nothing.
const fs = require("node:fs");
const path = require("node:path");
const { readFlag } = require("./do-compress-config");

const level = readFlag();
if (!level) process.exit(0); // no-op when inactive

let rules = "";
try {
  const skill = fs.readFileSync(path.join(__dirname, "..", "skills", "compress", "SKILL.md"), "utf8");
  const body = skill.replace(/^---[\s\S]*?---\s*/, "");
  rules = body.split("\n").filter((line) => {
    const m = line.match(/^- \*\*(\S+?)\*\*/); // a level bullet
    return m ? m[1] === level : true;          // keep only the active level's bullet
  }).join("\n").trim();
} catch { /* fall through with empty rules */ }

process.stdout.write(`DO-COMPRESS ACTIVE — level: ${level}\n\n${rules}`);
