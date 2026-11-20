# XADON vs. Bera: source-level comparison

**Compared revisions:** XADON `75bd8e1286b57740d12bf780d6f5cd06a8591a3a` and Bera `eb720b6f3782e899c4e67e297468ed9151c84122` (the Bera `main` revision at comparison time). The working Bera checkout also contains uncommitted local edits from the separate API-key/language task; those edits are not credited as features of the compared commit. This comparison is based on source and documentation inspection, not running either WhatsApp bot or making external API calls.

## Bottom line

XADON is primarily a broad, organized WhatsApp command bot: its command loader recursively discovers modules, normalizes command metadata and permissions, and warns about collisions. Its NODAX assistant classifies requests into fixed actions, with specialized code-file repair, but the inspected code does not show a general multi-step tool planner. Bera is more ambitious as an agent platform: its planner can produce and execute multi-step action plans, and its Agent OS stores project plans and progress. That does **not** mean its ordinary `.agent` and natural-language agent paths are identical, or that every catalogued tool is operational. [1] [2] [3] [4]

Bera therefore leads in agentic execution, project automation, and deployment integrations. XADON is more consistent in command discovery, deployment instructions, and dependency reproducibility. Bera's broader host-level capabilities carry higher security and operational risks, notably unrestricted shell/code paths and workspace path handling. The highest priorities for Bera are isolating execution, validating plans, persisting generic jobs, and tightening command registration and releases. [5] [6] [7] [8]

## How the agents actually work

**XADON.** It has a conversational chatbot and NODAX, which are separate paths. The chatbot builds a prompt from context and uses an in-memory conversation map. NODAX first asks an LLM to classify a request into a fixed action vocabulary, parses that result, then falls back to regex actions if needed. It executes recognized actions as individual operations. Its strongest agent-like behavior is focused: generate or edit a code file, syntax-check it, and make bounded repair attempts; edits also use backup/restore behavior. This is useful automation, but the inspected NODAX path is not a general plan with dependencies, arbitrary tool calls, step checkpoints, and restart-resume. NODAX separately persists user memory and an operation log in JSON. [2] [9]

**Bera.** Its generic planner describes available actions in a prompt, requests a JSON plan, parses and normalizes steps, and dispatches them through an action switch. It captures per-step results, can ask the model to repair certain failed actions a bounded number of times, and runs selected safe actions in parallel batches. Separately, Agent OS stores project records, plans, checks, repairs, and progress and can reuse a stored plan. This is meaningful project-level continuation, but the generic planner does not show a durable step ledger for recovering arbitrary tasks after process restart. Bera also has two user entry paths: natural-language agent routing uses the planner; the explicit `.agent` command commonly uses `generateAdvancedReply`. Do not assume they share identical tools or execution semantics. [3] [4]

One important engineering distinction: XADON's command dispatcher enforces command metadata. Bera's agent plans are model-produced JSON parsed before execution; the cited code does not demonstrate strict action-specific schema validation at plan acceptance. Treat its per-action authorization and input checks as important boundaries, not as something guaranteed by the prompt. [1] [3] [10]

## Commands: structure, breadth, and caveats

Both bots expose a large prefixed command surface with aliases, utility commands, group administration, media operations, and owner-only functions. They differ in how the command surface is assembled.

**XADON's registered command model** scans `src/commands` recursively. It accepts native or imported command formats, normalizes primary names and aliases, derives categories from registrations, and reports skipped modules, failed imports, and collisions. Its source tree has **743 JavaScript files under `src/commands`**. Those files span AI, anime, anti-abuse, audio, boss/owner, developer centre, downloader, economy, fun, games, general, groups, media, rich/interactive features, search, tools, and media modifiers. This is a file count, not a guarantee that 743 commands load. Effective names depend on valid exports and collision/load outcomes. [1]

**Bera's command model** starts with ten named modules under `Commands/`, then scans `Plugins/` and accepts supported command exports. It makes a flat command map; when two handlers declare the same key, a later `map.set()` silently replaces the earlier handler. Bera also has a separate trigger-oriented plugin loader in `Library/lib/pluginLoader.js`, which is not the same as Handler's prefix-command registry. Help and menu content are partly hardcoded, so the menu should not be treated as a perfect mirror of all effective registrations. [5] [11]

