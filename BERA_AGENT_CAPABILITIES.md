# Bera AI Agent capabilities

Reviewed repository: `bera-tech-ai/cloud-bera`, branch `main`, HEAD `2226e30` (2026-11-19). The project is a WhatsApp bot with AI chat, ordinary bot commands, and an agent/project-building subsystem. The command list is much larger than the README overview. [1] [2]

## The AI agent itself

Users can chat with Bera and ask it to carry out task-oriented requests. The code routes natural-language requests to actions, including project tasks, code work, file operations, web search/scraping, image analysis and generation, translations, media requests, GitHub operations, group moderation, and server management. The AI chat keeps per-user conversational history; the source also includes controls to inspect or clear history and adjust conversational style. Image messages can be analyzed, and image-to-image prompting is supported in the AI flow. [3] [4]

The dedicated `agent_os` flow is the most complete “autonomous agent” feature. It can create or resume a project workspace, inspect a project manifest and scripts, ask an AI planner for a JSON plan, create directories and write files, install dependencies, run detected build and test scripts, attempt bounded repairs, make a local Git checkpoint, start or stop a preview, and capture a preview screenshot. It can also publish through the project lifecycle integration, which can connect GitHub repository creation and BeraHost deployment. Project state records plans, checks, repair attempts, events, checkpoint metadata, and preview/deployment information. [5] [6]

The project planner supports `write_file`, `mkdir`, `install`, `build`, `test`, and `shell` steps. Paths are constrained to the project workspace, deletion is not part of the planner contract, and shell steps are disabled unless explicitly allowed. The permitted development shell commands are restricted to `npm`, `pnpm`, `yarn`, `node`, Python, `pytest`, and `git`. Automatic validation/repair is bounded by a default of two repair attempts. Publishing to production follows configured approval and permission rules. [5] [6]

Other direct agent operations in the code include reading/writing/listing workspace files, creating directories, running code or shell tasks, validating/fixing code, inspecting Git state, making HTTP requests, searching the web, and invoking utilities. Additional integrations include GitHub repo/file/issue/branch operations, image generation and vision, media download/transcription, and management of PM2 or Pterodactyl-hosted processes/servers. What works depends on which action is actually routed and on the necessary server-side credentials and services being configured. [3] [4] [7]

Natural-language app/site build requests now route through Agent OS: build and validate in the user's workspace first, then create/push a private GitHub repository only if requested, and deploy only when explicitly requested. The bot sends WhatsApp progress and returns available screenshots. Agent-driven WhatsApp profile edits (display name, status/bio, profile picture) are blocked. [5] [6]

## WhatsApp bot capabilities around the agent

- **Group administration and safety:** open/close or mute groups; add, remove, promote and demote members; manage invite links and group metadata; tag members/admins; polls; member/admin listings and exports; welcome/goodbye messages; warnings; and controls such as anti-link, anti-spam, anti-badword, anti-delete, anti-edit, anti-call, anti-promotion, and view-once handling. Some actions require the bot to be a group admin or are owner-only. [8] [9]
- **AI and text utilities:** summarize, explain, simplify, rewrite, proofread, change tone, draft emails/essays/captions/cover letters, explain or generate code, debug code, classify sentiment, extract keywords, and generate names, slogans, bios, or roasts. [10]
- **Media and images:** download from YouTube, TikTok, Instagram, Facebook, X/Twitter and Spotify-related endpoints; search/play music; retrieve lyrics; convert audio/video/stickers; generate images; analyze images; remove backgrounds; OCR; create/read QR codes; upscale images; and make screenshots of web pages. Availability depends on APIs and source-site behavior. [4] [11]
- **Search and information:** web/Google search, Wikipedia, weather, translation, news, crypto and stock quotes, currency conversion, domain/IP/DNS checks, GitHub repository lookup, entertainment and app/package search, Bible verses, sports scores/standings/news/predictions, and YouTube transcripts. [11]
- **Developer tools and integrations:** code execution and review; HTTP requests; encoders/decoders, hashes, JWT, regex, YAML/CSV and math/unit conversion; GitHub operations; SSH; shell and server monitoring; PM2 process control; Pterodactyl server and file management; and deployment/hosting commands for configured providers. Important security limitation: the general Bera AI `bash`, `multi_bash`, and `runcode` tools run operating-system commands/code via the bot process with timeouts, but are not sandboxed or owner-only at the tool-executor level. The separate JavaScript eval helper blocks a short list of suspicious substrings, but it runs Node code and that substring filter is not a reliable security boundary. Assume these can access the bot process's filesystem and environment; do not expose this tool path to untrusted users or keep powerful credentials in the same runtime. [7] [12]
- **Convenience and entertainment:** reminders and notes, scheduled messages, status-view/like automation, profile/status utilities, games and trivia, jokes/facts/quotes, random-choice tools, text styling, and menus/panels that expose command groups. [9] [10] [11]
- **Bot operation/access:** owner-generated access keys can be activated, checked, extended, revoked, and listed. Owner/admin commands cover bot configuration, maintenance, backups, broadcasts, user management, status/bio controls, updates, and hosting operations. [2] [12]

