# Bera AI — Current Integration Audit

Generated from the current `cloud-bera` repository state.

## Status legend

- **Verified working:** previously live-tested successfully in this environment.
- **Wired:** implemented in the repository, but not freshly live-tested in this audit.
- **Legacy/parallel:** still referenced by older command or plugin modules and has not been removed.
- **Known failure:** tested and currently failing at the provider or credential layer.

## 1. WhatsApp and Baileys integration

Bera uses `@whiskeysockets/baileys` for the WhatsApp connection and supports:

- Persistent multi-file authentication state.
- Configurable session directory through `BERA_SESSION_DIR`.
- Pairing-code login.
- Automatic reconnect handling.
- Duplicate-message filtering.
- Group participant events.
- Message edits and deletions.
- Reaction handling.
- Quoted-message extraction.
- Image, video, audio, document, sticker, and view-once message handling.
- Message replies using the original message as the quote context.
- WhatsApp mentions using participant JIDs.
- Group admin and bot-admin detection.
- Owner, sudo, group-admin, and member roles.

## 2. Active Xcasper client

Central client: `Library/actions/xcasper.js`

Base URL:

```text
https://apiz.xcasper.space
```

### AI chat endpoints

The current fallback order is:

```text
GET /api/ai/publicai-chat?message=...
GET /api/ai/deepseek?query=...&model=v4-flash
GET /api/ai/claude?query=...
GET /api/ai/gemini?query=...
GET /api/ai/keithai?prompt=...
```

The prompt is normalized from system, user, and assistant messages. The response parser supports nested `result`, `response`, `answer`, `reply`, `text`, `content`, and `data.*` response fields.

**Verified working:** the Xcasper chat client returned a successful response through the DeepSeek fallback during the previous smoke test.

### Vision endpoint

```text
POST /api/ai/vision
```

Payload currently sent:

```json
{
  "imageUrl": "https://...",
  "question": "Describe this image"
}
```

**Known failure:** the endpoint accepted the request shape but returned HTTP 500 because the Xcasper Cloudflare Workers AI backend returned HTTP 401 authentication failure.

### Download endpoints

```text
POST /api/downloaders/youtube-audio
POST /api/downloaders/youtube-video
POST /api/downloaders/yt
POST /api/downloaders/tiktokdl2
POST /api/downloaders/igdl
```

### Search endpoints

```text
POST /api/search/tiktok
POST /api/search/youtube
```

The YouTube adapter normalizes the nested `data.videos` response.

### Utility endpoints

```text
POST /api/utilities/qr-code
POST /api/tools/screenshot
```

The QR adapter normalizes `data.qr_code_url` to `url`.
The screenshot adapter normalizes `data.image_url` to `url`.

**Verified working:** YouTube search, QR generation, and website screenshot were live-tested successfully. The screenshot endpoint returned a public PNG URL.

## 3. AI conversation features

Currently integrated through Bera AI, ChatBera, the agent layer, and the existing command handlers:

- Normal Bera conversation.
- `bera` and `agent` trigger routing.
- Direct bot mentions.
- Configurable trigger enable/disable state.
- Custom trigger words through `beraTriggers`.
- DM and group context.
- Quoted-message context.
- Conversation history.
- Persistent memory and notes.
- Recall, save, forget, list, and clear memory operations.
- Same-language response behavior.
- Summarization.
- Explanation and ELI5 responses.
- Rewriting and paraphrasing.
- Formal, casual, professional, and friendly tone changes.
- Essays, emails, cover letters, bios, captions, slogans, tweets, and names.
- Grammar and proofreading.
- Sentiment and tone analysis.
- Code explanation.
- Code generation.
- Code debugging.
- Text translation.
- Text expansion and completion.
- Roast and creative writing modes.

## 4. Autonomous agent features

The agent can plan and execute tool steps. Current tool families include:

