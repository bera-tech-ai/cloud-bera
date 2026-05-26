const axios = require('axios')
const config = require('../Config')
const moment = require('moment-timezone')
const { makeSticker } = require('../Library/actions/sticker')
const { download, detectPlatform } = require('../Library/actions/downloader')

const hasImage = (msg) => msg && /image|sticker/.test(msg.mimetype || '')
const hasVideo = (msg) => msg && /video|gif/.test(msg.mimetype || '')

const getMediaBuffer = async (conn, msg) => {
    try {
        if (msg && msg.key && msg.message) {
            return await conn.downloadMediaMessage({ key: msg.key, message: msg.message })
        }
        return await conn.downloadMediaMessage(msg)
    } catch { return null }
}

const handle = async (m, { conn, text, reply, prefix, command, isOwner, sender, chat, args }) => {

    if (command === 'ping') {
        const start = Date.now()
        await reply('...')
        const ms = Date.now() - start
        return reply(`╭══〘 *⚡ PING* 〙═⊷\n┃❍ Response: *${ms}ms*\n╰══════════════════⊷`)
    }

    if (command === 'pdf') {
        if (!text) return reply('Usage: ' + prefix + 'pdf <your text>\nGenerates a PDF and sends it as a document.')
        try {
            const PDFDocument = require('pdfkit')
            const fs = require('fs'), path = require('path')
            const ws = path.join(__dirname, '..', 'workspace')
            if (!fs.existsSync(ws)) fs.mkdirSync(ws, { recursive: true })
            const fileName = `bera-${Date.now()}.pdf`
            const fp = path.join(ws, fileName)
            const doc = new PDFDocument({ margin: 50 })
            const stream = fs.createWriteStream(fp)
            doc.pipe(stream)
            doc.fontSize(12).font('Helvetica').text(text, { align: 'left' })
            doc.end()
            await new Promise((res, rej) => { stream.on('finish', res); stream.on('error', rej) })
            const buf = fs.readFileSync(fp)
            await conn.sendMessage(chat, { document: buf, mimetype: 'application/pdf', fileName, caption: `📄 ${fileName} (${(buf.length/1024).toFixed(1)} KB)` }, { quoted: m })
            try { fs.unlinkSync(fp) } catch {}
            return
        } catch (e) {
            return reply('❌ PDF error: ' + e.message)
        }
    }

    if (command === 'uptime') {
        const up = process.uptime()
        const h = Math.floor(up / 3600)
        const min = Math.floor((up % 3600) / 60)
        const sec = Math.floor(up % 60)
        return reply(`╭══〘 *⏱️ UPTIME* 〙═⊷\n┃❍ *${h}h ${min}m ${sec}s*\n╰══════════════════⊷`)
    }

    if (command === 'menu' || command === 'help' || command === 'start') {
        const time = moment().tz('Africa/Nairobi').format('HH:mm:ss')
        const date = moment().tz('Africa/Nairobi').format('dddd, DD MMM YYYY')
        const p = prefix
        const isPrivate = (global.db?.data?.settings?.mode || 'public') === 'private'
        const modeIcon = isPrivate ? '🔒 Private' : '🌐 Public'
        const bhKey = global.db?.data?.settings?.bhApiKey || process.env.BH_API_KEY
        const gitKey = global.db?.data?.settings?.gitToken || process.env.GIT_TOKEN
        const lines = [
            '╭══〘 *🤖 BERA AI MENU* 〙═⊷',
            '┃❍ 🕐 ' + time + '  |  📅 ' + date,
            '┃❍ ⚡ Prefix: *' + p + '*  |  Mode: *' + modeIcon + '*',
            '┃❍ 🖥️ BeraHost: ' + (bhKey ? '✅ Connected' : '❌ Not set — use ' + p + 'setbhkey'),
            '┃❍ 🐙 GitHub: ' + (gitKey ? '✅ Token set' : '❌ Not set — use ' + p + 'setgittoken'),
            '┃',
            '┃ ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
            '┃ ✨ *WHAT BERA CAN DO:*',
            '┃ ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
            '┃❍ 🤖 Full autonomous AI agent with 46+ tools',
            '┃❍ 💻 Write, run, debug code in any language',
            '┃❍ 🐙 Full Git/GitHub integration',
            '┃❍ 🚀 Deploy to 6+ platforms (Vercel, Railway, etc.)',
            '┃❍ 🖥️ SSH into remote servers and run commands',
            '┃❍ 🌐 Make live HTTP/API requests from WhatsApp',
            '┃❍ 📸 Screenshot any website and send the image',
            '┃❍ ⏰ Schedule recurring agent tasks (cron)',
            '┃❍ 🗄️ Query databases with SQL from WhatsApp',
            '┃❍ 🧠 Remember facts permanently (survives restarts)',
            '┃❍ 📡 Monitor websites and alert on downtime',
            '┃❍ 🐳 Docker, Kubernetes, Terraform management',
            '┃❍ 🔐 Security auditing and secret management',
            '┃❍ 🤖 ML: sentiment, transcription, object detection',
            '┃❍ 📈 Performance benchmarking and profiling',
            '┃',
            '┃ ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
            '┃ 🤖 *AGENT & AI COMMANDS*',
            '┃ ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
            '┃❍ *' + p + 'agent* <task> — Full autonomous AI agent',
            '┃❍ *' + p + 'bera* <msg> — Chat with Bera AI',
            '┃❍ *' + p + 'chatbot* on/off — Toggle AI responses',
            '┃❍ *' + p + 'beratrigger* <word> — Set custom trigger',
            '┃❍ *' + p + 'tagreply* on/off — Auto-reply when tagged',
            '┃❍ *' + p + 'history* — Show last agent task history',
            '┃',
            '┃ 💡 *Example agent tasks:*',
            '┃ • build a todo REST API in Express + SQLite and deploy',
            '┃ • SSH into my VPS at 1.2.3.4 and restart nginx',
            '┃ • review my latest project for security bugs',
            '┃ • take a screenshot of https://bera.ai',
            '┃ • cron: every day at 9am send me Nairobi weather',
            '┃ • deploy my myapp folder to Vercel',
            '┃',
            '┃ ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
            '┃ 🔧 *DEVELOPER TOOLS*',
            '┃ ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
            '┃❍ *' + p + 'run* node <code> — Run Node.js code',
            '┃❍ *' + p + 'run* python <code> — Run Python code',
            '┃❍ *' + p + 'run* bash <cmd> — Run shell command',
            '┃❍ *' + p + 'review* — AI code review (quote code)',
            '┃❍ *' + p + 'http* get <url> — Make a live API request',
            '┃❍ *' + p + 'apidocs* <folder> — Generate API documentation',
            '┃❍ *' + p + 'calc* <expr> — Math calculator',
            '┃❍ *' + p + 'unit* 100 km to mi — Unit conversion',
            '┃❍ *' + p + 'currency* 100 USD to KES — Live currency',
            '┃❍ *' + p + 'jsonformat* <json> — Pretty-print & validate JSON',
            '┃❍ *' + p + 'regex* <pat>|<test> — Test a regex pattern',
            '┃❍ *' + p + 'jwt* decode <token> — Decode a JWT token',
            '┃❍ *' + p + 'base64* encode <txt> — Encode to base64',
            '┃❍ *' + p + 'hash* sha256 <text> — Hash text',
            '┃❍ *' + p + 'bench* <url> — Load testing / benchmark',
            '┃',
            '┃ ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
            '┃ 🐳 *DEVOPS & CONTAINERS*',
            '┃ ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
            '┃❍ *' + p + 'docker* ps — List Docker containers',
            '┃❍ *' + p + 'docker* build . -t myapp — Build image',
            '┃❍ *' + p + 'docker* run myapp — Run container',
            '┃❍ *' + p + 'docker-compose* up — Start compose stack',
            '┃❍ *' + p + 'kubectl* get pods — Kubernetes status',
            '┃❍ *' + p + 'terraform* apply — Infrastructure as code',
            '┃',
            '┃ ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
            '┃ 🗄️ *DATABASE TOOLS*',
            '┃ ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
            '┃❍ *' + p + 'db* query <sql> — Run SQL query',
            '┃❍ *' + p + 'migrate* create <name> — Create migration',
            '┃❍ *' + p + 'migrate* up — Apply migrations',
            '┃❍ *' + p + 'backup* database — Backup database',
            '┃',
            '┃ ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
            '┃ 🚀 *DEPLOY*',
            '┃ ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
            '┃❍ *' + p + 'vercel* deploy <folder> — Deploy to Vercel',
            '┃❍ *' + p + 'vercel* list — List Vercel projects',
            '┃❍ *' + p + 'vercel* logs <name> — Get deployment logs',
            '┃❍ *' + p + 'deploy* <folder> — Deploy with PM2 (local)',
            '┃❍ *' + p + 'setverceltoken* <tok> — Set Vercel token',
            '┃',
            '┃ ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
            '┃ 🌐 *WEB & MEDIA TOOLS*',
            '┃ ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
            '┃❍ *' + p + 'screenshot* <url> — Screenshot any website',
            '┃❍ *' + p + 'ocr* — Extract text from image (quote it)',
            '┃❍ *' + p + 'convert* pdf — Convert quoted file to PDF',
            '┃❍ *' + p + 'convert* mp3 — Extract audio from video',
            '┃❍ *' + p + 'tts* <text> — Text-to-speech audio',
            '┃❍ *' + p + 'imagine* <desc> — Generate AI image',
            '┃❍ *' + p + 'see* — Analyze a quoted image',
            '┃❍ *' + p + 'qr* <data> — Generate a QR code',
            '┃❍ *' + p + 'tunnel* start <port> — Create public tunnel',
            '┃❍ *' + p + 'search* <query> — Search the web',
            '┃',
            '┃ ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
            '┃ 🧠 *MEMORY & NOTES*',
            '┃ ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
            '┃❍ *' + p + 'remember* <fact> — Save a fact permanently',
            '┃❍ *' + p + 'recall* — Show all saved memories',
            '┃❍ *' + p + 'forget* <key> — Delete a specific memory',
            '┃❍ *' + p + 'note* save <title> <text> — Save a note',
            '┃❍ *' + p + 'note* list — List all notes',
            '┃❍ *' + p + 'note* search <query> — Search notes',
            '┃❍ *' + p + 'note* export pdf — Export notes as PDF',
            '┃',
            '┃ ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
            '┃ ⏰ *AUTOMATION & MONITORING*',
            '┃ ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
            '┃❍ *' + p + 'cron* add <id> <schedule> <task> — Schedule task',
            '┃❍ *' + p + 'cron* list — View all cron jobs',
            '┃❍ *' + p + 'cron* remove <id> — Remove a cron job',
            '┃❍ *' + p + 'monitor* add <id> <url> — Monitor a website',
            '┃❍ *' + p + 'monitor* list — List monitored sites',
            '┃❍ *' + p + 'monitor* check <id> — Check a site now',
            '┃❍ *' + p + 'remind* <time> <msg> — One-time reminder',
            '┃',
            '┃ ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
            '┃ 🤖 *ML & AI TOOLS*',
            '┃ ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
            '┃❍ *' + p + 'classify* <text> — Sentiment analysis',
            '┃❍ *' + p + 'embed* <text> — Generate text embedding',
            '┃❍ *' + p + 'finetune* prepare — Prepare training data',
            '┃❍ *' + p + 'rag* index <folder> — Index docs for RAG',
            '┃❍ *' + p + 'rag* query <question> — Query your documents',
            '┃',
            '┃ ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
            '┃ 🔐 *SECURITY*',
            '┃ ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
            '┃❍ *' + p + 'audit* <app> — Security audit',
            '┃❍ *' + p + 'secret* set <key> <val> — Store encrypted secret',
            '┃❍ *' + p + 'scan* <url> — Vulnerability scan',
            '┃❍ *' + p + 'encrypt* <file> — Encrypt file',
            '┃',
            '┃ ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
            '┃ ✍️ *AI WRITING TOOLS*',
            '┃ ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
            '┃❍ *' + p + 'debate* <topic> — Pro/con arguments',
            '┃❍ *' + p + 'quiz* <topic> <n> — Generate quiz questions',
            '┃❍ *' + p + 'lesson* <topic> — Generate lesson plan',
            '┃❍ *' + p + 'readme* <project> — Generate README.md',
            '┃❍ *' + p + 'tldr* <text> — 3-bullet summary',
            '┃❍ *' + p + 'simplify* <text> — Simplify to 5th grade',
            '┃❍ *' + p + 'paraphrase* <text> — Rephrase in diff style',
            '┃❍ *' + p + 'refactor* <code> — Suggest refactoring',
            '┃',
            '┃ ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
            '┃ 🎮 *FUN & ENTERTAINMENT*',
            '┃ ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
            '┃❍ *' + p + 'riddle* — Random riddle',
            '┃❍ *' + p + 'trivia* — Random trivia question',
            '┃❍ *' + p + 'joke* <topic> — Tell a joke',
            '┃❍ *' + p + 'fact* <topic> — Random interesting fact',
            '┃❍ *' + p + 'horoscope* <sign> — Daily horoscope',
            '┃❍ *' + p + 'weather* <city> — Weather with emojis',
            '┃❍ *' + p + 'news* <topic> — Top news headlines',
            '┃❍ *' + p + 'meme* <topic> — Generate meme image',
            '┃❍ *' + p + 'fortune* — Fortune cookie message',
            '┃❍ *' + p + 'roast* <text> — AI roast of anything',
            '┃❍ *' + p + 'stocks* <symbol> — Stock price + change',
            '┃❍ *' + p + 'crypto* <symbol> — Cryptocurrency price',
            '┃',
            '┃ ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
            '┃ 👥 *GROUP MANAGEMENT*',
            '┃ ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
            '┃❍ *' + p + 'kick* @user — Remove from group',
            '┃❍ *' + p + 'add* <number> — Add to group',
            '┃❍ *' + p + 'promote* @user — Make admin',
            '┃❍ *' + p + 'demote* @user — Remove admin',
            '┃❍ *' + p + 'tagall* — Tag all members',
            '┃❍ *' + p + 'mute* <time> — Mute group',
            '┃❍ *' + p + 'poll* <question> <opt1> <opt2> — Create poll',
            '┃❍ *' + p + 'antilink* on/off — Block link sharing',
            '┃❍ *' + p + 'welcome* on/off — Toggle welcome messages',
            '┃',
            '┃ ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
            '┃ 🖥️ *BERAHOST — Bot Deployment Platform*',
            '┃ ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
            '┃❍ *' + p + 'deploy* beraai 254712345678 — Deploy Bera AI bot',
            '┃❍ *' + p + 'deploy* atassa 254712.. Gifted~sess — Deploy Atassa-MD',
            '┃❍ *' + p + 'bh* — Dashboard (all bots + coin balance)',
            '┃❍ *' + p + 'bh* bots — Available bot templates',
            '┃❍ *' + p + 'bh* status <id> — Status + metrics (CPU/RAM)',
            '┃❍ *' + p + 'bh* logs <id> [n] — Last N log lines',
            '┃❍ *' + p + 'bh* start/stop/restart <id> — Power control',
            '┃❍ *' + p + 'bh* env <id> KEY=VAL — Update env variable',
            '┃❍ *' + p + 'bh* delete <id> — Remove deployment',
            '┃❍ *' + p + 'bh* coins — Coin balance + daily streak',
            '┃❍ *' + p + 'bh* claim — Claim daily free coins',
            '┃❍ *' + p + 'bh* plans — Coin & subscription plans',
            '┃❍ *' + p + 'bh* pay <kes> <phone> — M-Pesa top-up',
            '┃❍ *' + p + 'bh* setkey <key> — Save API key',
            '┃',
            '┃ ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
            '┃ ⚙️ *OWNER / ADMIN TOOLS*',
            '┃ ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
            '┃❍ *' + p + 'ssh* save <name> user@host — Save SSH server',
            '┃❍ *' + p + 'ssh* <name> <cmd> — Run remote command',
            '┃❍ *' + p + 'broadcast* <msg> — Send to all users',
            '┃❍ *' + p + 'mode* public/private — Bot access mode',
            '┃❍ *' + p + 'ban* / *' + p + 'unban* <num> — Block/unblock users',
            '┃❍ *' + p + 'setbhkey* <key> — Set BeraHost API key',
            '┃❍ *' + p + 'setgittoken* <tok> — Set GitHub token',
            '┃❍ *' + p + 'setverceltoken* <tok> — Set Vercel token',
            '┃❍ *' + p + 'noprefix* on/off — Toggle prefix requirement',
            '┃❍ *$* <bash cmd> — Run bash on server',
            '┃',
            '┃ ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
            '┃ 🔑 *ACCESS KEYS*',
            '┃ ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
            '┃❍ *' + p + 'activate* <key> — Activate your access key',
            '┃❍ *' + p + 'checkkey* — Check your key status',
            '┃❍ *' + p + 'genkey* <num> <days> — Generate key (owner)',
            '┃',
            '┃ ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
            '┃ ❓ *GENERAL*',
            '┃ ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
            '┃❍ *' + p + 'ping* — Check bot response time',
            '┃❍ *' + p + 'menu* / *' + p + 'help* — Show this menu',
            '┃❍ *' + p + 'uptime* — Bot uptime',
            '┃❍ *' + p + 'donate* — Support Bera Tech',
            '┃',
            '╰══〘 *🚀 Bera AI v4.0 — Created by Bera Tech* 〙═⊷',
        ]
        return reply(lines.join('\n'))
    }

    if (command === 'info') {
        return reply(
            `╭══〘 *🤖 BOT INFO* 〙═⊷\n` +
            `┃❍ *Name:* ${config.botName}\n` +
            `┃❍ *Version:* 2.0.0\n` +
            `┃❍ *Developer:* Bera Tech\n` +
            `┃❍ *Prefix:* ${prefix}\n` +
            `┃❍ *Platform:* WhatsApp\n` +
            `┃❍ *Framework:* Baileys (@whiskeysockets/baileys)\n` +
            `╰══════════════════⊷`
        )
    }

    if (command === 'sticker' || command === 'stic' || command === 's') {
        const quoted = m.quoted
        const msgObj = quoted || m

        if (!hasImage(msgObj) && !hasVideo(msgObj)) {
            return reply(`❌ Send or quote an image/GIF with *${prefix}sticker*`)
        }

        await conn.sendMessage(m.chat, { react: { text: '⏳', key: m.key } }).catch(() => {})

        const buf = await getMediaBuffer(conn, msgObj)
        if (!buf) return reply('❌ Failed to download media.')

        try {
            const packname = text?.split(';')[0]?.trim() || config.botName
            const author = text?.split(';')[1]?.trim() || 'Bera Tech'
            const sticker = await makeSticker(buf, { packname, author })
            await conn.sendMessage(m.chat, { sticker }, { quoted: m })
            await conn.sendMessage(m.chat, { react: { text: '✅', key: m.key } }).catch(() => {})
        } catch (e) {
            await conn.sendMessage(m.chat, { react: { text: '❌', key: m.key } }).catch(() => {})
            return reply(`❌ Sticker creation failed: ${e.message}`)
        }
    }

    if (command === 'toimg') {
        const quoted = m.quoted
        if (!quoted || !/sticker/.test(quoted.mimetype || '')) return reply('❌ Quote a sticker to convert.')
        await conn.sendMessage(m.chat, { react: { text: '⏳', key: m.key } }).catch(() => {})
        const buf = await getMediaBuffer(conn, quoted)
        if (!buf) return reply('❌ Failed to download sticker.')
        try {
            await conn.sendMessage(m.chat, { image: buf, caption: 'Here is your image!' }, { quoted: m })
            await conn.sendMessage(m.chat, { react: { text: '✅', key: m.key } }).catch(() => {})
        } catch (e) {
            await conn.sendMessage(m.chat, { react: { text: '❌', key: m.key } }).catch(() => {})
            return reply(`❌ Conversion failed: ${e.message}`)
        }
    }

    if (command === 'dl' || command === 'download') {
        const url = text?.trim()
        if (!url || !url.startsWith('http')) return reply(`❌ Usage: ${prefix}dl <link>`)
        const platform = detectPlatform(url)
        await conn.sendMessage(m.chat, { react: { text: '⬇️', key: m.key } }).catch(() => {})
        const result = await download(url)
        if (!result.success) {
            await conn.sendMessage(m.chat, { react: { text: '❌', key: m.key } }).catch(() => {})
            return reply(`❌ Download failed: ${result.error}`)
        }
        await conn.sendMessage(m.chat, { react: { text: '✅', key: m.key } }).catch(() => {})
        if (result.type === 'video') {
            return conn.sendMessage(m.chat, { video: { url: result.url }, caption: result.title || platform }, { quoted: m })
        }
        if (result.type === 'image') {
            return conn.sendMessage(m.chat, { image: { url: result.url }, caption: result.title || platform }, { quoted: m })
        }
        return conn.sendMessage(m.chat, { document: { url: result.url }, fileName: result.title || 'download', mimetype: 'application/octet-stream' }, { quoted: m })
    }

    if (command === 'berarmemory') {
        const hist = global.db?.data?.users?.[sender]?.nickHistory || []
        if (!hist.length) return reply('📭 No AI chat history found.')
        const preview = hist.slice(-6).map(h => `_${h.role === 'user' ? '👤' : '🤖'}_: ${h.content.slice(0, 100)}`).join('\n')
        return reply(`╭══〘 *🧠 BERA AI MEMORY* 〙═⊷\n${preview}\n╰══════════════════⊷\n_Last ${Math.min(hist.length, 6)} messages_`)
    }

    if (command === 'beraforget' || command === 'berareset') {
        if (global.db?.data?.users?.[sender]) {
            global.db.data.users[sender].nickHistory = []
            await global.db.write()
        }
        return reply('🗑️ Your Bera AI chat history has been cleared.')
    }

    if (command === 'setprefix') {
        if (!isOwner) return reply(`⛔ Owner only.`)
        if (!text) return reply(`❌ Usage: ${prefix}setprefix <new prefix>`)
        const newPrefix = text.trim()[0]
        if (!global.db.data.settings) global.db.data.settings = {}
        global.db.data.settings.prefix = newPrefix
        await global.db.write()
        await conn.sendMessage(chat, { react: { text: '✅', key: m.key } }).catch(() => {})
        return reply(`✅ Prefix changed to *${newPrefix}*`)
    }

    if (command === 'setendpoint') {
        if (!isOwner) return reply(`⛔ Owner only.`)
        if (!text) return reply(`❌ Usage: ${prefix}setendpoint <url>`)
        config.nickApiEndpoint = text.trim()
        return reply(`✅ API endpoint updated to: ${text.trim()}`)
    }

    if (command === 'setbotpic' || command === 'setbotimage') {
        if (!isOwner) return reply(`⛔ Owner only.`)
        const quoted = m.quoted
        if (!quoted || !/image/.test(quoted.mimetype || '')) return reply('❌ Quote an image to set as bot pic.')
        await conn.sendMessage(m.chat, { react: { text: '⏳', key: m.key } }).catch(() => {})
        try {
            const buf = await getMediaBuffer(conn, quoted)
            if (!buf) return reply('❌ Failed to download image.')
            await conn.updateProfilePicture(conn.user.id, buf)
            await conn.sendMessage(m.chat, { react: { text: '✅', key: m.key } }).catch(() => {})
            return reply('✅ Bot profile picture updated!')
        } catch (e) {
            await conn.sendMessage(m.chat, { react: { text: '❌', key: m.key } }).catch(() => {})
            return reply(`❌ Failed: ${e.message}`)
        }
    }

    if (command === 'setbotname') {
        if (!isOwner) return reply(`⛔ Owner only.`)
        if (!text) return reply(`❌ Usage: ${prefix}setbotname <new name>`)
        try {
            await conn.updateProfileName(text.trim())
            config.botName = text.trim()
            await conn.sendMessage(chat, { react: { text: '✅', key: m.key } }).catch(() => {})
            return reply(`✅ Bot name changed to *${text.trim()}*`)
        } catch (e) {
            return reply(`❌ Failed: ${e.message}`)
        }
    }

    if (command === 'pm') {
        if (!isOwner) return reply(`⛔ Owner only.`)
        if (!args[0]) return reply(`❌ Usage: ${prefix}pm <number> <message>\nExample: ${prefix}pm 254712345678 Hello there!`)
        const rawNum = args[0].replace(/\D/g, '')
        if (rawNum.length < 7 || rawNum.length > 15) return reply(`❌ Invalid number: ${args[0]}`)
        const pmMsg = args.slice(1).join(' ').trim()
        if (!pmMsg) return reply(`❌ Include a message after the number.\nExample: ${prefix}pm 254712345678 Hello!`)
        try {
            const jid = rawNum + '@s.whatsapp.net'
            await conn.sendMessage(jid, { text: pmMsg })
            return reply(`✅ Message sent to *+${rawNum}*\n📨 _${pmMsg}_`)
        } catch(e) { return reply(`❌ Failed: ${e.message}`) }
    }

    if (command === 'myprofile') {
        const user = global.db?.data?.users?.[sender] || {}
        return reply(
            `╭══〘 *👤 MY PROFILE* 〙═⊷\n` +
            `┃❍ *Number:* +${sender.split('@')[0]}\n` +
            `┃❍ *Status:* ${user.premium ? '⭐ Premium' : '👤 Regular'}\n` +
            `┃❍ *Commands Used:* ${user.commandCount || 0}\n` +
            `┃❍ *Daily Limit Left:* ${user.premium ? 'Unlimited' : (user.limit || 10)}\n` +
            `┃❍ *Level:* ${user.level || 0}\n` +
            `┃❍ *EXP:* ${user.exp || 0}\n` +
            `╰══════════════════⊷`
        )
    }
}

handle.before = async (m, { conn }) => {
    try {
        const pending = global.db?.data?.pendingCreds
        if (!pending) return
        const jid = m.sender
        if (!pending[jid]) return
        const credMsg = pending[jid]
        delete global.db.data.pendingCreds[jid]
        await global.db.write()
        await conn.sendMessage(jid, { text: credMsg })
    } catch {}
}

handle.command = [
    'ping', 'menu', 'help', 'start', 'info',
    'sticker', 'stic', 's', 'toimg', 'pdf',
    'dl', 'download',
    'berarmemory', 'beraforget', 'berareset',
    'setprefix', 'setendpoint', 'myprofile',
    'setbotpic', 'setbotimage', 'setbotname',
    'uptime', 'pm',
]
handle.tags = ['general']

module.exports = handle
