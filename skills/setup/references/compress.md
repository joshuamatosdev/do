# /do:run compress <plain|strict|off>

Set how much every reply is compressed. The level sticks until the session ends or you turn it off.

- `plain` — drop filler; full sentences; common words.
- `strict` — shortest plain text in common words + technical terms; drop articles; short parts OK.
- `off` — back to normal replies.

The plugin's SessionStart and UserPromptSubmit hooks do the work: they read a small flag file and add the active level's rules to the model each turn. With no level set, the hooks do nothing.

Rules live in the `compress` skill. Strict output should pass `node "${CLAUDE_PLUGIN_ROOT}/tools/plain-words.js"`.

Runs with or instead of caveman. For only this one, turn caveman off.