At a family level, Bera includes general/menu, AI/agent, group moderation and safety, media/download/search, BeraHost/Pterodactyl, keys, developer tools, converters, games/fun, privacy/status, notes, GitHub, SSH, monitoring, and panel administration. XADON's source families include AI, anime, anti-abuse, audio, downloader, economy, games/fun, group, media, owner/admin, rich UI, search, and tools. These are **families**, not a claim that every individual command in one bot is missing from the other. Bera's operational hosting/GitHub/Pterodactyl surface is a notable distinction; XADON's broad anime/economy/interactive-command modules are another. [1] [5] [12]

A source-text scan produced a companion CSV of command-like literals from both pinned revisions. It intentionally labels these as declarations, not verified runtime commands: XADON has many `name` and `alias` fields, some of which are not top-level commands, while Bera has duplicate strings and multiple registry paths. Exact live command counts require executing each loader in its supported environment and recording successful registrations. See the [static command declaration inventory](/home/ubuntu/cloud-bera/xadon-bera-command-declarations.csv). [1] [5]

**Command-system improvements for Bera:** detect and report duplicate command keys at startup; standardize command metadata and plugin formats; generate help from the final effective command map; and test aliases, permission policy, registration collisions, and documented commands. XADON's recursive loader is a useful design reference, but Bera should keep its own agent actions, owner protections, and WhatsApp-specific behavior rather than copying command names blindly. [1] [5] [11]

## Tools and external integrations

Bera has the broader orchestration/tool surface in inspected source: shell and workspace operations, code execution, GitHub API mutations, project building, hosting adapters (including BeraHost and other deployment paths), scraping/search, media utilities, and scheduled jobs. GitHub and hosting operations depend on keys/configuration; optional PostgreSQL depends on `DATABASE_URL`. A declaration in the planner catalog does not prove that an integration is ready: the inspected Puter cloud-files path is an authentication-required placeholder, and image generation explicitly reports disabled pending a verified endpoint. [3] [13]

XADON's inspected integrations are more command-centric: provider-backed AI, DuckDuckGo instant-answer lookup, YouTube search/download flows, public GitHub profile/repository lookup and ZIP download, plus utility/search commands. These are useful direct integrations but are not equivalent to Bera's general plan-and-dispatch system or authenticated GitHub write/deploy paths. Neither bot's external service credentials or current API availability were tested. [9] [14]

Bera's scheduled task module stores jobs in process memory. That means the inspected scheduler code does not establish that cron definitions survive a restart, even though Bera's database can persist other application state. [15]

## Persistence and sessions

XADON persists simple application key/value data to `database/data.json`, using a delayed write to a temporary file followed by rename. Its Baileys session is stored in a local multi-file auth directory and can be initialized from an environment-provided session value. Recent ordinary messages and several runtime trackers remain in memory. No source-backed, off-host backup and tested-restore process was identified. [16]

Bera uses lowdb with a local JSON cache and can optionally persist application state to PostgreSQL as one JSONB document. It also has a PostgreSQL-backed WhatsApp auth implementation using AES-GCM encryption, while maintaining a local auth-file compatibility path. Agent memory persists to a JSON file, but the conversation history used by the agent is an in-memory map. The PostgreSQL application state is a single aggregate, not normalized relational entities, and the code inspected does not show a versioned migration framework or backup/restore service. [17] [18]

Bera's optional PostgreSQL and encrypted auth are more sophisticated than XADON's flat JSON persistence. They are not automatically safer or more resilient without operational controls: the design should document single-writer assumptions, protect encryption-key continuity, monitor failed writes, and back up both database state and local session files. Neither project has verified backup-and-restore evidence in this inspection. [17] [18]

## Security and authorization

Both repositories centralize command permission checks and have powerful owner-only code or shell functionality. Neither inspected implementation demonstrates that arbitrary code runs inside an OS/container sandbox. XADON's owner eval path can execute JavaScript and shell operations. Bera has owner-gated eval/shell paths too, while its code runner inherits most of the bot process environment. [6] [19]

