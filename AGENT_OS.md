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

In WhatsApp, natural-language app and website build requests are routed through Agent OS. Builds and tests run locally first; GitHub and hosting are never invoked automatically. When the request includes GitHub or deployment, the bot creates a revision-bound approval case and sends owner controls. The bot reports build checks and any preview screenshot. In private mode, unauthorized command and chat messages are silently ignored. Agent-driven requests cannot change the bot's WhatsApp display name, status, or profile picture. In groups, Bera AI replies quote the triggering message and add a visible `@mention` plus Baileys mention metadata for the original asker; unrelated bot command replies are not changed.

## Living Projects in WhatsApp

Use `.agent project help` for the current command reference. The primary controls are:

- `.agent project list` and `.agent project status [project-id]` to inspect projects, issue cases, and owner-only memory.
- `.agent project remember <note>` to save a bounded project note (project owner only).
- `.agent project report <issue>` to file an issue. A group member can report against that group's active project; they cannot run a preview, apply a revision, publish, or deploy it. Quote an image for visual analysis, or quote an audio message for transcription when transcription is configured. Only the derived text/evidence is saved; media bytes are transient.
- `.agent project preview <case-id>` to generate a revision copy, run checks, and return the preview URL/screenshot (project owner only).
- `.agent project revise <case-id> <change>` to add an owner revision instruction, then preview again.
- `.agent project approve <case-id>` to apply a validated revision locally. Add `github` or `deploy` only when explicitly approving that external action for the exact case.
- `.agent project undo <case-id>` to cancel a pending approval or revert an approved local revision when the Git head still matches. It will not reset unrelated history or claim to undo remote deployment side effects.

Project records, bounded memory (up to 50 notes), issue cases, revisions, and approval state are stored in the main database state. Obvious token/password patterns are redacted before notes and issue evidence are stored. Do not put credentials or secrets in project memory; saved notes may be passed to the AI planner as context. Button controls are translated back into the same commands, and the sender and current case state are rechecked on every tap. Approvals are bound to the source Git commit captured when the preview was made; if the source changes or is dirty, apply stops.

Revision previews are separate workspace copies and omit Git metadata, dependency folders, and `.env*` files. They are **not OS/container sandboxes**: package install/build/test scripts execute under the bot process account and may have that process's environment. For this reason, preview generation is owner-only; do not let untrusted users control the bot host or project dependencies. A hardened container runner remains a future improvement.

## Safety boundaries

- Project paths must remain inside the user workspace.
- Planner file paths are relative to the project directory.
- File deletion is not part of the planner contract.
- Shell steps are disabled unless `allowShell=true`.
- Allowed shell commands are limited to development commands such as npm, pnpm, yarn, node, Python, pytest, and git.
- Automatic repairs are bounded by `maxRepairs`, which defaults to two.
- Agent OS runtime state is stored in `Database/agent_os.json`; Living Projects support metadata is stored in the main database. Both are ignored by Git.
- `BERA_AGENT_STATE_FILE` can point state to a persistent external volume.
- `BERA_PREVIEW_BASE_URL` can expose a hosted preview URL when localhost is not reachable from the screenshot service.

## Current scope

This is the first Living Projects implementation. Direct model-tool requests for GitHub or lifecycle publication are owner-gated. Screenshot delivery requires a running preview, a configured screenshot adapter, and a working WhatsApp connection. Voice intake requires the configured transcription service or `OPENAI_API_KEY`; when unavailable, the bot tells the reporter transcription failed rather than treating audio as text.
