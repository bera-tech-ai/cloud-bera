I need you to create and add every single capability listed in this document to transform Bera into the most powerful WhatsApp AI agent ever built — surpassing Replit Agent, Devin, Claude Computer Use, and ChatGPT combined. Every feature must be production-ready: real error handling, real fallbacks, real output, real results. No placeholders. No stubs. No "TODO" comments. If a tool touches the WhatsApp connection, the file system, a remote server, or an external API — it must actually work on first run.

This prompt covers 15 sections. Implement them all, in order, from top to bottom.

═══════════════════════════════════════════
SECTION 0 — WHAT ALREADY EXISTS (do not re-implement)
═══════════════════════════════════════════
The bot already has these working agent tools in Library/actions/beraai.js: bash, writefile, readfile, mkdir, delete, ls, gitclone, gitpush, gitrepo, deploy (Sky Hosting), search, scrape, system, pm2list, pm2logs, pm2restart, pm2stop, cmd, sendfile, pdf, zip, wa_setpp, wa_setbio, reply

The bot already has these command files:

Commands/general.js — ping, menu, uptime, pdf, sticker, setpp, setbotname
Commands/bera.js — .bera, .agent, .chatbot, .beratrigger, .tagreply, .transcribe
Commands/media.js — .play, .imagine, .see, .translate, .search, .remind, .poststatus
Commands/group.js — kick, add, promote, demote, mute, tagall, antilink, welcome, poll, etc.
Commands/admin.js — broadcast, backup, ban, mode, autoreply, schedule, bash/$, setbhkey, deploy
Commands/pterodactyl.js — ptlist, ptstatus, ptstart, ptstop, ptrestart, ptcmd, ptfiles, restartbot
Commands/key.js — genkey, activate, revokekey, listkeys
Existing plugins in Plugins/: aitools.js, buttons.js, chatbera.js, converters.js, fun.js, funplus.js, games.js, gcstatus.js, github.js, grouptools.js, groupplus.js, mediabtns.js, newpanels.js, notes.js, status.js, texttools.js, tools.js, transcribe.js, updater.js

DO NOT re-implement any of these. Only ADD what is missing.

═══════════════════════════════════════════
SECTION 1 — 30 NEW AGENT TOOLS
═══════════════════════════════════════════
Add ALL tools below to Library/actions/beraai.js in TWO places:

The tool-list string shown in the system prompt (the JSON examples block)
The execution if/else if switch block where tools are actually run
TOOL 1: HTTP Request
{"tool":"http","method":"GET","url":"https://api.example.com/users","headers":{"Authorization":"Bearer TOKEN"},"body":{},"timeout":20}

Supports GET, POST, PUT, DELETE, PATCH
Body can be JSON object or string
Custom headers supported
Timeout defaults to 20s
Returns: HTTP status code + response body (max 3000 chars)
Redact any response field named token, key, secret, password, apiKey
Use case: Test APIs, call webhooks, fetch live JSON data, trigger external services
TOOL 2: SSH Remote Execution
{"tool":"ssh","host":"1.2.3.4","port":22,"user":"root","cmd":"systemctl restart nginx","name":"my-vps"}

Reads private key from env var SSH_PRIVATE_KEY (PEM format, stored as Replit secret)
Falls back to password from env var SSH_PASSWORD if no key
Can save named connections: {"tool":"ssh_save","name":"my-vps","host":"1.2.3.4","user":"root"}
Returns stdout + stderr (max 2000 chars), exit code
This is the CORRECT way to run commands on a remote VPS — not bash
BLOCK commands: rm -rf /, mkfs, fdisk, dd if=/dev/zero — refuse these
Use case: Reboot VPS, check logs, restart services, deploy code remotely
TOOL 3: Install Package
{"tool":"install","manager":"npm","packages":["express","dotenv","cors"],"folder":"myapp","dev":false}

Runs inside ./workspace/<folder> or root workspace if no folder
Supports: npm, pip, yarn, bun, apt (apt requires confirmation)
Auto-detects manager from package.json or requirements.txt
dev: true installs as devDependency
Returns installed versions list + any errors
On failure, auto-retries with --legacy-peer-deps for npm
TOOL 4: Run / Test Code
{"tool":"runcode","lang":"node","file":"myapp/index.js","args":"--port 3000","timeout":12,"inline":"console.log('hello')"}

Executes a file OR inline code string
Supported langs: node, python, python3, bash, ruby, go, php
Hard kills after timeout seconds (default 10)
Returns stdout + stderr (max 3000 chars)
cwd is ./workspace/<folder containing file>
Use case: Verify code works, run unit tests, execute scripts, check output
TOOL 5: Lint & Format
{"tool":"lint","file":"myapp/server.js","fix":true,"lang":"js"}

JS/TS: uses eslint --fix (install eslint if not present)
Python: uses black or autopep8
Go: uses gofmt
Rust: uses rustfmt
Returns: error count before/after, list of issues fixed
If fix: true, writes the corrected file back to disk
TOOL 6: Database Tool
{"tool":"db","action":"query","sql":"SELECT * FROM users WHERE active=1 LIMIT 10","file":"workspace/myapp/data.sqlite"}
{"tool":"db","action":"insert","table":"users","data":{"name":"John","email":"j@example.com"},"file":"workspace/myapp/data.sqlite"}
{"tool":"db","action":"schema","file":"workspace/myapp/data.sqlite"}
{"tool":"db","action":"create_table","sql":"CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY, name TEXT, email TEXT)","file":"workspace/myapp/data.sqlite"}

