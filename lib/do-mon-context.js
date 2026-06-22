const fs = require("node:fs");

const TAIL_BYTES = 80000;
const ENVELOPE = /^\s*<(local-command|command-name|command-message|command-args|system-reminder)/i;

function scrub(text) {
  let s = String(text == null ? "" : text);
  s = s.replace(/-----BEGIN[A-Z ]*PRIVATE KEY-----[\s\S]*?-----END[A-Z ]*PRIVATE KEY-----/g, "[REDACTED_PRIVATE_KEY_BLOCK]");
  s = s.replace(/AKIA[0-9A-Z]{16}/g, "[REDACTED_AWS_KEY]");
  s = s.replace(/(Bearer )[A-Za-z0-9._~+/-]+=*/g, "$1[REDACTED]");
  s = s.replace(/eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, "[REDACTED_JWT]");
  s = s.replace(/sk-[A-Za-z0-9_-]{16,}/g, "[REDACTED_OPENAI_KEY]");
  s = s.replace(/gh[pousr]_[A-Za-z0-9]{20,}/g, "[REDACTED_GITHUB_TOKEN]");
  s = s.replace(/AIza[A-Za-z0-9_-]{20,}/g, "[REDACTED_GOOGLE_KEY]");
  // Generic key=value / key:value secret redaction. The value may be double-quoted,
  // single-quoted, or bare (a bare value stops at whitespace, comma, or semicolon).
  // This catches .env-style KEY=value and key: 'value' in addition to JSON "key":"value".
  s = s.replace(
    /("?(?:private_key|client_secret|api_key|password|secret|token)"?\s*[:=]\s*)(?:"[^"]*"|'[^']*'|[^\s,;]+)/gi,
    "$1[REDACTED]",
  );
  return s;
}

function messageText(content) {
  if (Array.isArray(content)) {
    return content.map((c) => {
      if (c.type === "text") return c.text;
      if (c.type === "tool_use") return `<tool_use:${c.name || "?"}>`;
      if (c.type === "tool_result") return "<tool_result>";
      return "";
    }).join("\n");
  }
  if (typeof content === "string") return content;
  return "";
}

function userText(content) {
  if (Array.isArray(content)) return content.filter((c) => c.type === "text").map((c) => c.text).join("\n");
  if (typeof content === "string") return content;
  return "";
}

function extractTranscript(jsonlPath, { tailBytes = TAIL_BYTES } = {}) {
  const raw = fs.readFileSync(jsonlPath, "utf8");
  const parts = [];
  let lastUser = "";
  for (const line of raw.split(/\r?\n/)) {
    if (!line) continue;
    let obj; try { obj = JSON.parse(line); } catch { continue; }
    if (obj.type !== "user" && obj.type !== "assistant") continue;
    const tag = obj.type === "user" ? "[USER]" : "[ASSISTANT]";
    parts.push(`${tag} ${messageText(obj.message && obj.message.content)}`);
    if (obj.type === "user") {
      const ut = userText(obj.message && obj.message.content);
      if (ut && !ENVELOPE.test(ut)) lastUser = ut;
    }
  }
  let conv = scrub(parts.join("\n"));
  lastUser = scrub(lastUser);
  let truncNote = "";
  if (Buffer.byteLength(conv, "utf8") > tailBytes) {
    conv = Buffer.from(conv, "utf8").slice(-tailBytes).toString("utf8");
    truncNote = `[... earlier turns truncated; showing last ${tailBytes} bytes. The most-recent user message is reproduced in full, so the current question is intact. ...]`;
  }
  return { conv, lastUser, truncNote };
}

// CLI: `node do-mon-context.js --scrub` reads stdin, writes the scrubbed text to
// stdout, and exits 0 — so any egress path can reuse this one scrub() implementation.
if (require.main === module && process.argv.includes("--scrub")) {
  let input = "";
  try {
    input = fs.readFileSync(0, "utf8");
  } catch {
    input = "";
  }
  process.stdout.write(scrub(input));
  process.exit(0);
}

module.exports = { scrub, extractTranscript, TAIL_BYTES };
