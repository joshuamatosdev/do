// Regression tests for public-readiness residue scrub of docs/.
// Each test FAILS on the old content and PASSES on the scrubbed content.
"use strict";
const { test } = require("node:test");
const assert = require("node:assert");
const { readdirSync, readFileSync, statSync } = require("node:fs");
const { join, extname } = require("node:path");

const DOCS_DIR = join(__dirname, "..", "docs");

// Collect all .md files under docs/ recursively.
function collectMd(dir, acc = []) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      collectMd(full, acc);
    } else if (extname(name) === ".md") {
      acc.push(full);
    }
  }
  return acc;
}

const FILES = collectMd(DOCS_DIR);

function allText() {
  return FILES.map((f) => readFileSync(f, "utf8")).join("\n");
}

// (1) Personal email must not appear anywhere in docs/.
test("docs/ contains no personal email address", () => {
  const text = allText();
  assert.ok(
    !text.includes("josh@joshuamatos.com"),
    "docs/ must not contain the personal email josh@joshuamatos.com"
  );
});

// (2) Private project name ttx-workspace must not appear anywhere in docs/.
test("docs/ contains no reference to the private project ttx-workspace", () => {
  const text = allText();
  assert.ok(
    !text.includes("ttx-workspace"),
    "docs/ must not contain the private project name ttx-workspace"
  );
});

// (3) Private project name whiskeydroid (any case) must not appear in docs/.
test("docs/ contains no reference to the private project whiskeydroid", () => {
  const text = allText();
  assert.ok(
    !/whiskeydroid/i.test(text),
    "docs/ must not contain the private project name whiskeydroid (any case)"
  );
});
