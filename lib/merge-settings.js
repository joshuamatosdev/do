// Merge a partial hooks block into a settings object without clobbering.
// `do`-owned hooks are tagged `_do: true`. We ALWAYS strip every `_do`-tagged
// hook from EVERY event first (at the individual-hook level, preserving any
// user hooks that share a group; dropping groups left empty, and events left
// empty). This is the remediation path: a target whose settings.json still
// carries stale `_do` ${CLAUDE_PLUGIN_ROOT} hooks (which the current CLI rejects
// fatally) gets them cleaned even when the incoming partial no longer declares
// that event. Then we append the partial's groups fresh for any event it does
// declare. With an empty partial, this is pure cleanup.
//
// Env keys get the symmetric treatment. A module's settings partial union-merges
// env keys into settings.json (e.g. agent-team sets CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1).
// A plain union is one-directional: disabling/uninstalling that module never removes the
// key, so it lingers forever. Hooks avoid this because the `_do:true` tag lets us recognize
// and strip a do-owned hook even when no partial re-declares it. Env values are bare strings
// with nowhere to hang such a tag, so we keep the equivalent record OUT OF BAND: a do-owned
// ledger (`_doEnv`) on the settings object remembers which env keys do contributed, and the
// exact value it wrote. On every merge we FIRST strip every ledger-listed key whose current
// value still equals what do wrote (a key the user has since edited is theirs now — left
// untouched, mirroring how a user hook sharing a do group is preserved), then union the
// partial's env and re-record those keys. A removed module simply stops re-contributing, so
// its key stays stripped — symmetric with the hook path. With an empty partial, this is pure
// cleanup. `_doEnv` is internal bookkeeping; it is never itself an env var.
//
// Reconciliation unit (shared with the hook strip): the strip authority is one merge per source.
// install.js drives exactly that — the spine partial once, then each ACTIVE module partial once —
// so a key the previous install recorded but that no active source re-contributes this install is
// stripped, while every key an active source still declares is re-unioned and kept. Disabling a
// module just drops its merge call, so its key is no longer re-contributed and falls away.
//
// Limitation (caller's to close, not fixable in this 2-arg function): each call sees only its own
// partial, never the install-wide active set. If two DIFFERENT sources each contributed a key last
// install and only one is active now, a single chained pass can strip the still-active sibling
// before its own merge re-adds it — net-correct only because every active source gets its own merge.
// Today the spine contributes no env and exactly one module (agent-team) contributes one key, so no
// two sources contend. A future second env-contributing module needs install.js to pass the full
// active env-key set (a third arg / finalize step) for cross-source reconciliation; the per-source
// strip below stays correct under that change.
function mergeSettings(existing, partial) {
  const out = structuredClone(existing || {});
  out.hooks = out.hooks || {};
  for (const event of Object.keys(out.hooks)) {
    const stripped = (out.hooks[event] || []).flatMap((g) => {
      const userHooks = (g.hooks || []).filter((h) => !(h && h._do === true));
      return userHooks.length ? [{ ...g, hooks: userHooks }] : [];
    });
    if (stripped.length) out.hooks[event] = stripped;
    else delete out.hooks[event];
  }
  for (const [event, groups] of Object.entries(partial.hooks || {})) {
    // Migration/dedup: drop any pre-existing hook whose command this partial re-adds. Before partials
    // tagged their hooks `_do: true`, a do hook could land UNtagged (e.g. codex-frontier's Stop hook);
    // the `_do` strip above misses it, so a reinstall would stack a duplicate. Removing an exact-
    // command match here (which we re-add from `groups` below) dedups it without touching unrelated
    // user hooks — a hook the user wrote with that identical do command IS the do hook.
    const incoming = new Set(groups.flatMap((g) => (g.hooks || []).map((h) => h && h.command).filter(Boolean)));
    if (incoming.size && out.hooks[event]) {
      out.hooks[event] = out.hooks[event].flatMap((g) => {
        const kept = (g.hooks || []).filter((h) => !(h && incoming.has(h.command)));
        return kept.length ? [{ ...g, hooks: kept }] : [];
      });
      if (!out.hooks[event].length) delete out.hooks[event];
    }
    out.hooks[event] = (out.hooks[event] || []).concat(groups);
  }
  // Strip do-owned env keys no longer contributed, then union the partial's env.
  // Symmetric with the `_do` hook strip above: recognized do keys go first, fresh keys after.
  const ledger = { ...(out._doEnv || {}) };
  const incoming = partial.env || {};
  if (out.env) {
    for (const [k, doValue] of Object.entries(ledger)) {
      if (k in incoming) continue;            // still contributed — re-unioned below
      if (out.env[k] === doValue) {           // untouched do value — strip it
        delete out.env[k];
        delete ledger[k];
      } else {                                // user edited it away — it's theirs now
        delete ledger[k];
      }
    }
  }
  if (Object.keys(incoming).length) {
    out.env = out.env || {};
    for (const [k, v] of Object.entries(incoming)) {
      if (!(k in out.env)) out.env[k] = v;    // never clobber a user value
      ledger[k] = v;                          // record as do-owned (the value do wrote)
    }
  }
  if (Object.keys(ledger).length) out._doEnv = ledger;
  else delete out._doEnv;
  if (out.env && !Object.keys(out.env).length) delete out.env;
  return out;
}
module.exports = { mergeSettings };
