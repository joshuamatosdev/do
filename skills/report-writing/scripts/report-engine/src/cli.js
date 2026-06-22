#!/usr/bin/env node
// DO report engine CLI. Commands:
//   render <payload.json> [--out <file.html>] [--css <file.css>]   validate + render to HTML
//   validate <payload.json>                                        validate only, exit 1 on error
//   golden-update                                                  re-baseline the fixture hash
//
// Exit codes: 0 ok, 1 validation failed, 2 usage/IO error.

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { render } from "./render.js";
import { validate } from "./validate.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..");
const schema = JSON.parse(readFileSync(join(ROOT, "report.schema.json"), "utf8"));
const pkg = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8"));

function loadPayload(path) {
  if (!path) {
    console.error("error: missing <payload.json>");
    process.exit(2);
  }
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch (e) {
    console.error(`error: cannot read/parse ${path}: ${e.message}`);
    process.exit(2);
  }
}

function runValidate(payload) {
  const { valid, errors } = validate(payload, schema);
  if (!valid) {
    console.error(`INVALID — ${errors.length} schema error(s):`);
    for (const e of errors) console.error("  - " + e);
    process.exit(1);
  }
  return true;
}

function flagValue(name) {
  const i = process.argv.indexOf(name);
  return i !== -1 ? process.argv[i + 1] : null;
}

const [cmd, arg] = process.argv.slice(2);
const outPath = flagValue("--out");
const cssPath = flagValue("--css");
let css;
if (cssPath) {
  try {
    css = readFileSync(cssPath, "utf8");
  } catch (e) {
    console.error(`error: cannot read CSS file ${cssPath}: ${e.message}`);
    process.exit(2);
  }
}

if (cmd === "validate") {
  const payload = loadPayload(arg);
  runValidate(payload);
  console.log("VALID — payload conforms to report.schema.json");
} else if (cmd === "render") {
  const payload = loadPayload(arg);
  runValidate(payload);
  const html = render(payload, { engineVersion: pkg.version, css });
  if (outPath) {
    mkdirSync(dirname(outPath), { recursive: true });
    writeFileSync(outPath, html, "utf8");
    console.log(`rendered ${html.length} bytes -> ${outPath}`);
  } else {
    process.stdout.write(html);
  }
} else if (cmd === "golden-update") {
  // Re-render the committed fixture and rewrite its golden hash.
  const fixturePath = join(ROOT, "fixtures", "sample-report.json");
  const fixture = JSON.parse(readFileSync(fixturePath, "utf8"));
  runValidate(fixture);
  const html = render(fixture, { engineVersion: pkg.version });
  const goldenPath = join(ROOT, "fixtures", "sample-report.expected.sha256");
  const hash = createHash("sha256").update(html).digest("hex");
  writeFileSync(goldenPath, hash + "\n", "utf8");
  console.log(`golden updated -> ${hash}`);
} else {
  console.error("usage: do-report <render|validate|golden-update> [<payload.json>] [--out <file.html>] [--css <file.css>]");
  process.exit(2);
}
