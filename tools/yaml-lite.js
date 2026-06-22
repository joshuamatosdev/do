// yaml-lite.js — a tiny reader for the restricted YAML subset the adr spec
// template uses. Zero deps, standard library only. NOT a general YAML parser:
// it covers exactly the constructs in adr-implementation-spec.template.yaml —
// the same "only the part we use" move report-engine/src/validate.js makes.
//
// Subset: line + inline '#' comments (outside quotes/braces), block mappings,
// block sequences (scalar or mapping items), recursive inline flow maps/seqs,
// double-quoted and bare scalars, ints / true / false, and '>' or '|' block
// scalars (consumed opaquely as a joined string — their content is never parsed).

"use strict";

function stripComment(line) {
  // Remove a '#' comment when not inside quotes or braces/brackets.
  let q = null, depth = 0;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (q) { if (c === q) q = null; continue; }
    if (c === '"' || c === "'") { q = c; continue; }
    if (c === "{" || c === "[") depth++;
    else if (c === "}" || c === "]") depth--;
    else if (c === "#" && depth === 0 && (i === 0 || line[i - 1] === " " || line[i - 1] === "\t")) {
      return line.slice(0, i);
    }
  }
  return line;
}

function scalar(raw) {
  const s = raw.trim();
  if (s === "") return "";
  if (s === "true") return true;
  if (s === "false") return false;
  if (s === "null" || s === "~") return null;
  if (/^-?\d+$/.test(s)) return parseInt(s, 10);
  if (/^-?\d+\.\d+$/.test(s)) return parseFloat(s);
  if (s[0] === '"' && s[s.length - 1] === '"') return s.slice(1, -1).replace(/\\"/g, '"');
  if (s[0] === "'" && s[s.length - 1] === "'") return s.slice(1, -1).replace(/''/g, "'");
  return s;
}

// Parse an inline flow value: { ... } map, [ ... ] seq, or a scalar.
function parseFlow(raw) {
  const s = raw.trim();
  if (s[0] === "{") return parseFlowMap(s);
  if (s[0] === "[") return parseFlowSeq(s);
  return scalar(s);
}

// Split top-level comma items, respecting nested {} [] and quotes.
function splitItems(inner) {
  const out = []; let depth = 0, q = null, cur = "";
  for (let i = 0; i < inner.length; i++) {
    const c = inner[i];
    if (q) { cur += c; if (c === q) q = null; continue; }
    if (c === '"' || c === "'") { q = c; cur += c; continue; }
    if (c === "{" || c === "[") { depth++; cur += c; continue; }
    if (c === "}" || c === "]") { depth--; cur += c; continue; }
    if (c === "," && depth === 0) { out.push(cur); cur = ""; continue; }
    cur += c;
  }
  if (cur.trim() !== "") out.push(cur);
  return out;
}

function parseFlowMap(s) {
  const inner = s.slice(1, -1);
  const obj = {};
  for (const item of splitItems(inner)) {
    const idx = splitKeyIdx(item);
    const key = item.slice(0, idx).trim();
    const val = item.slice(idx + 1).trim();
    obj[scalar(key)] = parseFlow(val);
  }
  return obj;
}

function parseFlowSeq(s) {
  const inner = s.slice(1, -1);
  return splitItems(inner).map((x) => parseFlow(x));
}

// Index of the ':' that separates key and value at flow-map top level.
function splitKeyIdx(item) {
  let depth = 0, q = null;
  for (let i = 0; i < item.length; i++) {
    const c = item[i];
    if (q) { if (c === q) q = null; continue; }
    if (c === '"' || c === "'") { q = c; continue; }
    if (c === "{" || c === "[") depth++;
    else if (c === "}" || c === "]") depth--;
    else if (c === ":" && depth === 0) return i;
  }
  return -1;
}

const indentOf = (l) => l.length - l.replace(/^ +/, "").length;

// Recursive descent over a list of {indent, text} lines via a cursor object {i}.
function parseBlock(lines, cur, minIndent) {
  // Decide: mapping or sequence by the first non-empty line at this level.
  const first = lines[cur.i];
  if (first.text.startsWith("- ")) return parseSeq(lines, cur, first.indent);
  return parseMap(lines, cur, first.indent);
}

function parseMap(lines, cur, indent) {
  const obj = {};
  while (cur.i < lines.length) {
    const line = lines[cur.i];
    if (line.indent < indent) break;
    if (line.indent > indent) break; // shouldn't happen at map level
    const text = line.text;
    const idx = splitKeyIdx(text);
    const key = scalar(text.slice(0, idx).trim());
    let rest = text.slice(idx + 1).trim();
    cur.i++;
    if (rest === ">" || rest === "|") { obj[key] = consumeBlockScalar(lines, cur, indent); continue; }
    if (rest === "") {
      // nested block (map or seq) at greater indent, or empty
      if (cur.i < lines.length && lines[cur.i].indent > indent) obj[key] = parseBlock(lines, cur, lines[cur.i].indent);
      else obj[key] = null;
      continue;
    }
    obj[key] = parseFlow(rest);
  }
  return obj;
}

function parseSeq(lines, cur, indent) {
  const arr = [];
  while (cur.i < lines.length) {
    const line = lines[cur.i];
    if (line.indent < indent || !line.text.startsWith("- ")) break;
    const after = line.text.slice(2);
    const innerIndent = line.indent + 2;
    // Replace the "- " marker with spaces so a mapping item parses by indent.
    if (splitKeyIdx(after) >= 0 && after.trim()[0] !== "{" && after.trim()[0] !== "[") {
      // mapping item: synthesize a sub-line list starting with `after`
      lines[cur.i] = { indent: innerIndent, text: after };
      arr.push(parseMap(lines, cur, innerIndent));
    } else {
      cur.i++;
      arr.push(parseFlow(after));
    }
  }
  return arr;
}

function consumeBlockScalar(lines, cur, parentIndent) {
  const parts = [];
  while (cur.i < lines.length && lines[cur.i].indent > parentIndent) {
    parts.push(lines[cur.i].text.trim());
    cur.i++;
  }
  return parts.join(" ");
}

function parseYaml(text) {
  const lines = [];
  for (const raw of text.split(/\r?\n/)) {
    const noComment = stripComment(raw);
    if (noComment.trim() === "") continue;
    lines.push({ indent: indentOf(noComment), text: noComment.replace(/^ +/, "").replace(/\s+$/, "") });
  }
  if (lines.length === 0) return {};
  const cur = { i: 0 };
  return parseBlock(lines, cur, lines[0].indent);
}

module.exports = { parseYaml };
