"use strict";
const fs = require("node:fs");
const { dirname } = require("node:path");
const MAX = 256 * 1024;

function emptyState(slug) {
  return {
    slug,
    source: { kind: "unset", path: null, reportId: null, confidence: null },
    deliverable: "spec",        // spec | catalog | both
    mode: "interactive",         // interactive | yolo
    sections: {},                // title -> "todo" | "draft" | "done"
    decisions: [],               // { id, question, chosen, rejected, why }
    openQuestions: [],           // strings
    percent: 0,
    draftPath: null,
  };
}

function writeState(file, state) {
  const st = fs.existsSync(file) && fs.lstatSync(file).isSymbolicLink();
  if (st) throw new Error("refusing to write through a symlink");
  fs.mkdirSync(dirname(file), { recursive: true });
  const tmp = file + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(state, null, 2));
  fs.renameSync(tmp, file);
}

function readState(file) {
  try {
    const st = fs.lstatSync(file);
    if (st.isSymbolicLink() || !st.isFile() || st.size > MAX) return null;
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch { return null; }
}

module.exports = { emptyState, writeState, readState };