Bera's workspace helpers are the strongest concrete concern found: they permit absolute paths and do not enforce that resolved paths remain under a per-user workspace. As a result, the directory naming alone does not provide user isolation. Bera also has a weak substring-based JS-eval blocklist in a separate execution path. Separately, PostgreSQL auth encryption coexists with a local mirrored auth-file path, so encryption of the DB copy does not eliminate local-file exposure. [6] [17]

Bera does have a central command policy and an audit storage helper, but the existence of those mechanisms does not prove every indirect or destructive operation is gated and audited. Recommendations: enforce canonical workspace containment (including symlinks); put shell/code execution in a disposable isolated environment with minimal environment variables, resource caps, and no bot credentials; validate every action schema and permission at execution; and audit high-impact operations. [10] [17] [19]

## WhatsApp interaction and runtime

Both use Baileys, multi-file auth, event-driven message processing, group/private context, command dispatch, and media/voice features. XADON's serializer explicitly normalizes sender/chat, quoted messages, mentions, and media download closures. Its routing also supports several non-prefix smart-AI triggers. Its connection retry path uses a fixed delay in the cited close listener; it halts on logged-out sessions and asks an operator to remove the session. [20]

Bera has more differentiated socket teardown/reconnect handling and explicit opt-in voice replies in private chats, plus saved reply-language settings. It also has a helper that replies in groups while tagging the requester. These are useful operational distinctions, but the helper must actually be used by each relevant reply path; its existence alone does not mean every group response tags the asker. Neither bot was run against a live WhatsApp account, so these are implementation comparisons rather than live behavior claims. [21]

## Deployment, quality, and maintainability

XADON is more deployer-oriented in the checked source: it sets a Node floor, tracks a package lock, documents `npm ci`, includes an `npm run check` fake-socket smoke harness, and provides several hosting guides. Its owner updater uses fast-forward-only Git updates and exits for an external supervisor to restart. The smoke harness is still limited: it checks selected commands produce a reply and does not provide a broad semantic test suite. [22]

Bera has a simpler documented `npm install`/`npm start` flow and optional PostgreSQL, but its manifest has only a start script, no tracked lockfile, and dependencies using `latest`. Its README does not document all runtime environment variables used by config/startup. Its HTTP listener returns the same generic 200 response for every path and does not indicate whether WhatsApp or persistence is ready. Its in-app updater performs a hard reset to `origin/main`, which can discard tracked local changes, then hot-reloads selected code and separately asks for a restart. [23]

Bera's committed tree contains targeted `node:test` coverage for selected helpers and guards, while XADON's committed check is a smoke harness and no dedicated test suite was identified in its tracked tree. Bera should make those tests runnable from package scripts and CI. XADON has stronger lockfile and command-loader diagnostics; Bera's action/plugin modularity and deeper test coverage are assets worth preserving. [1] [22] [23]

## Prioritized improvements for Bera

1. **Isolate shell, code, and file tools.** Contain resolved paths beneath a per-user workspace, reject traversal and symlink escapes, use a disposable sandbox with an allowlisted environment, and test adversarial inputs.
2. **Validate and persist generic agent tasks.** Enforce action-specific schemas and authorization before execution; persist task IDs, plans, step results, status, and idempotency data so interrupted tasks can be inspected and safely resumed.
3. **Make command registration authoritative.** Detect duplicate keys and registration failures, standardize plugin contracts, and generate help from the final command map.
4. **Improve reproducibility and CI.** Track a lockfile, pin floating dependencies, add test/check scripts, and run tests and static checks in CI.
5. **Persist scheduled work and report capabilities honestly.** Store cron definitions/execution state and restore them on boot; hide placeholders from planner catalogs or clearly report them as unavailable.
6. **Improve operational readiness.** Document all environment/session requirements, define liveness vs readiness endpoints, make updater behavior non-destructive by default, and verify backups/restores.

## References

