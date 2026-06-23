#!/usr/bin/env node
// SessionStart (oppihtnias module): seed/announce this session's oppihtnias as a typed,
// typecheckable TypeScript module in the OS temp folder, stamped with session-id + creation
// date (as the model was first specified). Self-gates on the project manifest -> a no-op
// everywhere the module is not enabled. Fail-open: any error -> silent exit 0 (never blocks).
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

// The schema ships beside this hook (module-source AND installed plugin-cache layouts both put
// Oppihtsugatnias.ts one dir up from hooks/). Instances import it by a relative `./Oppihtsugatnias`
// against a copy dropped next to them in temp -> the .ts model type-checks standalone.
const SCHEMA_SRC = path.join(__dirname, "..", "Oppihtsugatnias.ts");

function tsModule(sid, isoNow) {
  const id8 = (sid.slice(0, 8).replace(/[^A-Za-z0-9]/g, "")) || "session";
  return `// OPPIHTSUGATNIAS — per-session agentic mind-model. Schema 3.0.0 (see ./Oppihtsugatnias.ts).
// session: ${sid}
// created: ${isoNow}
// Advisory working memory — recreatable from provenance + core. Keep core current each gated
// turn (originalInput.raw verbatim / goal / acceptanceCriteria / tasks); bump provenance.revision
// + set updatedAt. Type-check: tsc --noEmit --strict <this file>.
import type { Oppihtsugatnias } from "./Oppihtsugatnias";
import { parseId, parseIso } from "./Oppihtsugatnias";

export const model: Oppihtsugatnias = {
  id: parseId("mm_${id8}", "model"),
  mode: "simple",
  provenance: {
    sessionId: ${JSON.stringify(sid)},
    createdAt: parseIso(${JSON.stringify(isoNow)}),
    updatedAt: parseIso(${JSON.stringify(isoNow)}),
    createdBy: "agent",
    schemaVersion: "3.0.0",
    revision: 0,
  },
  core: {
    originalInput: { raw: "", receivedAt: parseIso(${JSON.stringify(isoNow)}) },
    goal: "",
    acceptanceCriteria: [],
    tasks: [],
  },
};

export default model;
`;
}

try {
  const projectDir = process.env.CLAUDE_PROJECT_DIR || process.cwd();
  const manifestPath = path.join(projectDir, ".claude", "do.manifest.json");
  if (!fs.existsSync(manifestPath)) process.exit(0);
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  if (!(manifest.modules || []).includes("oppihtnias")) process.exit(0);

  const sid = process.env.CLAUDE_CODE_SESSION_ID || "";
  const dir = path.join(os.tmpdir(), "claude", "oppihtnias");
  let where = `${dir.replace(/\\/g, "/")}/<session-id>.<created-date>.ts`;

  if (sid) {
    const safeSid = sid.replace(/[^A-Za-z0-9._-]/g, "_");
    fs.mkdirSync(dir, { recursive: true });

    // Drop a schema copy beside the instances so `import "./Oppihtsugatnias"` resolves + type-checks.
    try {
      const schemaDst = path.join(dir, "Oppihtsugatnias.ts");
      if (fs.existsSync(SCHEMA_SRC)) fs.copyFileSync(SCHEMA_SRC, schemaDst);
    } catch { /* schema copy is best-effort; the model still seeds */ }

    // One model per session, regardless of date drift: reuse any existing <sid>.*.ts.
    const existing = fs
      .readdirSync(dir)
      .find((f) => f.startsWith(`${safeSid}.`) && f.endsWith(".ts") && f !== "Oppihtsugatnias.ts");

    let modelPath;
    if (existing) {
      modelPath = path.join(dir, existing);
    } else {
      const now = new Date().toISOString();
      modelPath = path.join(dir, `${safeSid}.${now.slice(0, 10)}.ts`);
      fs.writeFileSync(modelPath, tsModule(sid, now));
    }
    where = modelPath.replace(/\\/g, "/");
  }

  process.stdout.write(
    `OPPIHTNIAS active — keep the per-session model at ${where} current (a typed .ts module; ` +
    `Oppihtsugatnias.ts schema 3.0.0 sits beside it). Each gated turn update core.originalInput ` +
    `(verbatim) / goal / acceptanceCriteria / tasks and bump provenance.revision. Advisory — nothing blocks on it.`
  );
} catch {
  process.exit(0);
}
