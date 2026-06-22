// Deterministic canonicalization of a report payload.
// Recursive key ordering + LF normalization on every string so the rendered
// HTML is byte-for-byte stable regardless of how the agent ordered keys or
// what line endings its editor used. Arrays are preserved in payload order
// (their order is semantic — e.g. deploy order, commit sequence).

/** Normalize all line endings in a string to LF and strip a leading BOM. */
function normalizeString(s) {
  return s.replace(/\r\n/g, "\n").replace(/\r/g, "\n").replace(/^﻿/, "");
}

/**
 * Return a deep copy of `value` with object keys sorted lexicographically and
 * every string LF-normalized. Pure: does not mutate the input.
 */
export function canonicalize(value) {
  if (typeof value === "string") return normalizeString(value);
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    const out = {};
    for (const key of Object.keys(value).sort()) {
      out[key] = canonicalize(value[key]);
    }
    return out;
  }
  return value; // number, boolean, null
}

/** Canonical JSON string (sorted keys, 2-space indent, trailing newline, LF). */
export function canonicalJson(value) {
  return JSON.stringify(canonicalize(value), null, 2) + "\n";
}