[1]: https://github.com/musteqeem/XADON/blob/75bd8e1286b57740d12bf780d6f5cd06a8591a3a/src/loader.js "XADON command loader"
[2]: https://github.com/musteqeem/XADON/blob/75bd8e1286b57740d12bf780d6f5cd06a8591a3a/nodax.js "XADON NODAX agent"
[3]: https://github.com/bera-tech-ai/cloud-bera/blob/eb720b6f3782e899c4e67e297468ed9151c84122/Library/actions/agent.js "Bera action planner and dispatcher"
[4]: https://github.com/bera-tech-ai/cloud-bera/blob/eb720b6f3782e899c4e67e297468ed9151c84122/Library/actions/agent-os.js "Bera Agent OS project persistence"
[5]: https://github.com/bera-tech-ai/cloud-bera/blob/eb720b6f3782e899c4e67e297468ed9151c84122/Handler/index.js "Bera command loading and dispatch"
[6]: https://github.com/bera-tech-ai/cloud-bera/blob/eb720b6f3782e899c4e67e297468ed9151c84122/Library/lib/workspace.js "Bera workspace path handling"
[7]: https://github.com/bera-tech-ai/cloud-bera/blob/eb720b6f3782e899c4e67e297468ed9151c84122/Library/actions/coderunner.js "Bera code runner"
[8]: https://github.com/bera-tech-ai/cloud-bera/blob/eb720b6f3782e899c4e67e297468ed9151c84122/package.json "Bera package manifest"
[9]: https://github.com/musteqeem/XADON/blob/75bd8e1286b57740d12bf780d6f5cd06a8591a3a/src/lib/ai.js "XADON AI providers and chat"
[10]: https://github.com/bera-tech-ai/cloud-bera/blob/eb720b6f3782e899c4e67e297468ed9151c84122/Library/lib/permissions.js "Bera centralized permission policy"
[11]: https://github.com/bera-tech-ai/cloud-bera/blob/eb720b6f3782e899c4e67e297468ed9151c84122/Library/lib/pluginLoader.js "Bera trigger plugin loader"
[12]: https://github.com/musteqeem/XADON/tree/75bd8e1286b57740d12bf780d6f5cd06a8591a3a/src/commands "XADON command families"
[13]: https://github.com/bera-tech-ai/cloud-bera/blob/eb720b6f3782e899c4e67e297468ed9151c84122/Library/actions/imagegen.js "Bera image generation availability"
[14]: https://github.com/musteqeem/XADON/tree/75bd8e1286b57740d12bf780d6f5cd06a8591a3a/src/commands/search "XADON search commands"
[15]: https://github.com/bera-tech-ai/cloud-bera/blob/eb720b6f3782e899c4e67e297468ed9151c84122/Library/actions/scheduler.js "Bera scheduler"
[16]: https://github.com/musteqeem/XADON/blob/75bd8e1286b57740d12bf780d6f5cd06a8591a3a/src/lib/database.js "XADON JSON persistence"
[17]: https://github.com/bera-tech-ai/cloud-bera/blob/eb720b6f3782e899c4e67e297468ed9151c84122/Database/index.js "Bera application database"
[18]: https://github.com/bera-tech-ai/cloud-bera/blob/eb720b6f3782e899c4e67e297468ed9151c84122/Library/lib/postgres-auth-state.js "Bera encrypted PostgreSQL auth state"
[19]: https://github.com/musteqeem/XADON/blob/75bd8e1286b57740d12bf780d6f5cd06a8591a3a/src/commands/owner/eval.js "XADON owner eval command"
[20]: https://github.com/musteqeem/XADON/blob/75bd8e1286b57740d12bf780d6f5cd06a8591a3a/src/connection.js "XADON Baileys connection lifecycle"
[21]: https://github.com/bera-tech-ai/cloud-bera/blob/eb720b6f3782e899c4e67e297468ed9151c84122/Plugins/voice.js "Bera voice and language controls"
[22]: https://github.com/musteqeem/XADON/blob/75bd8e1286b57740d12bf780d6f5cd06a8591a3a/scripts/check.js "XADON smoke check"
[23]: https://github.com/bera-tech-ai/cloud-bera/blob/eb720b6f3782e899c4e67e297468ed9151c84122/Connection/start.js "Bera startup, reconnect, and HTTP listener"
