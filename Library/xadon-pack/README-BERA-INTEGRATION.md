# Bera extra command integration

This directory contains the imported command sources from `musteqeem/XADON` at audited commit `75bd8e1286b57740d12bf780d6f5cd06a8591a3a` (MIT license). The compatibility bridge is `Library/lib/xadon-bridge.js`; source modules stay isolated under `src/` so their relative imports remain intact. The adapted database helper stores pack state in Bera's existing `global.db.data.xadon` namespace and uses Bera's configured persistence.

At startup Bera registers imported commands only when they do not collide with an existing Bera command. To access an imported command by name or source path—including duplicate declarations—use `.beraextra <command-or-path> [arguments]`; `.beraextra list [page]` lists the active declarations. Imported commands do not claim the `.beraextra` namespace or expose source-branded aliases.

Evaluation and shell execution are handled exclusively by Bera's native owner-only command branches. The aliases are `.eval`, `.>`, `.#`, `.js`, `.jseval`, `.evaljs` for JavaScript, and `.$`, `.bash`, `.shell`, `.sh`, `.exec`, `.run`, `.terminal`, `.cmd` for shell. The imported eval module is not registered for execution. Never run eval or shell as part of tests or enable them for public/untrusted access: these commands run with the Bera server process's operating-system permissions.

Other imported privileged modules are disabled unless individually reviewed and explicitly allowlisted with `BERA_IMPORTED_PRIVILEGED_ALLOWLIST`, a comma-separated list of exact source paths. They remain subject to Bera's owner check and applicable group/admin restrictions. The allowlist is empty by default.

The bridge uses Bera's existing `@whiskeysockets/baileys` package rather than installing the source project's Baileys fork. The upstream `.nodax` command cannot load because its pinned source references a missing root `nodax` module. Some other commands may require external service credentials or be affected by upstream API availability. Declaration/import counts do not mean every command has been exercised against a live WhatsApp session.
