I need you to create and add every capability listed below to make Bera the most powerful WhatsApp bot agent ever built — fully comparable to Replit Agent, Devin, and Claude Computer Use combined. Every feature must be production-ready, with real error handling, real fallbacks, and real output. No placeholders, no stubs, no "TODO" comments. If a tool touches the WhatsApp connection, the file system, a remote server, or an external API, it must actually work.

SECTION 1 — NEW AGENT TOOLS (add to Library/actions/beraai.js)
The agent already has: bash, writefile, readfile, mkdir, delete, ls, gitclone, gitpush, gitrepo, deploy, search, scrape, system, pm2list/logs/restart/stop, cmd, sendfile, pdf, zip, wa_setpp, wa_setbio, reply.

Add ALL of the following new tools, both in the prompt tool list AND in the execution switch block:

1.1 HTTP Request Tool
{"tool":"http","method":"GET|POST|PUT|DELETE|PATCH","url":"https://...","headers":{},"body":{},"auth":"Bearer TOKEN"}

Executes any HTTP request and returns status code + response body (truncated to 3000 chars)
Supports JSON body, form-data, custom headers, Bearer auth
Timeout: 20s. Redact any field named token, key, secret, password in the response
Use case: Test APIs, call webhooks, fetch JSON data, interact with REST services
1.2 SSH Remote Execution Tool
{"tool":"ssh","host":"vps.example.com","port":22,"user":"root","key":"$SSH_PRIVATE_KEY","cmd":"sudo reboot"}

Executes shell commands on a remote server via SSH
Reads private key from environment variable SSH_PRIVATE_KEY (PEM format)
Falls back to password auth if env var SSH_PASSWORD is set
Returns stdout/stderr, truncated to 2000 chars
Use case: Reboot a VPS, deploy code, check server status, restart services remotely
This is how .agent run sudo reboot should work — on the REMOTE server, not Replit
1.3 Install Package Tool
{"tool":"install","manager":"npm|pip|yarn|bun","packages":["express","axios"],"folder":"optional-workspace-subfolder"}

Runs npm install express axios (or pip/yarn/bun equivalent) inside the workspace folder
Streams output, returns success/fail + installed versions
Auto-detects manager from package.json or requirements.txt if present
1.4 Run Code / Test Tool
{"tool":"runcode","file":"myapp/index.js","args":"--port 3000","timeout":15,"lang":"node|python|bash|ruby|go"}

Executes a file from workspace with the given args
Captures stdout/stderr, returns output (up to 3000 chars)
Hard kills after timeout seconds (default 10)
Use case: Run tests, verify code works, execute scripts
1.5 Lint & Format Tool
{"tool":"lint","file":"myapp/index.js","fix":true}

Runs eslint --fix for JS/TS, black for Python, gofmt for Go, rustfmt for Rust
Returns list of errors/warnings before and after
If fix: true, writes the fixed version back to disk
1.6 Database Query Tool
{"tool":"db","action":"query|insert|update|delete|schema","table":"users","where":{"id":1},"data":{},"sql":"SELECT * FROM users LIMIT 10","file":"workspace/myapp/db.sqlite"}

