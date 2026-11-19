# Bera Agent OS

Bera now has a persistent project-oriented orchestration layer instead of relying only on isolated agent tools.

## Lifecycle

`agent_os` manages this workflow:

1. Create or resume a project session.
2. Keep the project inside the user workspace.
3. Inspect the project manifest and available scripts.
4. Ask the AI planner for a structured JSON plan.
5. Apply bounded file and directory changes.
6. Install dependencies.
7. Run build and test scripts.
8. Ask the AI repair planner to fix failed steps, up to the configured repair limit.
9. Create a local Git checkpoint.
10. Start or stop a project preview.
11. Capture a preview screenshot through the verified screenshot adapter.
12. Persist project status, checks, repairs, events, and checkpoint metadata.

## Actions

The agent tool can call:

- `agent_os(action:"create", name, task)`
- `agent_os(action:"plan", projectId, task)`
- `agent_os(action:"run", projectId, task, preview, screenshot, maxRepairs)`
- `agent_os(action:"status", projectId)`
- `agent_os(action:"preview_start", projectId, port)`
- `agent_os(action:"preview_stop", projectId)`
- `agent_os(action:"screenshot", projectId)`
- `agent_os(action:"checkpoint", projectId, message)`
- `agent_os(action:"publish", projectId, deploy, environment, approveProduction, envVars)`

In WhatsApp, natural-language app and website build requests are routed through Agent OS before GitHub or hosting actions. The bot builds and validates the project in the user's workspace first; only then does it create/push a private GitHub repository if requested, and deploy only if the user explicitly asks. It sends brief progress updates and reports the workspace, checks, GitHub/live URLs, and any available screenshot. Screenshot image bytes are returned transiently and are not stored in the project state file. In private mode, unauthorized command and chat messages are silently ignored. Agent-driven requests cannot change the bot's WhatsApp display name, status, or profile picture.

## Safety boundaries

- Project paths must remain inside the user workspace.
- Planner file paths are relative to the project directory.
- File deletion is not part of the planner contract.
- Shell steps are disabled unless `allowShell=true`.
- Allowed shell commands are limited to development commands such as npm, pnpm, yarn, node, Python, pytest, and git.
- Automatic repairs are bounded by `maxRepairs`, which defaults to two.
- Runtime state is stored in `Database/agent_os.json` and is ignored by Git.
- `BERA_AGENT_STATE_FILE` can point state to a persistent external volume.
- `BERA_PREVIEW_BASE_URL` can expose a hosted preview URL when localhost is not reachable from the screenshot service.

## Current scope

This is the first complete orchestration layer. It provides the project loop, while GitHub repository creation and BeraHost deployment are available through the explicit `publish` action. Production deployment still requires the existing approval and permission policies. Screenshot delivery requires a valid deployed URL and a working screenshot provider and WhatsApp connection.