- Shell execution.
- File read/write/edit/search/diff.
- Directory creation/deletion.
- Workspace list/read/write/delete.
- Package installation.
- JavaScript, Python, and multi-language code execution.
- Build and test commands.
- Project scanning and project analysis.
- Auto-fix and retry loops.
- Web scraping.
- Link extraction.
- Table extraction.
- Structured-data extraction.
- Email and phone extraction.
- Regex extraction.
- JSON/API fetching.
- HTTP requests.
- Screenshots.
- DNS, SSL, ping, IP, WHOIS, and port checks.
- PM2 process management.
- Docker management.
- SQLite/database operations.
- NPM package information.
- Git clone, status, push, and workspace save.
- GitHub operations.
- BeraHost operations.
- Project lifecycle orchestration.
- QR generation and media tools through adapters.

## 5. Project lifecycle engine

Module: `Library/actions/project-lifecycle.js`

Current flow:

```text
Workspace
→ scaffold if empty
→ inspect project
→ install dependencies
→ build
→ test
→ create GitHub repository
→ commit and push
→ create BeraHost web deployment
→ poll status
→ capture deployed screenshot
→ persist report
```

Supported project templates currently defined in the repository include:

- Node.js.
- Express.
- Python.
- Flask.
- Static HTML.
- React/Vite.
- WhatsApp bot.

Lifecycle records are stored in:

```text
Database/project_lifecycle.json
```

They are also synchronized into the database when `global.db` is initialized.

Production deployment has an approval gate through `approveProduction`.

## 6. GitHub integration

Official API base:

```text
https://api.github.com
```

Current GitHub functions include:

- Read authenticated user.
- Resolve account owner.
- List repositories.
- Search repositories.
- Read repository metadata.
- List branches.
- Create repositories.
- Delete repositories.
- List repository files.
- Read files.
- Create files.
- Update files.
- Upsert files.
- Push multiple files.
- Create branches.
- Create issues.
- List issues.
- Fork repositories.
- Read commits.
- Push local project folders through Git.

GitHub credentials are expected from the database settings or `GITHUB_TOKEN`.

## 7. BeraHost integration

The BeraHost client supports two families of operations.

### Native bot deployments

- List deployments.
- Deploy a bot.
- Read deployment status.
- Start deployment.
- Stop deployment.
- Delete deployment.
- Update environment variables.
- Read logs.
- Export logs.
- Read deployment metrics.
- Poll deployment status.
- Find WhatsApp pairing codes in logs.
- List bots.
- Read bot details.
- Read coin balance and transactions.
- Plans and payments.

### Web deployments

The lifecycle engine now uses:

```text
POST /api/web-deployments
GET /api/web-deployments
GET /api/web-deployments/:id
DELETE /api/web-deployments/:id
```

It sends GitHub repository URL, branch, build command, start command, and environment variables.

BeraHost credentials are expected from the database settings or:

```text
BERAHOST_API_KEY
BERAHOST_API_URL
```

No real deployment was created during this audit.

## 8. WhatsApp group and moderation features

Integrated command families include:

- Kick, add, promote, demote.
- Mute and unmute.
- Group open/close/lock/unlock.
- Invite link retrieval and revoke.
- Group name and description changes.
- Group icon set/get.
- Mention all, mention admins, hidetag.
- Anti-link.
- Anti-spam.
- Anti-badwords.
- Anti-promote and anti-demote.
- Anti-delete and anti-edit.
- Anti-call.
- Anti-view-once.
- Welcome and goodbye messages.
- Warnings and warning lists.
- Group polls.
- Group information.
- Admin and member lists.
- Join-request handling.
- Member export.
- Inactive-member cleanup.
- Group backup and cloning through plugins.
- Topic/feature locking where supported.

## 9. Centralized permission policies

Module: `Library/lib/permissions.js`

Roles:

- Owner.
- Sudo.
- Group admin.
- Member.

The policy layer enforces:

- Owner/sudo-only shell, code execution, GitHub, deployment, Pterodactyl, and high-impact operations.
- Group-admin-only moderation commands.
- Group-only command scope.
- Agent access restrictions for disabled groups.
- Separate sender-admin and bot-admin fields.

Both normal user commands and AI-invoked commands pass through the policy layer.

## 10. Other integrated command families

The repository also contains handlers or plugins for:

- YouTube, TikTok, Instagram, Twitter/X, Facebook, Spotify, and other media commands.
- Music search and download.
- Lyrics.
- Dictionary and definitions.
- Wikipedia.
- Weather.
- News and sports.
- Crypto, stocks, currency conversion, movies, anime, and Bible queries.
- Image generation.
- Image vision.
- OCR.
- TTS and voice notes.
- Audio/video conversion.
- QR codes.
- Screenshots.
- PDFs and cards.
- Encryption, encoding, hashing, and text transformations.
- Fun commands, games, trivia, memes, facts, jokes, and random utilities.
- Notes.
- Reminders and schedules.
- Server monitoring and health alerts.
- SSH profiles and SSH execution.
- Pterodactyl server and panel management.
- Telegram notifications.
- GitHub helper plugins.
- Status and profile operations.
- Privacy and presence operations.

The remaining older modules have now been migrated to Xcasper where an equivalent verified route exists, or return an explicit unavailable response where no verified Xcasper equivalent exists.

## 11. Legacy and parallel external providers removed from execution

The following legacy providers were removed from executable code during the migration:

```text
https://api.gifted.co.ke
https://api.giftedtech.co.ke
https://apiskeith.top
https://text.pollinations.ai
https://image.pollinations.ai
https://api.groq.com/openai/v1/chat/completions
https://api.fabdl.com
https://api.silvatech.co.ke
https://api.xhclinton.me
https://bk9.fun
https://co.wuk.sh
https://cobalt.* providers
https://yt.lemnoslife.com
https://api.giftedtech.web.id
https://api.ocr.space
https://api.streamelements.com
https://api.voicerss.org
https://tts.deno.dev
https://translate.google.com
https://api.vercel.com
https://sky-host-live--isaacbarasa835.replit.app
https://emkc.org/api/v2/piston/execute
https://piston.beratech.io/api/v2/piston/execute
```

They are no longer called by the active modules. Unsupported command families now return an explicit disabled message instead of silently falling back to an unverified provider.

## 12. Known gaps

The following are not currently complete or universally verified:

- Xcasper vision backend has a provider-side HTTP 401/500 failure.
- TTS, transcription, OCR, image generation, Twitter/X, Facebook, Spotify, lyrics, and several search utilities are explicitly disabled because no verified Xcasper equivalent is available.
- GitHub and BeraHost require real credentials for end-to-end validation.
- No real GitHub repository or BeraHost deployment was created during this audit.
- The project lifecycle state has a JSON fallback and is not yet a job queue.
- Full database-backed WhatsApp session backup still depends on the deployment volume configuration.
- Scheduling and trigger automation are present in parts of the repository but are not yet consolidated into one automation service.

## Bottom line

The repository currently has a broad WhatsApp command and agent surface, a centralized Xcasper chat/media client for the verified routes, a project lifecycle engine, GitHub integration, BeraHost integration, persistent database records, trigger routing, and centralized permission checks.

The active executable provider stack is now bounded to verified Xcasper routes plus direct first-party/API integrations already present in the bot. Unsupported legacy-backed features fail explicitly rather than calling hidden fallback providers.

## 13. Agent OS orchestration layer

The bot now includes `Library/actions/agent-os.js`, a persistent project operating layer exposed through the `agent_os` agent action. It creates or resumes isolated per-user project sessions, asks Xcasper for a structured plan, applies bounded file changes, installs dependencies, runs build and test scripts, requests bounded AI repairs after failures, creates local Git checkpoints, manages preview processes, and captures preview screenshots.

Agent OS state is persisted separately from source code and is ignored by Git. `BERA_AGENT_STATE_FILE` can point it at a durable hosting volume, while `BERA_PREVIEW_BASE_URL` can expose a preview URL to the screenshot service. The implementation intentionally keeps production deployment and remote GitHub pushes as explicit follow-up actions subject to the existing permission layer.

## 14. PostgreSQL persistence

The database layer now supports PostgreSQL through `DATABASE_URL` with a local JSON cache and fallback. It creates the `bera_state` table automatically, loads durable application state on startup, and queues state writes to PostgreSQL while retaining the existing synchronous database API used by the bot.

The persisted state includes users, groups, settings, projects, Agent OS records, deployments, audit events, reminders, and session metadata. Baileys authentication keys remain on the private `BERA_SESSION_DIR` volume; only non-secret WhatsApp session metadata is stored in the database.

No database connection string or password is included in the repository. Credentials must be configured as deployment secrets.