Supports SQLite (file-based) and JSON file databases
For SQLite: uses better-sqlite3, executes raw SQL or structured queries
For JSON: reads/writes the lowdb-style db.json file
Returns results as formatted table or JSON
NEVER touches Database/db.json (the bot's own DB) unless explicitly asked
1.7 Environment Variable Manager
{"tool":"envset","key":"API_KEY","value":"abc123","file":"workspace/myapp/.env"}
{"tool":"envget","key":"API_KEY","file":"workspace/myapp/.env"}
{"tool":"envlist","file":"workspace/myapp/.env"}

Reads/writes .env files inside the workspace (never the root .env)
envset: adds or updates a key
envget: returns the value of a single key (redacted if it contains 'token/key/secret/pass')
envlist: returns all keys (values redacted for secrets)
1.8 Git Diff & History Tools
{"tool":"gitdiff","folder":"myapp"}
{"tool":"gitlog","folder":"myapp","limit":10}
{"tool":"gitbranch","folder":"myapp","action":"list|create|switch|delete","name":"feature-x"}
{"tool":"gitstatus","folder":"myapp"}

gitdiff: shows git diff output for the workspace folder
gitlog: shows last N commits with hash, author, date, message
gitbranch: list/create/switch/delete branches
gitstatus: shows git status — staged, unstaged, untracked files
1.9 Deploy to Multiple Platforms
{"tool":"deploy_vercel","folder":"myapp","token":"$VERCEL_TOKEN","name":"my-project"}
{"tool":"deploy_railway","folder":"myapp","token":"$RAILWAY_TOKEN","name":"my-project"}
{"tool":"deploy_netlify","folder":"myapp","token":"$NETLIFY_TOKEN","name":"my-project","build_cmd":"npm run build","publish_dir":"dist"}

Each tool deploys the workspace folder to the respective platform via their CLI or API
Reads API tokens from environment variables automatically
Returns live URL on success, full error log on failure
All three should be added alongside the existing deploy (Sky Hosting) tool
1.10 Screenshot / Browser Tool
{"tool":"screenshot","url":"https://example.com","width":1280,"height":800,"wait":2000}

Uses Puppeteer (headless Chrome) to screenshot a URL
Saves to workspace/screenshots/screenshot_<timestamp>.png
Sends the image directly to the user via WhatsApp
wait: milliseconds to wait after page load before capturing (for JS-heavy pages)
Use case: Preview websites, check live deployments, capture UI for debugging
1.11 OCR — Read Text from Images
{"tool":"ocr","source":"quoted_image|url","url":"https://..."}

If source is quoted_image, downloads the quoted WhatsApp image
Runs Tesseract OCR (or OpenAI Vision as fallback) to extract text
Returns extracted text as plain string
Use case: Extract text from screenshots, documents, receipts, signs
1.12 QR Code Tools
{"tool":"qrgen","data":"https://example.com","output":"workspace/qr.png"}
{"tool":"qrread","source":"quoted_image|url","url":"https://..."}

qrgen: generates a QR code PNG and sends it to the user
qrread: reads/decodes a QR code from a quoted image or URL
1.13 File Converter Tool
{"tool":"convert","input":"workspace/doc.docx","output":"workspace/doc.pdf","format":"pdf|png|mp3|mp4|gif|webp|jpg"}

Converts between file formats using LibreOffice, FFmpeg, ImageMagick, or Pandoc
Sends the converted file to the user
Supports: docx→pdf, pdf→png, mp4→gif, mp4→mp3, jpg→webp, svg→png, md→html
1.14 Cron / Scheduler Tool
{"tool":"cron","action":"add|list|remove","id":"daily-report","schedule":"0 9 * * *","task":"send a daily weather report for Nairobi to 254787527753","chat":"254787527753@s.whatsapp.net"}

Adds a named recurring task that runs on a cron schedule
Persists in Database/db.json under settings.agentCrons
On trigger: runs the agent with the given task and sends output to chat
remove: deletes a cron by id
list: shows all active cron jobs
1.15 WhatsApp Extended Tools
{"tool":"wa_send","to":"254712345678","text":"Hello from Bera Agent!"}
{"tool":"wa_send_image","to":"254712345678","url":"https://...","caption":"Here's your image"}
{"tool":"wa_send_file","to":"254712345678","path":"workspace/report.pdf","caption":"Your report"}
{"tool":"wa_create_group","name":"My Group","members":["254712345678","254711111111"]}
{"tool":"wa_group_pic","jid":"120363...@g.us","url":"https://..."}
{"tool":"wa_get_profile","number":"254712345678"}
{"tool":"wa_pin","jid":"120363...@g.us","key":"<message key>"}
{"tool":"wa_react","emoji":"❤️"}

wa_send: send a text message to any number or group JID
wa_send_image: send an image by URL to any number
wa_send_file: send a workspace file to any number
wa_create_group: create a new WhatsApp group with members
wa_group_pic: set profile picture of a group
wa_get_profile: get profile name and pic URL of a number
wa_pin: pin a message in a group (bot must be admin)
wa_react: react to the current message with an emoji
1.16 Code Review / AI Analysis Tool
{"tool":"codereview","file":"myapp/index.js","focus":"security|performance|bugs|style|all"}

Reads the file from workspace, sends it to OpenAI for code review
Returns structured feedback: critical bugs, security issues, performance tips, style suggestions
Focuses on the specified area or covers all if focus is all
1.17 API Spec Generator
{"tool":"apidocs","folder":"myapp","output":"workspace/myapp/api.md"}

Scans all .js/.ts/.py files in the folder for route definitions (Express, FastAPI, Flask)
Generates a Markdown API reference with endpoints, methods, params, and example responses
Saves to the output path and sends to user
1.18 Regex Tester
{"tool":"regex","pattern":"^[a-z]+$","flags":"gi","test":"Hello World\nfoo\nbar"}

Tests a regex pattern against the given test strings
Returns: matches found, groups captured, lines that matched/didn't match
1.19 JSON/CSV/YAML Tools
{"tool":"jsonformat","content":"{\"a\":1}","validate":true}
{"tool":"csv2json","file":"workspace/data.csv"}
{"tool":"json2csv","file":"workspace/data.json"}
{"tool":"yaml2json","file":"workspace/config.yaml"}
{"tool":"json2yaml","file":"workspace/data.json"}

Format and validate JSON; convert between CSV, JSON, and YAML
Returns the converted content and saves to workspace
1.20 Memory Tools (Persistent Across Sessions)
{"tool":"remember","key":"user_project","value":"working on a Node.js REST API with Express and MongoDB"}
{"tool":"recall","key":"user_project"}
{"tool":"forget","key":"user_project"}
{"tool":"memory_list"}

Saves key-value pairs to Database/db.json under agentMemory[chatId]
Persists across bot restarts (unlike the current in-process MEMORY object)
memory_list: lists all keys stored for this chat
Agent automatically recalls relevant memories at the start of each session
SECTION 2 — IMPROVED AGENT SYSTEM PROMPT
Replace the current system prompt in beraai.js generateAdvancedReply() with this enhanced version:

You are BERA AI — the most advanced WhatsApp AI agent ever built. You were created by Bera Tech. You are not just a chatbot — you are a FULL AUTONOMOUS AGENT with the ability to:
1. Write, run, test, debug, and deploy complete production-ready applications
2. Manage remote servers via SSH (reboot, deploy, restart services)
3. Make HTTP requests to any API in the world
4. Manage Git repositories (clone, commit, push, branch, diff)
5. Deploy to Sky Hosting, Vercel, Railway, and Netlify
6. Manage PM2 processes and Pterodactyl game servers
7. Generate PDFs, ZIP archives, QR codes, and screenshots
8. Perform OCR on images, convert file formats
9. Search the web and scrape websites
10. Execute scheduled tasks via cron
11. Send WhatsApp messages, create groups, manage group settings
12. Remember things about the user permanently (across sessions)
13. Query and manage databases (SQLite, JSON)
14. Generate and explain code in any language
15. Review code for bugs, security issues, and performance
16. Generate full API documentation from source code
17. Convert between JSON, CSV, YAML, XML
18. Run and test code in Node.js, Python, Bash, Go, Ruby
19. Lint and auto-fix code style issues
20. Manage environment variables for workspace projects
CORE BEHAVIOUR RULES:
- When the user asks you to DO something, DO IT. Never just describe how to do it.
- Break complex tasks into steps. Show your plan before executing.
- After every tool call, read the result carefully before deciding the next step.
- If a tool fails, try an alternative approach. Never give up on the first failure.
- Always confirm to the user when a task is FULLY complete, with proof (URL, file, output).
- Never expose secrets, tokens, API keys, or private keys in your output.
- For destructive actions (delete, reboot, drop database), ask for confirmation first.
- If you don't have enough information, ask ONE specific question before proceeding.
- Always use the most capable tool for the job. Don't describe what bash would do — run it.
- When creating projects: write EVERY file completely. Never write partial files.
- For deployments: always return the live URL to the user.
- When running remote commands via SSH: confirm which server before executing.
- When sending WhatsApp messages on behalf of the user: confirm before sending.
TASK EXECUTION PATTERN (follow this every time):
1. UNDERSTAND: Restate the goal in one sentence
2. PLAN: List the steps you will take (numbered)
3. EXECUTE: Call tools one at a time, reading each result
4. VERIFY: Confirm the output is correct (run the code, check the URL, read the file back)
5. DELIVER: Give the user the final result with proof
NEVER:
- Write placeholder code
- Leave a task half-done
- Say "you can now..." without actually doing it
- Output raw JSON tool calls in your reply text
- Expose credentials or tokens
- Silently fail — always report errors with detail

SECTION 3 — NEW COMMANDS TO ADD
3.1 .ssh — Remote Server Access Command
File: Commands/admin.js

.ssh connect <host> <user>   — connect to a remote server and run a test command
.ssh run <command>           — run a command on the last connected server
.ssh list                    — list saved SSH connections
.ssh save <name> <host> <user> — save a named SSH connection to db.json

Saves connections to db.json under settings.sshConnections
Uses the SSH_PRIVATE_KEY env var for auth
Owner only
3.2 .http — API Request Command
File: Commands/admin.js

.http get https://api.example.com/users
.http post https://api.example.com/users {"name":"John"}
.http put https://api.example.com/users/1 {"name":"Jane"}
.http delete https://api.example.com/users/1

Makes live HTTP requests and returns the response
Useful for testing APIs directly from WhatsApp
Owner only
3.3 .cron — Schedule Agent Tasks
File: Commands/admin.js

.cron add daily-weather 0 9 * * * send the weather for Nairobi
.cron list
.cron remove daily-weather

Wraps the cron agent tool as a direct command
3.4 .remember / .recall — Persistent Agent Memory
File: Commands/bera.js

.remember I am working on a project called BeraHost using Node.js and MongoDB
.recall
.forget <key>

Saves notes to db.json per-user, recalled automatically by the agent
3.5 .review — AI Code Review
File: Commands/bera.js

.review                (quote a code block or text file)
.review security       (focus on security issues)
.review performance    (focus on performance)

Sends quoted code to OpenAI for structured code review
Returns: bugs, security issues, performance tips, refactor suggestions
3.6 .run — Execute Code Snippets
File: Commands/bera.js

.run node  console.log("hello")
.run python  print("hello")
.run bash  echo "hello && date"

Runs the code snippet and returns output
Sandboxed to ./workspace with 10s timeout
Supports: node, python, bash, ruby
3.7 .convert — File Format Converter
File: Commands/media.js

.convert pdf       (quote a docx/image/text file)
.convert mp3       (quote a video file)
.convert gif       (quote a video file)
.convert sticker   (quote a gif/image)

Converts the quoted file to the target format and sends it back
3.8 .apidocs — Generate API Documentation
File: Commands/bera.js

.apidocs myapp        (generates docs for workspace/myapp)
.apidocs              (generates docs for the most recently scaffolded project)

Scans workspace for route definitions and generates a Markdown API reference
3.9 .screenshot — Website Screenshot
File: Commands/media.js

.screenshot https://example.com
.screenshot https://example.com 1920 1080

Takes a Puppeteer screenshot of the URL and sends the image
3.10 .ocr — Extract Text from Image
File: Commands/media.js

.ocr     (quote an image)

Extracts all text from the quoted image using OpenAI Vision (primary) or Tesseract (fallback)
SECTION 4 — MEMORY SYSTEM UPGRADE
4.1 Persistent Memory (upgrade Library/actions/beraai.js)
Currently: conversation history lives in a Map in process memory — lost on restart
Fix: save/load conversation history to Database/db.json under users[chatId].agentHistory
Cap per user: last 30 messages (15 exchanges) to avoid DB bloat
On every generateAdvancedReply call: load from DB first, append, save after
4.2 User Context Injection
At the start of every agent session, automatically inject:

User's saved memories (from db.json agentMemory[chatId])
User's last worked-on project (last writefile or bash path from history)
User's name (from WhatsApp contact or db.json)
Current date and time (with timezone)
Server status (RAM, CPU from system tool result cached for 60s)
4.3 Agent Session Summary
After every completed agent task (when the agent calls reply):

Store a one-line summary of what was done in db.json under users[chatId].agentLog
Cap at last 20 entries per user
Show these summaries with .history command
SECTION 5 — PLUGIN UPGRADES
5.1 New Plugin: ssh.js
File: Plugins/ssh.js Commands: .ssh, .sshrun, .sshsave, .sshlist

Full SSH management from WhatsApp (see Section 3.1)
5.2 New Plugin: coderun.js
File: Plugins/coderun.js Commands: .run, .exec, .eval, .test

Run code in Node.js, Python, Bash directly from WhatsApp chat
10-second sandbox timeout
Memory limit: 128MB
5.3 New Plugin: devtools.js
File: Plugins/devtools.js Commands: .json, .yaml2json, .csv2json, .regex, .base64, .hash, .urlencode, .urldecode, .jwt

Developer utility tools:
.json — format/validate JSON (quote or type inline)
.base64 encode <text> / .base64 decode <encoded>
.hash sha256 <text> — hash text with md5/sha1/sha256/sha512
.urlencode <text> / .urldecode <encoded>
.jwt decode <token> — decode a JWT (never expose the signature secret)
.regex <pattern> | <test string> — test regex
5.4 New Plugin: monitor.js
File: Plugins/monitor.js Commands: .monitor add, .monitor list, .monitor remove

Monitors a URL or server for downtime
Checks every 5 minutes via setInterval
Sends a WhatsApp alert to the owner if a site goes down or comes back up
Persists monitors in db.json under settings.monitors
5.5 New Plugin: deploy.js
File: Plugins/deploy.js Commands: .deploy, .deployvercel, .deployrailway, .deploystatus

Direct deployment commands wrapping the agent deploy tools
.deploy <github-url> — deploy to Sky Hosting
.deployvercel <folder> — deploy workspace folder to Vercel
.deployrailway <folder> — deploy workspace folder to Railway
5.6 Upgrade transcribe.js Plugin
Currently: transcribes voice notes using OpenAI Whisper
Add: auto-transcription mode (.autotranscribe on/off) — every voice note in the chat is automatically transcribed and replied with the text, without needing a command
Add: translation after transcription (.transcribe fr — transcribe and translate to French)
5.7 Upgrade aitools.js Plugin
Add these new AI writing tools:

.debate <topic> — generates pro/con arguments for a topic
.quiz <topic> <number> — generates N multiple-choice quiz questions
.lesson <topic> — generates a structured lesson plan
.readme <project name> — generates a professional README.md for a project
.changelog <v1.0 changes> — generates a formatted changelog entry
.pitch <idea> — generates a startup pitch deck outline
.story <theme> — generates a short story
.poem <topic> — generates a poem
.rap <topic> — generates rap lyrics
SECTION 6 — INFRASTRUCTURE IMPROVEMENTS
6.1 OpenAI as True Primary (fix beraai.js)
Currently: generateAdvancedReply calls Pollinations first, then GiftedTech, then apiskeith
Fix: always call OpenAI (via Replit AI Integrations) first for agent mode
OpenAI client is at Library/actions/openai-client.js
Use model gpt-4o for agent mode (not gpt-5-mini) — better tool calling
Only fall back to Pollinations/GiftedTech if OpenAI returns an error or is empty
6.2 Streaming Responses
For long agent tasks, send progress updates every ~5 seconds:
"⚙️ Step 2/5: Installing dependencies..."
"📝 Step 3/5: Writing server.js..."
Use conn.sendMessage(m.chat, { text: '...' }) for intermediate updates
These are NOT the final reply — the final reply comes only when the task is done
6.3 Anti-Loop Guard (already partially implemented)
If the agent calls the same tool with the same args 3 times in a row → break loop, report stuck
If total loops exceed 25 → force stop and report what was completed so far
6.4 Auto-Recovery on Tool Failure
If bash fails with a non-zero exit code → automatically retry with a different approach
If npm install fails → try npm install --legacy-peer-deps
If gitpush fails due to auth → explain to user that GITHUB_TOKEN needs to be set with .setgittoken
If deploy fails → try alternative deployment method
6.5 Workspace Awareness
At the start of every agent session, run ls workspace/ silently
Include the workspace contents in the system prompt context: "Current workspace: myapp/ (Node.js app, 12 files), notes-app/ (React, 8 files)"
This way the agent knows what projects already exist and can continue work on them
SECTION 7 — SECURITY & SAFETY
7.1 Secrets Protection (already partially done)
Never allow bash to print env vars: block printenv, env, cat .env, echo $TOKEN etc.
Never allow readfile to read: .env, creds.json, session/, auth_info*, db.json (bot's own DB)
Redact any string matching: sk-, ghp_, github_pat_, Bearer, token=, key= in tool output
7.2 Dangerous Command Confirmation
Before executing any of these, ask the user to confirm:

ssh commands containing rm -rf, format, fdisk, mkfs, dd if=
db delete actions
wa_create_group (creating groups on behalf of the user)
Any bash command containing rm -rf / or > /dev/sda
7.3 Rate Limiting
Max 5 agent tasks per user per hour (stored in db.json)
Max 30 tool calls per single agent task
If limit hit: "⚠️ You've used 5 agent tasks this hour. Resets at [time]."
7.4 Workspace Sandboxing
All bash commands must run inside ./workspace/ (already done via cwd)
writefile and readfile must reject paths that escape workspace (e.g. ../../etc/passwd)
delete must reject: anything outside workspace, and specifically node_modules at root level
SECTION 8 — BERAHOST / PTERODACTYL UPGRADE
8.1 Full BeraHost Dashboard Command
.bh                  — shows full dashboard: bots, CPU, RAM, deployments
.bh deploy <url>     — deploy a GitHub repo
.bh bots             — list all bots with status
.bh restart <id>     — restart a bot
.bh stop <id>        — stop a bot
.bh start <id>       — start a bot
.bh logs <id>        — get last 50 lines of logs for a bot
.bh delete <id>      — delete a deployment (confirm first)

8.2 Pterodactyl Auto-Status
Add a .ptwatch <server-id> command that checks server status every 60s
Sends an alert if the server goes offline
Stores watches in db.json under settings.ptWatches
8.3 Add BeraHost Agent Tool
{"tool":"berahost","action":"list|start|stop|restart|logs|delete","id":"deployment-id","lines":50}

Wraps the existing BeraHost client functions as an agent tool
Agent can use this to manage deployments as part of larger tasks
SECTION 9 — WHATSAPP FEATURE UPGRADES
9.1 Buttons & Interactive Messages
Upgrade .menu to use WhatsApp native list messages (not plain text)
Each command category is a list section with description
Fallback to plain text on groups that don't support interactive messages
9.2 Newsletter / Channel Support
.channel create <name>         — create a WhatsApp Channel
.channel post <message>        — post to the bot's channel
.channel info                  — get channel info and follower count
.channel subscribe <link>      — subscribe the bot to a channel

9.3 Status Automation Upgrade (upgrade Plugins/status.js)
.autostatus on — auto-react to all contacts' statuses with ❤️
.autostatus view on — auto-view all statuses (already exists, improve reliability)
.poststatus <text> — post a text status update
.poststatus image <url> <caption> — post an image status with caption
9.4 View-Once Bypass (anti-viewonce) Upgrade
Currently forwards the media to the same chat
Upgrade: save to workspace/viewonce/ and allow .vosaved to list them
Keep last 20 view-once media files (auto-delete older ones)
9.5 Polls Upgrade (upgrade Commands/group.js)
.poll <question> | <option1> | <option2> | <option3> — create a native WhatsApp poll
.pollresults — check results of the last poll (bot reads reactions)
SECTION 10 — EXAMPLE AGENT TASK FLOWS
Show these examples in the .agent help message:

.agent build a REST API for a todo app in Express.js with SQLite, push to GitHub, and deploy it
.agent SSH into my server at 1.2.3.4 as root and check if nginx is running
.agent create a Python web scraper that gets the top 10 news headlines from BBC and send me a PDF
.agent take a screenshot of https://bera.ai and send it to me
.agent review my latest project for security bugs
.agent set a cron to send me the weather for Nairobi every morning at 9am
.agent clone https://github.com/user/repo, install dependencies, run the tests, and tell me if they pass
.agent make a WhatsApp group called "Bera Team" and add 254712345678 and 254700000000
.agent convert the quoted video to MP3 and send it back
.agent read the text from the quoted image using OCR

HOW TO IMPLEMENT (step-by-step order)
Create Library/actions/ssh.js — SSH client using node-ssh or ssh2 package
Create Library/actions/browser.js — Puppeteer screenshot wrapper
Create Library/actions/httptools.js — HTTP request executor
Create Library/actions/converter.js — FFmpeg/LibreOffice file conversion
Create Library/actions/coderunner.js — sandboxed code execution
Create Library/actions/monitor.js — uptime monitor with setInterval
Update Library/actions/beraai.js — add all new tools to the prompt + execution switch
Create all new Plugin files (Plugins/ssh.js, Plugins/coderun.js, Plugins/devtools.js, Plugins/monitor.js, Plugins/deploy.js)
Update Commands/admin.js — add .ssh, .http, .cron commands
Update Commands/bera.js — add .remember, .recall, .review, .run, .apidocs
Update Commands/media.js — add .screenshot, .ocr, .convert
Update Library/actions/beraai.js — persistent memory, workspace awareness, streaming progress
Install required packages: node-ssh, ssh2, puppeteer, tesseract.js, better-sqlite3, node-cron, archiver, sharp, fluent-ffmpeg
Test each tool individually before declaring done
DEFINITION OF DONE
Bera is considered "best agent" when ALL of the following are true:

.agent SSH into my VPS and reboot it — actually reboots the remote server
.agent build a fullstack app, push to GitHub, deploy it — returns a live URL
.agent take a screenshot of https://google.com — sends a real screenshot image
.agent read text from this image — returns the actual OCR text from a quoted image
.agent remind me every day at 9am to drink water — sets a real cron and fires daily
.agent review this code for bugs — returns structured code review from OpenAI
.agent convert this video to mp3 — sends back real MP3 audio
.review, .run node, .screenshot, .ocr, .http get, .ssh — all work as standalone commands
Memory persists across bot restarts
Agent always uses OpenAI (gpt-4o) as primary, with real fallbacks
No placeholders, no stubs, no silent failures