Supports SQLite (via better-sqlite3) and JSON databases (lowdb-style)
Auto-creates the SQLite file if it doesn't exist
schema: returns all table names and column definitions
Returns results as a formatted table (markdown) or JSON
NEVER touch Database/db.json (bot's own DB) unless user explicitly asks
TOOL 7: Environment File Manager
{"tool":"envset","key":"DATABASE_URL","value":"sqlite://./data.sqlite","file":"workspace/myapp/.env"}
{"tool":"envget","key":"DATABASE_URL","file":"workspace/myapp/.env"}
{"tool":"envlist","file":"workspace/myapp/.env"}
{"tool":"envcreate","file":"workspace/myapp/.env","pairs":{"PORT":"3000","NODE_ENV":"production"}}

Reads/writes .env files ONLY inside workspace (never the root .env or .env.replit)
Values containing 'token/key/secret/pass/api' are shown as *** in output
envcreate: bulk-create a .env from a JSON object of key-value pairs
TOOL 8: Git Advanced Tools
{"tool":"gitdiff","folder":"myapp"}
{"tool":"gitlog","folder":"myapp","limit":10}
{"tool":"gitbranch","folder":"myapp","action":"list"}
{"tool":"gitbranch","folder":"myapp","action":"create","name":"feature/login"}
{"tool":"gitbranch","folder":"myapp","action":"switch","name":"main"}
{"tool":"gitbranch","folder":"myapp","action":"merge","name":"feature/login"}
{"tool":"gitstatus","folder":"myapp"}
{"tool":"gitstash","folder":"myapp","action":"save|pop|list"}
{"tool":"gitpull","folder":"myapp"}
{"tool":"gitinit","folder":"myapp"}

All run inside ./workspace/<folder> directory
gitdiff: shows uncommitted changes
gitlog: shows last N commits with hash, author, date, message
gitbranch create: creates and switches to new branch
gitbranch merge: merges named branch into current branch
gitstash: stash/unstash changes
gitpull: pulls latest changes from remote
gitinit: initializes a new git repo with main as default branch
TOOL 9: Deploy to Multiple Platforms
{"tool":"deploy_vercel","folder":"myapp","name":"my-project","env":{"DATABASE_URL":"..."}}
{"tool":"deploy_railway","folder":"myapp","name":"my-project","env":{"PORT":"3000"}}
{"tool":"deploy_netlify","folder":"myapp","name":"my-project","build_cmd":"npm run build","publish_dir":"dist"}
{"tool":"deploy_render","folder":"myapp","name":"my-project","start_cmd":"node index.js"}
{"tool":"deploy_fly","folder":"myapp","name":"my-project","region":"lhr","memory":"256mb"}

All read API tokens from env vars: VERCEL_TOKEN, RAILWAY_TOKEN, NETLIFY_TOKEN, RENDER_API_KEY, FLY_API_TOKEN
All env vars passed in env object are set as production environment variables on the platform
Returns live HTTPS URL on success + deployment ID
Returns full error log on failure
deploy_fly: also generates a fly.toml automatically from the project type
TOOL 10: Screenshot / Browser
{"tool":"screenshot","url":"https://example.com","width":1280,"height":800,"wait":3000,"full_page":false}

Uses Puppeteer (headless Chromium) installed via puppeteer-core + @sparticuz/chromium
Saves PNG to workspace/screenshots/shot_<timestamp>.png
Sends the PNG directly to the user as a WhatsApp image message
wait: ms to wait after page load (default 2000) — for JS-heavy SPAs
full_page: true: captures the full scrollable page height
Use case: Preview deployed sites, debug UI, capture live pages, check what a URL looks like
TOOL 11: OCR — Read Text from Image
{"tool":"ocr","source":"quoted","lang":"eng"}
{"tool":"ocr","source":"url","url":"https://example.com/receipt.jpg","lang":"eng"}

Primary: uses OpenAI Vision (gpt-4o) to extract text — most accurate
Fallback: Tesseract.js (pure Node.js, no binary install needed)
lang: Tesseract language code (default eng, also supports swa for Swahili, fra, deu, ara etc.)
Returns all extracted text as a plain string
Use case: Read receipts, signs, screenshots, scanned documents, ID cards
TOOL 12: QR Code Tools
{"tool":"qrgen","data":"https://bera.ai","size":400,"output":"workspace/qr.png"}
{"tool":"qrread","source":"quoted"}
{"tool":"qrread","source":"url","url":"https://example.com/qr.png"}

qrgen: uses qrcode npm package to generate a PNG, saves to workspace, sends to user
qrread: uses jsQR or zxing-wasm to decode QR codes from images
Returns decoded URL/text from QR
TOOL 13: File Format Converter
{"tool":"convert","input":"workspace/report.docx","output":"workspace/report.pdf"}
{"tool":"convert","input":"workspace/video.mp4","output":"workspace/clip.gif","extra":"fps=10,scale=480:-1"}
{"tool":"convert","input":"workspace/image.jpg","output":"workspace/image.webp","quality":85}
{"tool":"convert","input":"workspace/audio.ogg","output":"workspace/audio.mp3"}

Uses FFmpeg for: mp4→gif, mp4→mp3, mp4→webm, ogg→mp3, avi→mp4, mp3→ogg, jpg→webp, png→jpg
Uses LibreOffice (soffice --headless) for: docx→pdf, pptx→pdf, xlsx→pdf, doc→txt
Uses ImageMagick for: pdf→png (first page), svg→png, png→jpg, resize, crop
Uses Pandoc for: md→html, html→md, rst→md, md→docx
After conversion, sends the output file to the user
quality: 1–100 for lossy formats (JPEG, WebP, MP3 bitrate multiplier)
TOOL 14: Cron Scheduler
{"tool":"cron","action":"add","id":"morning-weather","schedule":"0 9 * * *","task":"search the weather in Nairobi and send me a summary","chat":"254787527753@s.whatsapp.net"}
{"tool":"cron","action":"list"}
{"tool":"cron","action":"remove","id":"morning-weather"}
{"tool":"cron","action":"pause","id":"morning-weather"}
{"tool":"cron","action":"resume","id":"morning-weather"}
{"tool":"cron","action":"run_now","id":"morning-weather"}

Uses node-cron for scheduling
Persists all crons to Database/db.json under settings.agentCrons
Crons are restored on bot restart by reading db.json in Connection/start.js
On trigger: calls generateAdvancedReply(task, chat, conn, fakeMessage) and sends reply to chat
run_now: immediately executes the cron's task without waiting for schedule
Max 20 crons per user. List shows: id, schedule (human-readable), status, last run, next run
TOOL 15: WhatsApp Extended Tools
{"tool":"wa_send","to":"254712345678@s.whatsapp.net","text":"Hello from Bera!"}
{"tool":"wa_send_image","to":"254712345678@s.whatsapp.net","url":"https://...","caption":"Here you go"}
{"tool":"wa_send_audio","to":"254712345678@s.whatsapp.net","url":"https://...","ptt":false}
{"tool":"wa_send_video","to":"254712345678@s.whatsapp.net","url":"https://...","caption":"Watch this"}
{"tool":"wa_send_file","to":"254712345678@s.whatsapp.net","path":"workspace/report.pdf","caption":"Report"}
{"tool":"wa_create_group","name":"Bera Team","members":["254712345678","254700000000"]}
{"tool":"wa_group_pic","jid":"120363...@g.us","url":"https://..."}
{"tool":"wa_group_name","jid":"120363...@g.us","name":"New Group Name"}
{"tool":"wa_group_desc","jid":"120363...@g.us","desc":"New description here"}
{"tool":"wa_get_profile","number":"254712345678"}
{"tool":"wa_get_groups"}
{"tool":"wa_pin","messageKey":"...","jid":"...","type":"pin"}
{"tool":"wa_react","emoji":"🔥","messageKey":"...","jid":"..."}
{"tool":"wa_forward","to":"254712345678@s.whatsapp.net","messageKey":"..."}
{"tool":"wa_presence","jid":"254712345678@s.whatsapp.net","type":"composing|recording|available"}

All tools require conn to be available (they use the live WhatsApp connection)
wa_send, wa_send_image, wa_send_video, wa_send_file: confirm before sending to OTHER numbers (not the current chat)
wa_create_group: always confirm before creating (irreversible without leaving)
wa_presence: sets the bot's typing/recording indicator in a chat (for realism)
wa_get_groups: returns list of all groups the bot is in with JIDs and names
wa_get_profile: returns display name, profile picture URL, about text for a number
TOOL 16: Code Review
{"tool":"codereview","file":"myapp/server.js","focus":"all","lang":"javascript"}
{"tool":"codereview","code":"const x = require('fs').readFileSync(userInput)","focus":"security","lang":"javascript"}

Sends the file or inline code to OpenAI (gpt-4o) with a structured review prompt
Returns sections: 🐛 Bugs, 🔒 Security, ⚡ Performance, 🎨 Style, ✅ What's good
focus: all, security, performance, bugs, style
For files: reads from workspace, review is file-aware (includes path/lang context)
For inline code: reviews the snippet directly
TOOL 17: API Documentation Generator
{"tool":"apidocs","folder":"myapp","output":"workspace/myapp/API.md","format":"markdown|openapi"}

Scans all .js, .ts, .py, .go files in the folder for route definitions
Detects: Express (app.get/post/put/delete), FastAPI (@app.get/post), Flask (@app.route), Gin (r.GET/POST), Koa
Generates per-route: HTTP method, path, description (from nearby comment), query params, body schema, response example
format: openapi: generates a valid OpenAPI 3.0 JSON spec instead of Markdown
Saves to output path + sends to user as document
TOOL 18: Regex Tester
{"tool":"regex","pattern":"^[a-zA-Z0-9._%+\\-]+@[a-zA-Z0-9.\\-]+\\.[a-zA-Z]{2,}$","flags":"i","tests":["user@example.com","invalid-email","test@bera.co.ke"]}

Tests each string in tests array against the pattern
Returns: ✅/❌ per test string, groups captured, named groups, global match count
Suggests a plain-English description of what the pattern matches
TOOL 19: Data Format Tools
{"tool":"jsonformat","content":"{\"a\":1,\"b\":[1,2,3]}","validate":true,"minify":false}
{"tool":"csv2json","file":"workspace/data.csv","headers":true}
{"tool":"json2csv","file":"workspace/data.json","delimiter":","}
{"tool":"yaml2json","file":"workspace/config.yaml"}
{"tool":"json2yaml","file":"workspace/data.json"}
{"tool":"xml2json","file":"workspace/data.xml"}
{"tool":"json2xml","file":"workspace/data.json","root":"items"}
{"tool":"toml2json","file":"workspace/config.toml"}

All input/output files are relative to workspace
Returns converted content as text AND saves to <original>.<new-ext> in workspace
jsonformat: pretty-prints, validates, and optionally minifies JSON; lists all validation errors
TOOL 20: Persistent Memory
{"tool":"remember","key":"current_project","value":"Building a REST API called BeraHost in Express.js with MongoDB"}
{"tool":"recall","key":"current_project"}
{"tool":"recall_all"}
{"tool":"forget","key":"current_project"}
{"tool":"forget_all"}

Saves to Database/db.json under agentMemory[chatId][key]
Survives bot restarts (unlike the current in-process MEMORY Map)
recall_all: returns all memory keys and values for this chat
forget_all: wipes all memory for this chat (confirm first)
At the START of every agent session, automatically inject recalled memories into the system prompt
TOOL 21: Web Automation / Form Filler
{"tool":"webform","url":"https://example.com/login","actions":[
  {"type":"fill","selector":"#email","value":"user@example.com"},
  {"type":"fill","selector":"#password","value":"$WEB_PASSWORD"},
  {"type":"click","selector":"button[type=submit]"},
  {"type":"wait","ms":2000},
  {"type":"screenshot"}
]}

Uses Puppeteer to automate web interactions
Action types: fill (type in input), click (click element), wait (pause), select (dropdown), screenshot (capture), eval (run JS on page), scroll, hover
Values starting with $ are read from env vars (never expose them in output)
Returns final screenshot + page title + URL after all actions
Use case: Automate form submissions, scrape sites that require login, fill forms
TOOL 22: Image Generation Enhanced
{"tool":"imagine_hd","prompt":"A futuristic city in Kenya at sunset, cyberpunk style, ultra detailed","size":"1024x1024","style":"vivid","quality":"hd","count":1}

Always uses OpenAI gpt-image-1 as primary (via Replit AI Integrations)
Falls back to: GiftedTech Flux → Pollinations.ai → apiskeith.top
size: 256x256, 512x512, 1024x1024, 1792x1024, 1024x1792
style: vivid (dramatic, hyper-real) or natural (muted, realistic)
quality: standard or hd (costs 2x tokens, much sharper)
count: 1–4 images (sends each as separate WhatsApp image)
Returns image directly to user as WhatsApp image, not a URL
TOOL 23: Audio Tools
{"tool":"tts","text":"Hello, this is Bera AI speaking","lang":"en","voice":"alloy|echo|fable|onyx|nova|shimmer"}
{"tool":"transcribe_audio","source":"quoted","lang":"sw"}
{"tool":"audio_info","file":"workspace/song.mp3"}

tts: uses OpenAI TTS (tts-1 model) to generate speech, sends as WhatsApp audio
Voices: alloy (neutral), echo (male), fable (storyteller), onyx (deep), nova (female), shimmer (soft)
Falls back to gTTS (Google Text-to-Speech) free API if OpenAI fails
transcribe_audio: transcribes quoted voice notes or audio files using OpenAI Whisper
audio_info: returns metadata (duration, bitrate, sample rate, codec) using ffprobe
TOOL 24: Video Tools
{"tool":"video_info","url":"https://youtube.com/watch?v=..."}
{"tool":"video_download","url":"https://youtube.com/watch?v=...","format":"mp4|mp3|360p|720p"}
{"tool":"video_trim","file":"workspace/video.mp4","start":"00:00:10","end":"00:00:30","output":"workspace/clip.mp4"}
{"tool":"video_thumbnail","file":"workspace/video.mp4","time":"00:00:05","output":"workspace/thumb.jpg"}
{"tool":"video_compress","file":"workspace/video.mp4","target_mb":15,"output":"workspace/compressed.mp4"}
{"tool":"video_subtitle","file":"workspace/video.mp4","lang":"en","output":"workspace/subtitled.mp4"}

video_info: gets title, duration, views, channel, description from YouTube/TikTok/Instagram URL
video_download: downloads using yt-dlp (must be installed) at specified quality
video_trim: cuts a section from a video using FFmpeg
video_thumbnail: extracts a frame as JPG at the specified timestamp
video_compress: re-encodes to fit under target_mb file size using FFmpeg CRF
video_subtitle: auto-generates subtitles via Whisper transcription and burns them in
TOOL 25: System Monitor
{"tool":"syswatch","action":"start","interval":60,"alert_cpu":90,"alert_ram":85,"chat":"254787527753@s.whatsapp.net"}
{"tool":"syswatch","action":"stop"}
{"tool":"syswatch","action":"status"}
{"tool":"netcheck","hosts":["8.8.8.8","api.openai.com","apiskeith.top"],"timeout":5}
{"tool":"portcheck","host":"1.2.3.4","ports":[22,80,443,3000]}

syswatch start: monitors Replit server every N seconds; sends WhatsApp alert if CPU > alert_cpu% or RAM > alert_ram%
netcheck: pings each host and reports latency + up/down status
portcheck: checks if specific ports are open on a remote host (TCP connect test)
All alerts go to the chat JID (owner by default)
syswatch status: returns current CPU, RAM, Disk, uptime, load average
TOOL 26: Uptime Monitor
{"tool":"monitor","action":"add","id":"my-site","url":"https://myapp.replit.app","interval":300,"chat":"254787527753@s.whatsapp.net"}
{"tool":"monitor","action":"list"}
{"tool":"monitor","action":"remove","id":"my-site"}
{"tool":"monitor","action":"check","id":"my-site"}
{"tool":"monitor","action":"history","id":"my-site","limit":10}

Monitors any URL for HTTP downtime via setInterval
Sends WhatsApp alert when site goes DOWN and when it comes back UP
interval: check frequency in seconds (minimum 60, default 300)
check: immediately runs a health check and returns current status + response time
history: shows last N up/down events with timestamps and response times
Persists all monitors to db.json under settings.monitors
Restored on bot restart
TOOL 27: Note-Taking & Knowledge Base
{"tool":"note","action":"save","title":"My API Design","content":"Use REST with JWT auth, MongoDB for DB...","tags":["api","design"]}
{"tool":"note","action":"get","title":"My API Design"}
{"tool":"note","action":"list","tag":"api"}
{"tool":"note","action":"search","query":"JWT authentication"}
{"tool":"note","action":"delete","title":"My API Design"}
{"tool":"note","action":"export","format":"pdf|txt|md"}

Saves structured notes to db.json under notes[chatId][]
Full-text search across all note content
export: bundles all notes into a PDF or text file and sends to user
Tags allow filtering notes by category
Use case: Save code snippets, ideas, references, meeting notes
TOOL 28: Calculator & Math
{"tool":"calc","expr":"(2^10 + sqrt(144)) / cos(0) * PI"}
{"tool":"stats","data":[12,45,67,23,89,34,56],"ops":["mean","median","mode","std","min","max","sum"]}
{"tool":"unit_convert","value":100,"from":"km","to":"miles"}
{"tool":"currency","amount":5000,"from":"KES","to":"USD"}
{"tool":"date_calc","date1":"2024-01-01","date2":"2024-12-31","ops":["diff_days","add_days:30","weekday","is_holiday"]}

calc: evaluates math expressions safely using mathjs (supports trig, log, complex, matrices)
stats: computes descriptive statistics on a numeric array
unit_convert: converts between any units (length, weight, temp, area, volume, speed, data size)
currency: real-time exchange rates via free ExchangeRate-API or Open Exchange Rates
date_calc: date arithmetic, difference, day of week, holiday detection
TOOL 29: Email / Notification Sender
{"tool":"send_email","to":"user@example.com","subject":"Report from Bera","body":"Here is your report...","html":false}
{"tool":"send_email","to":"user@example.com","subject":"Report","attachment":"workspace/report.pdf"}
{"tool":"send_webhook","url":"https://hooks.slack.com/services/...","payload":{"text":"Hello from Bera!"}}
{"tool":"send_telegram","chat_id":"123456","text":"Bera Agent notification","token":"$TELEGRAM_BOT_TOKEN"}
{"tool":"send_discord","webhook":"$DISCORD_WEBHOOK","content":"Hello from Bera!","embed":{"title":"Update","description":"Task complete"}}

send_email: uses Nodemailer with SMTP from env vars SMTP_HOST, SMTP_USER, SMTP_PASS, SMTP_PORT
Falls back to free Mailersend API if SMTP not configured
send_webhook: POSTs JSON payload to any webhook URL
send_telegram: sends a Telegram message (requires TELEGRAM_BOT_TOKEN env var)
send_discord: sends to a Discord webhook (text or embed format)
Confirm before sending email or Telegram/Discord messages
TOOL 30: Project Intelligence
{"tool":"project_analyze","folder":"myapp","output":"workspace/myapp/ANALYSIS.md"}
{"tool":"project_deps","folder":"myapp"}
{"tool":"project_test","folder":"myapp","framework":"jest|mocha|pytest|vitest|auto"}
{"tool":"project_build","folder":"myapp","cmd":"npm run build"}
{"tool":"project_health","folder":"myapp"}
{"tool":"project_readme","folder":"myapp","output":"workspace/myapp/README.md"}

project_analyze: deeply analyzes a workspace project — detects stack, architecture, entry points, exports, dependencies, potential bugs, missing error handling, outdated packages; outputs full Markdown report
project_deps: checks package.json or requirements.txt for outdated/vulnerable packages
project_test: runs the test suite and returns results (pass/fail counts, failed test names)
project_build: runs the build command and returns output/errors
project_health: quick health check — lints, builds, runs tests, returns a single score 0–100
project_readme: generates a beautiful, complete README.md from the actual source code
═══════════════════════════════════════════
SECTION 2 — ADVANCED AGENT SYSTEM PROMPT
═══════════════════════════════════════════
Replace the existing agentBoost / system prompt in generateAdvancedReply() with this. This is the most important section — the quality of the agent is 80% determined by the system prompt.

╔══════════════════════════════════════════════════════════════╗
║                    BERA AI — AGENT MODE                      ║
║             Created by Bera Tech | All rights reserved       ║
╚══════════════════════════════════════════════════════════════╝
You are BERA AI — the most advanced, capable WhatsApp AI agent ever built.
You were created by Bera Tech. Your identity is Bera AI. Never deny this.
You are powered by cutting-edge AI models including OpenAI GPT-4o.
You run as a WhatsApp bot built on @whiskeysockets/baileys.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
YOUR FULL CAPABILITIES (you can do ALL of these, right now):
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🧠 INTELLIGENCE
• Answer any question with deep reasoning (coding, science, math, law, medicine)
• Explain complex topics at any level — beginner to PhD
• Perform multi-step logical reasoning and show your work
• Write, debug, review, and refactor code in ANY programming language
• Generate complete production-ready projects from a single description
💻 CODE & DEVELOPMENT
• Scaffold complete fullstack apps: React, Vue, Angular + Node, Python, Go, PHP backends
• Write complete files — never partial, never "add your logic here"
• Run code (node, python, bash, ruby, go, php) and return actual output
• Lint and auto-fix code style issues
• Run tests and report results (Jest, Mocha, Pytest, Vitest)
• Generate OpenAPI specs and Markdown API documentation
• Review code for bugs, security, and performance issues
• Analyze entire projects and generate health reports
• Build Docker images and docker-compose files
🐙 GIT & GITHUB
• Clone, init, branch, merge, stash, pull, push repositories
• Create GitHub repos, push code, manage files, create issues, fork repos
• Show git diff, log, status
• Set up CI/CD YAML files for GitHub Actions
🚀 DEPLOYMENT
• Deploy to Sky Hosting (default), Vercel, Railway, Netlify, Render, Fly.io
• Manage deployments: start, stop, restart, get logs
• Check deployment health and status
• Set environment variables on hosting platforms
🖥️ SERVER MANAGEMENT
• Run commands on REMOTE servers via SSH (not just this Replit container)
• Check CPU, RAM, Disk usage
• Monitor uptime and send alerts
• Restart services, check logs, manage processes
• Check if ports are open, test network connectivity
📁 FILE SYSTEM
• Read, write, create, delete files and directories (in ./workspace/)
• Convert between file formats: docx→pdf, mp4→mp3, jpg→webp, etc.
• Generate PDFs from text, ZIP folders, extract archives
• Search file contents with grep, list directories
🌐 WEB & APIs
• Make HTTP requests (GET, POST, PUT, DELETE, PATCH) to any URL
• Automate web forms and interactions with Puppeteer
• Take screenshots of any website
• Search the web and scrape pages
• Monitor URLs for downtime
🤖 WHATSAPP CONTROL
• Send messages, images, audio, video, files to any number or group
• Create groups, set group picture, name, description
• Pin messages, react to messages, forward messages
• Get profile info for any number
• Manage groups (kick, promote, demote) via bot commands
• Set bot profile picture and bio
• Change group settings (open/close, anti-link, welcome messages)
🎵 MEDIA
• Play any song (SoundCloud/YouTube)
• Generate AI images from descriptions (OpenAI gpt-image-1)
• Take website screenshots
• Convert video/audio formats
• Extract text from images with OCR
• Generate QR codes and read QR codes
• Convert images to stickers
• Transcribe voice notes to text
📊 DATA & MATH
• Query SQLite databases with raw SQL
• Convert between JSON, CSV, YAML, XML, TOML
• Calculate complex math expressions
• Convert units and currencies (real-time rates)
• Perform statistical analysis on datasets
📅 AUTOMATION
• Schedule recurring tasks with cron (e.g. "every day at 9am send weather")
• Monitor websites for downtime
• Monitor server resources
• Send notifications via email, Telegram, Discord, webhooks
• Set reminders (already existing)
🧠 MEMORY
• Remember facts about the user permanently (survives restarts)
• Recall past context automatically at session start
• Store and search personal notes and knowledge base
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
ABSOLUTE RULES — NEVER VIOLATE THESE:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
1. EXECUTE, DON'T DESCRIBE
   When the user asks you to DO something — DO IT using tools.
   WRONG: "You can use the deploy tool to deploy your app."
   RIGHT: {"tool":"deploy","repoUrl":"...","name":"my-app"} → wait → reply with the live URL.
2. ALWAYS VERIFY
   After every tool that creates, installs, or deploys something:
   → Run a verification step (read the file back, curl the URL, run the tests)
   → Only tell the user "done" after verification passes.
3. PLAN BEFORE EXECUTING
   For tasks with 3+ steps, output your plan FIRST:
   "Here's what I'll do:
   1. Create project structure
   2. Write server.js with Express
   3. Write package.json
   4. Install dependencies
   5. Push to GitHub
   6. Deploy to Railway
   Let me start..."
   Then execute each step.
4. SEND PROGRESS UPDATES
   For long tasks (5+ tool calls), send intermediate progress messages:
   "⚙️ [2/6] Installing dependencies..."
   "📝 [3/6] Writing configuration files..."
   These should be sent as actual WhatsApp messages, not just in your reply.
5. NEVER LEAVE A TASK HALF-DONE
   If you hit an error, try an alternative approach. Try at least 3 different approaches
   before telling the user you can't do it. Document what you tried.
6. SECRETS ARE SACRED
   Never output: API keys, tokens, passwords, private keys, session cookies.
   Redact them in tool outputs. Refuse bash commands that would expose them.
7. CONFIRM DESTRUCTIVE ACTIONS
   Before: deleting files, rebooting servers, dropping databases, sending WhatsApp messages
   to OTHER numbers, creating groups — ask the user to confirm.
   Exception: if the user already said "yes" or "go ahead" in the same conversation.
8. COMPLETE FILES ONLY
   When writing code files, write the ENTIRE file. Every import. Every function.
   Every error handler. Every closing bracket. Never truncate with "// ... rest of code".
9. PRODUCTION QUALITY
   All code must: handle errors, have input validation, use environment variables for secrets,
   include a README, work on first run without modification.
10. WORKSPACE AWARENESS
    At the start of every agent session, silently check what's in ./workspace/ and include
    it in your context. If the user says "continue working on my project", you should know
    what projects exist and pick up where you left off.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CHAIN OF THOUGHT — ALWAYS THINK BEFORE ACTING:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Before every tool call, think:
- What exactly does the user want?
- What is the best tool for this?
- What could go wrong and how will I handle it?
- What does success look like and how will I verify it?
After every tool result, think:
- Did it succeed? What is the output telling me?
- Is the output what I expected?
- What is the next step?
- Is the task fully complete or does more work remain?
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
TOOL USAGE PATTERNS (memorize these exact flows):
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PATTERN A — Build & Deploy App:
1. mkdir → writefile (each file) → install → runcode (verify) → gitinit → gitpush → deploy → reply with URL
PATTERN B — Remote Server Task:
1. ssh (test connection: "echo ok") → ssh (actual command) → reply with output
PATTERN C — Data Analysis:
1. readfile or scrape → csv2json or jsonformat → stats or calc → pdf (report) → sendfile → reply
PATTERN D — Code Review:
1. readfile → codereview → reply with structured feedback
PATTERN E — Schedule a Task:
1. cron (add) → reply confirming schedule in human-readable format (e.g. "Every day at 9:00 AM Nairobi time")
PATTERN F — WhatsApp Automation:
1. (confirm with user if needed) → wa_send/wa_create_group/etc. → reply confirming what was done
PATTERN G — Debug & Fix:
1. readfile → runcode (see the error) → codereview → writefile (fix) → runcode (verify fix) → reply
PATTERN H — OCR & Process:
1. ocr → (process text with AI) → reply with extracted/analyzed content
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CURRENT CONTEXT (auto-injected at runtime):
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Date/Time: {CURRENT_DATETIME} (Africa/Nairobi)
User: {USER_NAME} ({USER_NUMBER})
Chat: {CHAT_TYPE} ({CHAT_JID})
Workspace: {WORKSPACE_CONTENTS}
User Memories: {USER_MEMORIES}
Recent Agent Log: {RECENT_AGENT_LOG}
GitHub User: {GH_USERNAME}
BeraHost: {BH_STATUS}

═══════════════════════════════════════════
SECTION 3 — NEW COMMANDS TO ADD
═══════════════════════════════════════════
3.1 .run — Execute Code Snippets
File: Commands/bera.js or new Plugins/coderun.js

.run node console.log(2 + 2)
.run python print("hello from python")
.run bash echo "current dir:" && pwd && ls
.run ruby puts "Hello #{1+1}"
.run go  (quoted .go file)

Runs inline code OR the quoted file
Sandboxed in ./workspace/tmp_run/ with 10s timeout
Supports: node, python, python3, bash, ruby, go, php
Returns stdout + stderr, execution time
3.2 .review — AI Code Review
File: Commands/bera.js

.review                → review quoted code/file (all issues)
.review security       → security focus
.review performance    → performance focus
.review bugs           → bug hunting only

Quotes a code message or file document
Returns structured: 🐛 Bugs | 🔒 Security | ⚡ Performance | ✅ Good parts
3.3 .http — Live API Testing
File: Commands/admin.js (owner only)

.http get https://api.example.com/users
.http post https://api.example.com/users {"name":"John","email":"j@x.com"}
.http put https://api.example.com/users/1 {"name":"Jane"}
.http delete https://api.example.com/users/1
.http head https://example.com

Real HTTP requests, returns status code + response body
Owner only
3.4 .ssh — Remote Server Shell
File: Plugins/ssh.js (new plugin)

.ssh save myvps root@1.2.3.4      → save a named server
.ssh list                          → list saved servers
.ssh myvps uptime                  → run command on saved server
.ssh root@1.2.3.4 systemctl restart nginx   → run on any host
.ssh myvps                         → interactive session info

Uses SSH_PRIVATE_KEY env var for auth
Owner only
3.5 .cron — Task Scheduler
File: Plugins/coderun.js or Commands/admin.js

.cron add morning 0 9 * * * send me the weather for Nairobi
.cron list
.cron remove morning
.cron pause morning
.cron resume morning
.cron run morning     → run immediately

Schedules agent tasks that fire automatically
3.6 .remember / .recall / .forget
File: Commands/bera.js

.remember My server IP is 1.2.3.4 and username is root
.remember current_project=Building BeraHost v2 with Node and MongoDB
.recall                      → show all memories
.recall current_project      → show specific memory
.forget current_project      → delete specific memory
.forget all                  → clear all memories (confirm first)

Persistent across restarts
Auto-injected into agent context
3.7 .screenshot
File: Commands/media.js

.screenshot https://example.com
.screenshot https://example.com 1920 1080
.screenshot https://example.com full    → full page

Takes Puppeteer screenshot, sends as WhatsApp image
3.8 .ocr
File: Commands/media.js

.ocr             (quote an image)
.ocr en          (specify language: en, sw, fr, ar, etc.)

Extracts all text from quoted image
OpenAI Vision primary, Tesseract.js fallback
3.9 .convert
File: Commands/media.js

.convert pdf         (quote a .docx, .pptx, .xlsx, or image)
.convert mp3         (quote a video)
.convert gif         (quote a short video)
.convert webp        (quote a jpg/png)
.convert sticker     (quote a gif or image)

Converts quoted file to target format and sends back
3.10 .monitor
File: Plugins/monitor.js (new)

.monitor add mysite https://myapp.replit.app
.monitor add mysite https://myapp.replit.app 120    → check every 120s
.monitor list
.monitor check mysite       → manual check now
.monitor remove mysite
.monitor history mysite

Sends WhatsApp alert to owner when site goes down/up
3.11 .apidocs
File: Commands/bera.js

.apidocs myapp          → generate docs for workspace/myapp
.apidocs myapp openapi  → generate OpenAPI 3.0 JSON spec

Scans source for routes, generates full Markdown/OpenAPI docs
3.12 .calc
File: Plugins/devtools.js (new)

.calc (2^10 + sqrt(144)) * PI
.calc sin(45deg) + log(1000)

Safe mathematical expression evaluator using mathjs
3.13 .convert-unit / .currency
File: Plugins/devtools.js (new)

.unit 100 km to miles
.unit 37.5 celsius to fahrenheit
.unit 5 kg to lbs
.currency 10000 KES to USD
.currency 100 USD to KES

Real-time currency conversion with live exchange rates
Full unit conversion for length, weight, temperature, area, speed, data
3.14 .history
File: Commands/bera.js

.history          → show last 10 agent task summaries
.history 20       → show last 20

Shows what the agent has done in previous sessions
3.15 .note
File: Plugins/notes.js (already exists — extend it)

.note save API Design REST with JWT, MongoDB, rate limiting
.note list
.note search JWT
.note get API Design
.note export pdf
.note delete API Design

Personal knowledge base, per-user, persistent
═══════════════════════════════════════════
SECTION 4 — MENU UPDATE (CRITICAL — DO NOT SKIP)
═══════════════════════════════════════════
File: Commands/general.js

The .menu / .help / .start command is the user's first impression and main reference. It MUST be updated every time new features are added. This is critical — a menu that doesn't list new features means users will never discover them.

Rules for the menu:

Group commands by category with clear section headers
Use consistent formatting: ┃❍ .command <args> — description
Every new command from Sections 3 and 5 MUST appear in the menu
Include usage hints for non-obvious commands
Show owner-only commands in an ⚙️ OWNER / ADMIN TOOLS section
Update the "WHAT BERA CAN DO" capability bullets to reflect all new features
Keep the menu under ~180 lines total (use short descriptions)
EXACT changes to make in Commands/general.js menu:

Update the "WHAT BERA CAN DO" bullets (around line 76) — add these capabilities:
'┃❍ 🖥️ SSH into remote servers and run commands',
'┃❍ 🌐 Make live HTTP/API requests from WhatsApp',
'┃❍ 📸 Screenshot any website and send the image',
'┃❍ 🔍 Extract text from images with OCR',
'┃❍ ⏰ Schedule recurring agent tasks (cron)',
'┃❍ 📊 Query SQLite databases with SQL',
'┃❍ 🔄 Convert files: video↔audio, doc→pdf, img→sticker',
'┃❍ 🧠 Remember facts permanently (survives restarts)',
'┃❍ 📡 Monitor websites and alert on downtime',
'┃❍ 📬 Send emails, Telegram, and Discord notifications',
'┃❍ 🚀 Deploy to Vercel, Railway, Netlify, Render, Fly.io',
'┃❍ 🤖 Run code: Node.js, Python, Bash, Ruby, Go',
'┃❍ 🎙️ Text-to-speech — bot speaks any text',
'┃❍ 🗄️ Persistent memory — bot remembers you forever',

Add new section: 🔧 DEVELOPER TOOLS (after CODE & DEVELOPER TOOLS section):
'┃ ━━━━━━━━━━━━━━━━━━━━━━━━━',
'┃ 🔧 *DEVELOPER TOOLS*',
'┃ ━━━━━━━━━━━━━━━━━━━━━━━━━',
'┃❍ ' + p + 'run node <code>     — Run Node.js code',
'┃❍ ' + p + 'run python <code>   — Run Python code',
'┃❍ ' + p + 'run bash <cmd>      — Run shell command',
'┃❍ ' + p + 'review              — AI code review (quote code)',
'┃❍ ' + p + 'review security     — Focus on security issues',
'┃❍ ' + p + 'http get <url>      — Make a live API request',
'┃❍ ' + p + 'apidocs <folder>    — Generate API documentation',
'┃❍ ' + p + 'calc <expression>   — Math calculator (supports trig/log)',
'┃❍ ' + p + 'unit 100 km to mi   — Unit conversion',
'┃❍ ' + p + 'currency 100 USD to KES — Live currency exchange',
'┃❍ ' + p + 'base64 encode <txt> — Encode to base64',
'┃❍ ' + p + 'base64 decode <enc> — Decode from base64',
'┃❍ ' + p + 'hash sha256 <text>  — Hash text (md5/sha1/sha256)',
'┃❍ ' + p + 'jsonformat <json>   — Pretty-print & validate JSON',
'┃❍ ' + p + 'regex <pat>|<test>  — Test a regex pattern',
'┃❍ ' + p + 'jwt decode <token>  — Decode a JWT token',
'┃',

Add new section: 🌐 WEB & MEDIA TOOLS (after MEDIA section):
'┃ ━━━━━━━━━━━━━━━━━━━━━━━━━',
'┃ 🌐 *WEB & MEDIA TOOLS*',
'┃ ━━━━━━━━━━━━━━━━━━━━━━━━━',
'┃❍ ' + p + 'screenshot <url>    — Screenshot any website',
'┃❍ ' + p + 'ocr                 — Extract text from image (quote it)',
'┃❍ ' + p + 'convert pdf         — Convert quoted file to PDF',
'┃❍ ' + p + 'convert mp3         — Extract audio from quoted video',
'┃❍ ' + p + 'convert gif         — Convert video to GIF',
'┃❍ ' + p + 'tts <text>          — Text-to-speech (bot speaks)',
'┃❍ ' + p + 'play <song>         — Find & send any song',
'┃❍ ' + p + 'imagine <desc>      — Generate AI image',
'┃❍ ' + p + 'see                 — Analyse/describe a quoted image',
'┃❍ ' + p + 'qr <data>           — Generate a QR code',
'┃❍ ' + p + 'translate <lang> <text> — Translate text',
'┃❍ ' + p + 'search <query>      — Search the web',
'┃',

Add new section: 🧠 MEMORY & NOTES (after AI WRITING TOOLS section):
'┃ ━━━━━━━━━━━━━━━━━━━━━━━━━',
'┃ 🧠 *MEMORY & NOTES*',
'┃ ━━━━━━━━━━━━━━━━━━━━━━━━━',
'┃❍ ' + p + 'remember <fact>     — Save a fact (bot remembers forever)',
'┃❍ ' + p + 'recall              — Show all saved memories',
'┃❍ ' + p + 'forget <key>        — Delete a specific memory',
'┃❍ ' + p + 'history             — Show recent agent task history',
'┃❍ ' + p + 'note save <title> <text> — Save a personal note',
'┃❍ ' + p + 'note list           — List all notes',
'┃❍ ' + p + 'note search <query> — Search notes',
'┃❍ ' + p + 'note export pdf     — Export all notes as PDF',
'┃',

Add new section: ⏰ AUTOMATION & MONITORING (before OWNER TOOLS section):
'┃ ━━━━━━━━━━━━━━━━━━━━━━━━━',
'┃ ⏰ *AUTOMATION & MONITORING*',
'┃ ━━━━━━━━━━━━━━━━━━━━━━━━━',
'┃❍ ' + p + 'cron add <id> <schedule> <task> — Schedule recurring task',
'┃❍ ' + p + 'cron list           — View all scheduled tasks',
'┃❍ ' + p + 'cron remove <id>    — Delete a scheduled task',
'┃❍ ' + p + 'cron run <id>       — Run a cron task immediately',
'┃❍ ' + p + 'monitor add <id> <url> — Monitor a website for downtime',
'┃❍ ' + p + 'monitor list        — List all monitored sites',
'┃❍ ' + p + 'monitor check <id>  — Check a site right now',
'┃❍ ' + p + 'remind <time> <msg> — One-time reminder',
'┃',

Add new section: ⚙️ OWNER / ADMIN TOOLS (separate from group commands):
'┃ ━━━━━━━━━━━━━━━━━━━━━━━━━',
'┃ ⚙️ *OWNER / ADMIN TOOLS*',
'┃ ━━━━━━━━━━━━━━━━━━━━━━━━━',
'┃❍ ' + p + 'ssh save <name> <user@host> — Save SSH server',
'┃❍ ' + p + 'ssh <name> <command> — Run command on saved server',
'┃❍ ' + p + 'http get/post <url>  — Make live HTTP requests',
'┃❍ ' + p + 'broadcast <msg>     — Send to all users',
'┃❍ ' + p + 'mode public/private  — Bot access mode',
'┃❍ ' + p + 'ban / unban <num>   — Block / unblock users',
'┃❍ ' + p + 'backup              — Backup bot database',
'┃❍ ' + p + 'stats               — Bot usage statistics',
'┃❍ ' + p + 'setpp <url>         — Change bot profile picture',
'┃❍ ' + p + 'setbio <text>       — Change bot WhatsApp bio',
'┃❍ ' + p + 'setbotname <name>   — Change bot display name',
'┃❍ ' + p + 'setbhkey <key>      — Set BeraHost API key',
'┃❍ ' + p + 'setgittoken <tok>   — Set GitHub token',
'┃❍ ' + p + 'autoreply on/off    — Toggle auto-reply',
'┃❍ ' + p + 'schedule <msg>      — Schedule a broadcast',
'┃❍ ' + p + 'noprefix on/off     — Toggle prefix requirement',
'┃❍ ' + p + '$ <bash cmd>        — Run bash on Replit server (owner)',
'┃',

Update the .agent section (around line 94) with new example tasks:
'┃❍ ' + p + 'agent <task>        — Full autonomous AI agent',
'┃',
'┃ *Example agent tasks:*',
'┃ • ' + p + 'agent build a todo REST API in Express + SQLite and deploy it',
'┃ • ' + p + 'agent SSH into my VPS at 1.2.3.4 and restart nginx',
'┃ • ' + p + 'agent review my latest project for security bugs',
'┃ • ' + p + 'agent take a screenshot of https://bera.ai',
'┃ • ' + p + 'agent cron: every day at 9am send me the Nairobi weather',
'┃ • ' + p + 'agent clone github.com/user/repo, install deps, run tests',
'┃ • ' + p + 'agent convert the quoted video to mp3 and send it back',
'┃ • ' + p + 'agent read the text from the quoted image',
'┃ • ' + p + 'agent make a group called Bera Team and add 254712345678',
'┃ • ' + p + 'agent deploy my myapp folder to Vercel',
'┃',

Add new section: 🔑 ACCESS KEYS (near the end):
'┃ ━━━━━━━━━━━━━━━━━━━━━━━━━',
'┃ 🔑 *ACCESS KEYS*',
'┃ ━━━━━━━━━━━━━━━━━━━━━━━━━',
'┃❍ ' + p + 'activate <key>      — Activate your access key',
'┃❍ ' + p + 'checkkey            — Check your key status',
'┃❍ ' + p + 'genkey <num> <days> — Generate key (owner only)',
'┃',

Add new section: 🖥️ BERAHOST / SERVERS (if bhKey is set):
'┃ ━━━━━━━━━━━━━━━━━━━━━━━━━',
'┃ 🖥️ *BERAHOST / SERVERS*',
'┃ ━━━━━━━━━━━━━━━━━━━━━━━━━',
'┃❍ ' + p + 'bh / berahost bots  — List deployed bots',
'┃❍ ' + p + 'bh restart <id>     — Restart a bot',
'┃❍ ' + p + 'bh logs <id>        — Get bot logs',
'┃❍ ' + p + 'bh deploy <url>     — Deploy from GitHub',
'┃❍ ' + p + 'ptlist              — List Pterodactyl servers',
'┃❍ ' + p + 'ptstatus <id>       — Server status',
'┃❍ ' + p + 'ptstart/ptstop/ptrestart <id> — Power control',
'┃❍ ' + p + 'ptcmd <id> <cmd>    — Run panel command',
'┃',

Update the AI WRITING TOOLS section with new tools from aitools upgrade:
'┃❍ ' + p + 'debate <topic>      — Pro/con arguments',
'┃❍ ' + p + 'quiz <topic> <n>    — Generate N quiz questions',
'┃❍ ' + p + 'lesson <topic>      — Generate lesson plan',
'┃❍ ' + p + 'readme <project>    — Generate README.md',
'┃❍ ' + p + 'pitch <idea>        — Startup pitch outline',
'┃❍ ' + p + 'story <theme>       — Generate a short story',
'┃❍ ' + p + 'poem <topic>        — Generate a poem',
'┃❍ ' + p + 'rap <topic>         — Generate rap lyrics',
'┃❍ ' + p + 'roast <text>        — AI roast of anything',

═══════════════════════════════════════════
SECTION 5 — NEW PLUGINS TO CREATE
═══════════════════════════════════════════
Plugin: Plugins/ssh.js
Commands: ssh, sshsave, sshlist, sshrun

Full SSH remote execution from WhatsApp
Saves named connections to db.json
Uses SSH_PRIVATE_KEY environment variable
Owner only for all commands
Uses ssh2 npm package
Plugin: Plugins/coderun.js
Commands: run, exec, coderun

Execute code snippets in Node.js, Python, Bash, Ruby, Go
Sandboxed in ./workspace/tmp_run/ with 10s timeout, 128MB memory limit
Supports: inline code in message, or quoted file document
Strips ANSI codes from output for clean WhatsApp display
Returns: output (max 2000 chars), execution time in ms
Plugin: Plugins/devtools.js
Commands: calc, unit, currency, base64, hash, urlencode, urldecode, jsonformat, regex, jwt, ipinfo, whois, ping, dns

calc <expr>: math using mathjs (trig, log, sqrt, complex, matrices, units)
unit <val> <from> to <to>: unit conversion (length, weight, temp, area, volume, speed, data)
currency <amount> <from> to <to>: real-time exchange rates (ExchangeRate-API)
base64 encode/decode <text>: Base64 encode/decode
hash <algo> <text>: md5, sha1, sha256, sha512 hashing
urlencode/urldecode <text>: URL encode/decode
jsonformat <json>: pretty-print and validate JSON (works with quoted message too)
regex <pattern> | <test>: test regex patterns
jwt decode <token>: decode JWT header/payload (never expose secret)
ipinfo <ip>: geolocation, ISP, ASN for an IP address (via ipinfo.io)
whois <domain>: domain WHOIS lookup
ping <host>: ICMP ping with latency
dns <domain> <A|MX|TXT|CNAME>: DNS record lookup
Plugin: Plugins/monitor.js
Commands: monitor

Subcommands: add <id> <url> [interval], list, remove <id>, check <id>, history <id>
Checks every interval seconds (min 60, default 300)
Stores in db.json, restored on restart
Sends to owner's number when site goes DOWN or comes back UP
Alert format: 🔴 ALERT: mysite is DOWN (502 Bad Gateway) — 09:15 AM
Recovery format: 🟢 RECOVERED: mysite is back UP (200 OK, 134ms) — 09:20 AM
Plugin: Plugins/deploy2.js
Commands: deployvercel, deployrailway, deploynetlify, deployrender, deployflyio, deploystatus

Wraps the new deploy_* agent tools as direct commands
deployvercel <folder> — deploys ./workspace/<folder> to Vercel
deployrailway <folder> — deploys to Railway
deploynetlify <folder> — deploys to Netlify
deployrender <folder> — deploys to Render
Returns live URL or error log
Plugin: Plugins/aitools.js (EXTEND, don't replace)
Add to existing aitools.js:

.debate <topic> — balanced pro/con arguments
.quiz <topic> <n> — N multiple-choice questions with answers
.lesson <topic> — structured lesson plan (objectives, outline, activities, assessment)
.readme <project> — professional README.md (usage, API, install, contributing)
.changelog <changes> — formatted CHANGELOG entry with semantic versioning
.pitch <idea> — startup pitch deck outline (problem, solution, market, traction, ask)
.story <theme> — 400-word short story
.poem <topic> — stylized poem
.rap <topic> — rap lyrics with chorus
.roast <text> — witty AI roast (keep it fun, not offensive)
.tldr <text> — 3-bullet point summary (alias for summarize)
.simplify <text> — simplify to 5th grade reading level
Plugin: Plugins/transcribe.js (EXTEND existing)
Add to existing transcribe.js:

.autotranscribe on/off — auto-transcribe every voice note in the chat (no command needed)
.transcribe <lang> — transcribe AND translate (e.g. .transcribe fr = transcribe and translate to French)
.tts <text> — text-to-speech using OpenAI TTS API, sends as WhatsApp voice note
Voices: alloy, echo, fable, onyx, nova, shimmer
Falls back to gTTS (free) if OpenAI fails
Usage: .tts Hello this is Bera speaking or .tts nova Hello there
═══════════════════════════════════════════
SECTION 6 — INFRASTRUCTURE UPGRADES
═══════════════════════════════════════════
6.1 OpenAI Always Primary for Agent Mode
File: Library/actions/beraai.js

Current issue: agent mode calls Pollinations first, then GiftedTech, then apiskeith — OpenAI is not used in generateAdvancedReply.

Fix: At the TOP of the AI call loop in generateAdvancedReply:

First, always try OpenAI via Library/actions/openai-client.js
Use model gpt-4o (not gpt-5-mini) for agent mode — much better at tool calling
Only fall back to Pollinations/GiftedTech if OpenAI returns empty or errors
Log which model was used in each response
// In generateAdvancedReply, before the Pollinations loop:
const openai = require('./openai-client')
if (openai.isAvailable()) {
    const resp = await openai.chat(messages, { model: 'gpt-4o', maxTokens: 4096 })
    if (resp && resp.length > 2) return resp
}
// Fall through to Pollinations/GiftedTech...

6.2 Streaming Progress Updates
File: Library/actions/beraai.js

For tasks with 5+ tool calls, send intermediate WhatsApp messages:

// In the tool execution loop:
if (loopCount % 3 === 0 && loopCount > 0 && conn && m) {
    const stepMsg = `⚙️ *Working...* (step ${loopCount})\n_${lastToolCall}_`
    await conn.sendMessage(m.chat, { text: stepMsg }, { quoted: m }).catch(() => {})
}

6.3 Persistent Conversation History
File: Library/actions/beraai.js

Current issue: conversation history is in a MEMORY object — lost on restart.

Fix:

On generateAdvancedReply start: load db.data.users[chatId].agentHistory || []
On each exchange: append user+assistant messages, trim to last 30 messages
On generateAdvancedReply end: save back to db.json
Add db.write() call after history update
6.4 Auto Workspace Context Injection
File: Library/actions/beraai.js

At the start of every agent session (agentMode=true):

Run ls -la ./workspace/ (silently, no output to user)
For each directory in workspace, check file count
Build context string: "Workspace: todo-api/ (12 files, Node.js), react-app/ (28 files, React)"
Inject into system prompt as {WORKSPACE_CONTENTS}
6.5 Agent Session Logging
After every agent task completion (when reply tool is called):

Generate a one-line summary using AI: "Built Express REST API and deployed to Railway at https://..."
Save to db.data.users[chatId].agentLog (array, cap at 20 entries)
Each entry: { summary, timestamp, tools_used: [...], success: true/false }
.history command reads and displays these summaries
6.6 Anti-Loop Guard (improve existing)
Current: max 20 loops. Improve:

If same tool called with same args 3 times in a row → inject: "You are stuck in a loop calling {tool} repeatedly. Stop, think differently, and try a completely different approach."
If any tool returns an error 3 times → inject: "This tool is failing. Try an alternative method or report the issue to the user."
If loop count > 25 → force stop, summarize what was completed, tell user what failed
6.7 Cron System in Connection/start.js
File: Connection/start.js

On bot startup, after DB is initialized:

// Restore all agent cron jobs from db.json
const nodeCron = require('node-cron')
const crons = global.db.data.settings?.agentCrons || {}
for (const [id, cronConfig] of Object.entries(crons)) {
    if (cronConfig.paused) continue
    nodeCron.schedule(cronConfig.schedule, async () => {
        const { generateAdvancedReply } = require('./Library/actions/beraai')
        const result = await generateAdvancedReply(cronConfig.task, `cron_${cronConfig.chat}`, conn, fakeMsgForChat(cronConfig.chat))
        await conn.sendMessage(cronConfig.chat, { text: result.reply || '✅ Cron task complete.' })
    }, { timezone: 'Africa/Nairobi' })
    console.log(`[CRON] Restored: ${id} (${cronConfig.schedule})`)
}

6.8 Monitor System in Connection/start.js
File: Connection/start.js

On bot startup, restore all uptime monitors:

const monitors = global.db.data.settings?.monitors || {}
for (const [id, mon] of Object.entries(monitors)) {
    startMonitor(id, mon, conn)
}

Where startMonitor does setInterval(() => checkUrl(id, mon, conn), mon.interval * 1000)

═══════════════════════════════════════════
SECTION 7 — SECURITY & SAFETY
═══════════════════════════════════════════
7.1 Comprehensive Secret Redaction
File: Library/actions/beraai.js (already partially done — improve)

Block list (bash tool):

printenv, env, set, export -p
cat .env, cat *.env, cat creds.json, cat auth_info*
echo $GITHUB, echo $OPENAI, echo $SK_, echo $API
cat /proc/*/environ, cat /etc/passwd, cat /etc/shadow
Output redaction regex (apply to ALL tool outputs):

/\bsk-[A-Za-z0-9]{20,}\b/g → 🔒[openai-key]
/\bghp_[A-Za-z0-9]{36}\b/g → 🔒[github-token]
/\bgithub_pat_[A-Za-z0-9_]{82}\b/g → 🔒[github-token]
/\bBH_[A-Za-z0-9]{20,}\b/g → 🔒[bh-key]
/(token|key|secret|password|passwd|apikey)\s*[:=]\s*[^\s"',\n]{6,}/gi → 🔒[redacted]
Any string that looks like a JWT: /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g → 🔒[jwt]
7.2 Path Traversal Protection
Block any path containing: .., /etc/, /root/, /home/, /proc/, /sys/, /dev/ Only allow paths inside ./workspace/ for file tools.

7.3 Dangerous Command Confirmation
Before executing via SSH or bash, block and ask for confirmation if command contains:

rm -rf /, rm -rf /*, mkfs, fdisk, dd if=/dev/, :(){ :|:& };:
DROP TABLE, DROP DATABASE, TRUNCATE (for db tool)
Any command targeting /boot, /etc/init.d, /etc/cron
7.4 Agent Rate Limiting
Per user, per hour:

Max 10 agent tasks (tracked in db.json)
Max 40 tool calls per single task
If exceeded: "⚠️ You've hit the agent limit (10 tasks/hour). Resets at [time]."
Owner number is exempt from rate limiting
7.5 SSH Key Security
SSH_PRIVATE_KEY must be set as a Replit secret, never hardcoded
Never log or display the private key in any output
Validate key format before use: must start with -----BEGIN
If key is invalid: "❌ SSH_PRIVATE_KEY is malformed. Please reset it in Replit Secrets."
═══════════════════════════════════════════
SECTION 8 — BERAHOST / PTERODACTYL UPGRADES
═══════════════════════════════════════════
8.1 Unified .bh Dashboard Command
File: Commands/pterodactyl.js or new Plugins/berahost.js

.bh                    → show dashboard: bot list with status, CPU, RAM
.bh bots               → detailed bot list
.bh start <id>         → start a bot
.bh stop <id>          → stop a bot
.bh restart <id>       → restart a bot
.bh logs <id>          → last 50 lines of logs
.bh deploy <gh-url>    → deploy from GitHub
.bh delete <id>        → delete deployment (confirm!)
.bh info <id>          → full deployment info (URL, env vars keys, status)
.bh env <id> <K>=<V>   → set environment variable on deployment
.bh domains <id>       → list custom domains for a deployment

All require .setbhkey to be configured first
Uses existing Library/actions/berahost.js functions
8.2 Add BeraHost Agent Tool
{"tool":"berahost","action":"list|start|stop|restart|logs|delete|deploy","id":"deployment-id","lines":50,"repoUrl":"https://github.com/..."}

Add to beraai.js tool list and execution block
Wraps all Library/actions/berahost.js functions
Agent can use this autonomously (e.g. "deploy my app and show me the URL")
8.3 Pterodactyl Watch
File: Commands/pterodactyl.js

.ptwatch <id>      → start monitoring server (checks every 60s)
.ptunwatch <id>    → stop monitoring
.ptwatchlist       → list all watched servers

Sends WhatsApp alert to owner if server goes offline
Uses setInterval + stores in db.json under settings.ptWatches
═══════════════════════════════════════════
SECTION 9 — WHATSAPP FEATURE UPGRADES
═══════════════════════════════════════════
9.1 Native Interactive Menus
File: Commands/general.js

When in a DM (not a group), send .menu as a WhatsApp List Message (native interactive)
Each category = one list section with rows for each command
Fallback to plain text in groups (WhatsApp groups have limited interactive message support)
Use conn.sendMessage(m.chat, { listMessage: { ... } }) pattern from Baileys docs
9.2 WhatsApp Channel / Newsletter Support
File: Plugins/channel.js (new)

.channel create <name>       → create a WhatsApp Channel (Newsletter)
.channel post <text>         → post text to the channel
.channel post (quote image)  → post image to channel
.channel info                → channel info, follower count, link
.channel list                → list channels bot admin of

9.3 View-Once Archive Upgrade
File: Handler/index.js and Commands/general.js Current: anti-viewonce forwards to the same chat. Upgrade:

Save all view-once media to workspace/viewonce/<timestamp>_<sender>.<ext>
Keep last 50 files (auto-delete older ones)
.vosaved — list all saved view-once media (shows filenames, senders, timestamps)
.vosaved <number> — resend the Nth saved view-once
.voclear — delete all saved view-once files
9.4 Anti-NSFW Upgrade
File: Handler/index.js

When antinsfw is enabled in a group:
Download all images sent in the group
Run OpenAI Vision: "Is this image NSFW or sexually explicit? Reply only: YES or NO"
If YES: delete the message + warn the sender (same system as antilink)
If 3 NSFW warnings: kick the sender
Cache: don't re-analyze images already checked (hash-based)
9.5 Reaction-to-Command System
File: Handler/index.js

When the bot's message is reacted to with specific emojis, trigger an action:
❤️ on AI reply → save it to notes automatically
🔄 on AI reply → regenerate with a different approach
📌 on any message → pin the message in the group
🗑️ on bot's own message → delete it
🔊 on text message → convert it to TTS voice note
This makes Bera feel alive and responsive beyond text commands
9.6 Multi-Language Support
File: Config/index.js + all command files

Add language setting per user in db.json (default: en)
.setlang sw → set your preferred language to Swahili
Bot responses in agent/bera mode adapt to user's language
System messages (✅ Done, ❌ Failed, ⏳ Processing) translated
Supported: en (English), sw (Swahili), fr (French), ar (Arabic), es (Spanish), pt (Portuguese)
═══════════════════════════════════════════
SECTION 10 — AI WRITING TOOLS EXPANSION
═══════════════════════════════════════════
File: Plugins/aitools.js — add all commands below to the existing plugin:

Command	Description
.debate <topic>	Pro/Con arguments for any topic (balanced, 5 points each side)
.quiz <topic> <n>	N multiple-choice questions with answer key
.lesson <topic>	Structured lesson plan (objectives, content, activities, homework)
.readme <project>	Professional README.md (badges, install, usage, API, contributing)
.changelog <changes>	Formatted CHANGELOG.md entry with semantic versioning
.pitch <idea>	Startup pitch outline (problem, solution, market, traction, financials, ask)
.story <theme>	400-600 word short story
.poem <topic>	Poem (user can specify style: haiku, sonnet, free verse)
.rap <topic>	Rap lyrics with verse + chorus
.roast <text>	Witty roast (keep fun, not truly offensive)
.tldr <text>	3-bullet TLDR summary (alias: .summarize)
.simplify <text>	Rewrite at 5th grade reading level
.ama <topic>	Ask Me Anything — generates 5 interesting Q&A pairs on a topic
.brainstorm <topic>	10 creative ideas for any topic
.acronym create <word>	Create a meaningful acronym for a word
.linkedin <info>	Write a LinkedIn post from bullet points
.tiktok <topic>	Write a TikTok script with hooks and CTA
.cold_email <prospect>	Write a cold email for a product/service
.sop <process>	Write a Standard Operating Procedure document
.prd <feature>	Write a Product Requirements Document
.testcases <feature>	Write QA test cases for a feature
.gitcommit <changes>	Write a proper git commit message from change description
.motivation	Generate a custom motivational message based on user context
═══════════════════════════════════════════
SECTION 11 — FUN & ENTERTAINMENT EXPANSION
═══════════════════════════════════════════
File: Plugins/fun.js / Plugins/funplus.js — extend with:

Command	Description
.riddle	Random riddle — reveals answer after 30s
.trivia	Random trivia question with multiple choice options
.trivia hard	Hard trivia (science, history, geography)
.ship @user1 @user2	Compatibility percentage between two tagged users
.rate <thing>	AI rates anything out of 10 with explanation
.roast @user	Friendly roast of a tagged user
.fortune	Random fortune cookie message
.lovemeter <name1> <name2>	Love compatibility meter
.compliment	Random AI-generated sincere compliment
.insult	Fictional, clearly absurd non-harmful insult
.clap <text>	add 👏 claps 👏 between 👏 words
.mock <text>	mOcKiNg SpOnGeBoB tExT
.reverse <text>	txet esrever
.wouldyou	Would you rather question with emoji poll
.imagine @user as <thing>	AI imagines what @user would be as
═══════════════════════════════════════════
SECTION 12 — PACKAGES TO INSTALL
═══════════════════════════════════════════
Run these in the project root before implementing:

# SSH support
npm install ssh2 node-ssh
# Puppeteer (headless Chrome for screenshots + web automation)
npm install puppeteer-core @sparticuz/chromium
# Math & calculations
npm install mathjs
# QR codes
npm install qrcode jsqr
# OCR fallback
npm install tesseract.js
# SQLite database
npm install better-sqlite3
# Cron scheduling
npm install node-cron
# File conversion
npm install sharp fluent-ffmpeg
# Email sending
npm install nodemailer
# OpenAPI/YAML
npm install js-yaml
# CSV parsing
npm install csv-parse csv-stringify papaparse
# Archive (already installed: archiver) — verify
npm install archiver
# PDF generation (already installed: pdfkit) — verify
npm install pdfkit
# Unit conversion
npm install convert-units
# HTTP testing (already have axios) — no new install needed
# Text-to-Speech fallback
npm install gtts
# JWT decode
npm install jsonwebtoken
# Templating (for README/changelog generation)
npm install handlebars

After installing: pnpm install --no-frozen-lockfile

═══════════════════════════════════════════
SECTION 13 — ADVANCED AGENT EXAMPLES
═══════════════════════════════════════════
These are gold-standard test cases. After implementing, the agent MUST handle ALL of these correctly:

.agent build a complete REST API for a todo app in Express.js with:
  - SQLite database (better-sqlite3)
  - JWT authentication
  - CRUD endpoints for todos
  - Input validation with joi
  - API documentation auto-generated
  Push to GitHub and deploy to Railway. Send me the live URL.
.agent SSH into my server at 1.2.3.4 as root, check if nginx is running,
  if not start it, then check the last 20 lines of /var/log/nginx/error.log
.agent Take a screenshot of https://google.com, then describe what you see in the screenshot using vision
.agent Read the text from the quoted image using OCR, then translate it to English if it's not already in English
.agent Create a cron job called "daily-weather" that runs every day at 8:00 AM Nairobi time
  and sends me the weather forecast for Nairobi
.agent Monitor https://myapp.replit.app every 5 minutes and WhatsApp me if it goes down
.agent Clone https://github.com/expressjs/express, count the number of JavaScript files,
  find all files that contain "middleware", and send me a summary report as PDF
.agent Write a Python web scraper that gets the top 5 trending topics from Twitter,
  save results to a CSV file, convert to JSON, and send me both files
.agent Review the quoted code for security vulnerabilities. Focus on: SQL injection,
  XSS, CSRF, insecure dependencies, hardcoded secrets, and input validation
.agent Set a reminder for every Monday at 9am to "Review weekly goals" and send me a confirmation
.agent Build a React + Node.js fullstack app: frontend with login form + dashboard,
  backend with Express + JWT + SQLite users table. Deploy frontend to Vercel
  and backend to Railway. Send me both URLs.
.agent I have a video I'll send — trim it from 0:10 to 0:30, compress it to under 15MB,
  burn subtitles into it, and send it back
.agent Make a WhatsApp group called "Project Alpha", add these numbers:
  254712345678 and 254700000000, set the group description to "Bera AI Project Team",
  and post a welcome message
.agent Analyze my entire workspace and give me a health report:
  what projects exist, their tech stacks, any obvious bugs, outdated packages,
  and which one is most likely to be production-ready
.agent Convert the quoted Word document (.docx) to PDF and send it back

═══════════════════════════════════════════
SECTION 14 — IMPLEMENTATION ORDER
═══════════════════════════════════════════
Implement in this exact order to avoid breaking existing features:

Phase 1 — Foundation (no breaking changes):
  1. Install all packages (Section 12)
  2. Create Library/actions/ssh.js
  3. Create Library/actions/browser.js (Puppeteer wrapper)
  4. Create Library/actions/httptools.js
  5. Create Library/actions/coderunner.js
  6. Create Library/actions/converter.js (FFmpeg/LibreOffice wrapper)
  7. Create Library/actions/scheduler.js (cron + monitor)
  8. Create Library/actions/devmath.js (mathjs, unit conversion, currency)
  9. Create Library/actions/notifier.js (email, telegram, discord, webhook)
Phase 2 — Agent Tools (edit beraai.js):
  10. Add all 30 new tools to the prompt tool-list string
  11. Add all 30 new execution handlers to the switch block
  12. Replace system prompt with Section 2's enhanced version
  13. Add OpenAI as primary AI caller (Section 6.1)
  14. Add streaming progress updates (Section 6.2)
  15. Add persistent conversation history (Section 6.3)
  16. Add workspace context injection (Section 6.4)
  17. Add session logging (Section 6.5)
  18. Improve anti-loop guard (Section 6.6)
Phase 3 — New Plugins (create files):
  19. Plugins/ssh.js
  20. Plugins/coderun.js
  21. Plugins/devtools.js
  22. Plugins/monitor.js
  23. Plugins/deploy2.js
  24. Extend Plugins/aitools.js (Section 10)
  25. Extend Plugins/transcribe.js (TTS + autotranscribe)
  26. Extend Plugins/fun.js + funplus.js (Section 11)
Phase 4 — New Commands (edit existing files):
  27. Commands/bera.js — add .run, .review, .remember, .recall, .forget, .history, .apidocs
  28. Commands/media.js — add .screenshot, .ocr, .convert, .tts
  29. Commands/admin.js — add .http, .cron, .ssh wrapper
  30. Commands/general.js — add .calc, .unit, .currency via devtools plugin
  31. Commands/pterodactyl.js — add .bh dashboard, .ptwatch
Phase 5 — Menu Update (CRITICAL):
  32. Commands/general.js — fully update .menu with all new sections (Section 4)
  33. Verify every new command appears in the menu
  34. Verify menu is under 180 lines total
  35. Test .menu output looks correct
Phase 6 — System Upgrades:
  36. Connection/start.js — restore crons on startup (Section 6.7)
  37. Connection/start.js — restore monitors on startup (Section 6.8)
  38. Handler/index.js — anti-NSFW upgrade (Section 9.4)
  39. Handler/index.js — reaction-to-command system (Section 9.5)
  40. Security audit: apply all redaction patterns (Section 7.1)
Phase 7 — Testing:
  41. Test each agent tool by running the gold-standard examples (Section 13)
  42. Test .menu displays all new commands
  43. Test crons survive bot restart
  44. Test monitors send alerts on downtime
  45. Test SSH connects and runs commands
  46. Test screenshot sends a real image
  47. Test OCR extracts real text from an image
  48. Confirm OpenAI is called first in agent mode

═══════════════════════════════════════════
SECTION 15 — DEFINITION OF "DONE"
═══════════════════════════════════════════
Bera is considered complete when ALL of the following pass:

Agent Tests:
 .agent SSH into 1.2.3.4 as root and run uptime → returns actual server uptime
 .agent build a todo API in Express + SQLite and deploy to Railway → returns live HTTPS URL
 .agent take a screenshot of https://google.com → sends a real PNG image to WhatsApp
 .agent read the text from this image (OCR) → returns actual text from a quoted image
 .agent cron: every day at 9am send me Nairobi weather → confirms schedule + fires at 9am
 .agent monitor https://myapp.replit.app and alert me if it goes down → monitor is active
 .agent review this code for security → returns structured code review from OpenAI gpt-4o
 .agent convert this video to mp3 → sends back real MP3 audio
 .agent remember my server IP is 1.2.3.4 → recalled in next session after restart
 .agent make a group called Test Group → group is actually created in WhatsApp
Command Tests:
 .run node console.log(2+2) → returns 4
 .run python print("hello") → returns hello
 .review (quote code) → returns bug/security/performance analysis
 .screenshot https://google.com → sends screenshot image
 .ocr (quote image with text) → returns the text
 .http get https://api.github.com → returns JSON response
 .ssh myvps uptime → returns server uptime
 .cron list → shows active crons
 .monitor list → shows active monitors
 .calc (2^10 + sqrt(144)) * PI → returns correct result
 .unit 100 km to miles → returns 62.137 miles
 .currency 1000 KES to USD → returns live exchange rate
 .tts Hello this is Bera → sends actual voice note
 .convert mp3 (quote video) → sends actual MP3
 .remember key=value → recalled next session
 .history → shows last agent tasks
Menu Test:
 .menu shows all new sections (Developer Tools, Web & Media, Memory & Notes, Automation & Monitoring, Owner Tools, BeraHost)
 Every command in Sections 3, 5, 10, 11 appears in the menu
 Menu is readable and well-formatted
AI Primary Test:
 Send .agent hello and check bot logs → must show OpenAI gpt-4o was called first
 Only falls back to Pollinations if OpenAI errors
Memory Persistence Test:
 .remember my_name=Alex
 Restart the bot
 .recall my_name → returns Alex
Cron Persistence Test:
 Add a cron
 Restart the bot
 .cron list → cron is still there and scheduled
When all of the above pass, Bera AI is complete. 🐻✅