## Persistence and prerequisites

The application uses Node.js and can store application state in a local JSON database or PostgreSQL when `DATABASE_URL` is configured. PostgreSQL persists user permissions, group settings, project sessions, deployments, audit events, settings, reminders, and WhatsApp session metadata. WhatsApp authentication keys remain in a private persistent filesystem volume. The bot also needs a working WhatsApp session and applicable AI/API credentials. GitHub, hosting, Pterodactyl, SSH, media, search, and similar integrations require their corresponding configuration; a command being present does not mean its external service is configured or currently reachable. [2] [13]

## Important security warning

The repository tracks a `.env` file. That is unsafe if it contains live API tokens, bot credentials, or other secrets. Treat every real credential in that file as exposed: revoke or rotate it, remove the file from the repository history as appropriate, and move secrets to a hosting provider's secret manager. I have intentionally not copied or disclosed any credential values. [14]

## What I did not establish

This was a source-code review, not a deployment or live functional test. The README's feature list and command handlers show intended/implemented code paths, but do not prove all integrations work against external services today. Several facilities are credential-gated or provider-dependent. The full command catalog is spread across `Commands/` and `Plugins/`; the categories above summarize the distinct user-facing functions rather than listing every alias and command spelling.

## References

[1]: https://github.com/bera-tech-ai/cloud-bera "Bera AI repository"
[2]: https://github.com/bera-tech-ai/cloud-bera/blob/main/README.md "Project README"
[3]: https://github.com/bera-tech-ai/cloud-bera/blob/main/Commands/bera.js "AI chat and action routing"
[4]: https://github.com/bera-tech-ai/cloud-bera/blob/main/Library/lib/bera.js "Bera AI client and assistant prompt"
[5]: https://github.com/bera-tech-ai/cloud-bera/blob/main/AGENT_OS.md "Agent OS design and action list"
[6]: https://github.com/bera-tech-ai/cloud-bera/blob/main/Library/actions/agent-os.js "Agent OS implementation"
[7]: https://github.com/bera-tech-ai/cloud-bera/blob/main/Library/actions/agent.js "Agent actions and utilities"
[8]: https://github.com/bera-tech-ai/cloud-bera/blob/main/Commands/group.js "Group administration commands"
[9]: https://github.com/bera-tech-ai/cloud-bera/blob/main/Plugins/groupplus.js "Additional group tools"
[10]: https://github.com/bera-tech-ai/cloud-bera/blob/main/Plugins/aitools.js "AI text tools"
[11]: https://github.com/bera-tech-ai/cloud-bera/blob/main/Commands/gifted.js "Search, information, media, and utility commands"
[12]: https://github.com/bera-tech-ai/cloud-bera/blob/main/Commands/admin.js "Owner administration and deployment commands"
[13]: https://github.com/bera-tech-ai/cloud-bera/blob/main/DATABASE.md "Persistence and PostgreSQL configuration"
[14]: https://github.com/bera-tech-ai/cloud-bera/blob/main/.env "Tracked environment file path; do not use or publish credential values"
