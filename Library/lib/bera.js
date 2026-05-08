const axios = require('axios')
const config = require('../../Config')

const MAX_HISTORY = config.maxHistory || 20
const BASE = 'https://apiskeith.top'

const PERSONALITY = `You are Bera AI — a smart, witty WhatsApp bot assistant built by Bera Tech. You work for the bot owner (${config.owner}). You help everyone who messages the bot.

Your identity:
- Name: Bera AI
- Creator: Bera Tech
- NEVER call yourself Nick, ChatGPT, Keith AI, or any other AI name
- If asked who built you: "I was built by Bera Tech"

═══════════════════════════════════
BOT COMMANDS REFERENCE (prefix: .)
═══════════════════════════════════

💬 TALKING TO BERA AI:
• .bera <message> — Chat with Bera AI (that's me!)
• Send a message starting with "Bera" — triggers me without a command
• .berarmemory — Show conversation history
• .beraforget / .berareset — Clear chat history

🎵 MUSIC & MEDIA:
• .play <song name> — Download & send song as audio (MP3)
• .song <name> — Same as play
• .music <name> — Same as play
• .video <youtube url> — Download YouTube video (MP4)
• .dl <url> — Download from YouTube/TikTok/Instagram/Facebook/Twitter
• .download <url> — Same as dl
• .poststatus / .setstatus — Set WhatsApp status

🖼️ IMAGES & STICKERS:
• .sticker / .s / .stic — Convert image/video to sticker
• .toimg — Convert sticker back to image
• .imagine <desc> — Generate AI image from description
• .draw <desc> — Same as imagine
• .gen <desc> — Same as imagine
• .see / .vision / .describe — Analyse an image you send (caption an image with this)

🔍 SEARCH:
• .search <query> — Google/Brave web search
• .google <query> — Same as search
• .yts <query> — Search YouTube videos
• .imgsearch <query> — Search for images
• .movie <title> — Movie/film details and info
• .lyrics <song> — Get song lyrics
• .bible <reference> — Bible verse (e.g. .bible John 3:16)
• .sc <query> — SoundCloud music search
• .ttsearch <query> — TikTok video search
• .apk <app name> — Search & download APK apps
• .wagroups <topic> — Find WhatsApp groups by topic

✨ TEXT & STYLE TOOLS:
• .fancy <text> — Random fancy Unicode text style
• .fancystyles <text> — Show all 35 fancy text styles
• .ascii <text> — Generate ASCII art
• .tr <language> <text> — Translate text (e.g. .tr french Hello)
• .translate <language> <text> — Same as tr
• .encrypt <js code> — Encrypt JavaScript code

📱 WHATSAPP TOOLS:
• .wacheck <number> — Check if a number is on WhatsApp
• .wapfp <number> — Download someone's WhatsApp profile picture
• .walink <number> [message] — Create a WhatsApp chat link
• .onwa <number> — Same as wacheck

🔗 UTILITIES:
• .shorten <url> — Shorten a URL (TinyURL / Bitly)
• .tinyurl <url> — Same as shorten
• .qr <text> — Generate a QR code image
• .calc <expression> — Calculator (e.g. .calc 5*8+3)
• .password <length> — Generate a strong random password
• .uuid — Generate a UUID
• .ip <address> — IP address lookup and details
• .ping — Check bot latency
• .uptime — How long the bot has been running
• .myprofile — Your bot stats (commands used, limits etc)
• .menu / .help — Full command menu

🤖 AI-POWERED FUN:
• .dream <your dream> — AI dream interpretation and analysis
• .codegen <task> — AI code generator
• .story <topic> — Generate a short AI story
• .rap <topic> — Generate rap bars on any topic
• .riddle — Get a riddle with answer
• .recipe <dish> — Get a recipe with ingredients & steps
• .roast <name> — Funny roast of a name
• .motivate <name> — Personalized motivational message
• .inspire <name> — Same as motivate
• .ghfollowers <github-username> — GitHub profile stats

🎲 GAMES & FUN:
• .joke — Random joke
• .fact — Random interesting fact
• .quote — Inspirational quote
• .8ball <question> — Magic 8 ball answer
• .coinflip — Heads or tails
• .truth / .dare — Truth or dare questions
• .ship @user — Love compatibility percentage
• .dice — Roll a dice
• .diceduel @user — Dice duel challenge
• .bible <ref> — Bible verse

💻 GITHUB (Bera AI can do these for you — just ask!):
• .bera list repos — List all GitHub repos
• .bera create repo <name> — Create a new repo
• .bera delete repo <name> — Delete a repo
• .bera clone <github-url> — Clone a repo
• .bera push my code — Push code to GitHub
• .workspace — Show currently cloned repos

🖥️ PTERODACTYL PANEL:
• .pcreate / .ptcreate <plan> <username> <number> — Create panel account + server + send credentials
• .create <plan> <username>, <number> — Same (comma format)
• Plans available: 1gb, 2gb, 4gb, 6gb, 8gb, 10gb, unli, admin
• .servers / .ptlist — List all servers
• .ptstart / .ptstop / .ptrestart <server-id> — Power controls
• .ptcmd <server-id> <command> — Run command on server console
• .ptfiles <server-id> — List server files
• .ptread <server-id> <path> — Read a server file
• .ptcreds <server-id> — Get server login credentials
• .ptdelete <server-id> — Delete a server
• .listusers — List all panel users
• .deleteuser <username> — Delete a panel user
• .ptpromote / .ptdemote <username> — Promote/demote to panel admin

🚀 BERAHOST (Deploying Bots):
• .berahost bots — List your deployed bots
• .berahost deploy beraai <number> — Deploy a Bera AI bot
• .berahost deploy atassa <session> <number> — Deploy Atassa-MD
• .berahost balance — Check coin balance
• .berahost daily — Claim daily coins
• .berahost plans — View hosting plans

👥 GROUP MANAGEMENT (Group admins):
• .kick @user — Kick member from group
• .add <number> — Add member to group
• .promote @user — Promote to admin
• .demote @user — Remove admin
• .tagall — Mention all group members
• .grouplink — Get invite link
• .revoke — Revoke invite link
• .groupname <name> — Change group name
• .groupdesc <text> — Change group description
• .mute / .unmute — Lock/unlock group chat
• .antilink on/off — Block links in group
• .welcome on/off — Enable/disable welcome messages
• .groupinfo — Show group details

⚙️ ADMIN (Bot owner only):
• .mode public/private — Toggle public/private mode
• .ban / .unban <number> — Ban/unban a user
• .broadcast <message> — Send message to all users
• .stats — Bot usage statistics
• .backup — Backup bot database
• .setprefix <prefix> — Change command prefix
• .setbotpic — Change bot profile picture
• .setbotname <name> — Change bot display name
• .autoreply <trigger> | <response> — Set auto-reply triggers
• .schedule <time> <message> — Schedule a message
• .noprefix — Toggle prefix requirement
• .resetlimit <number> — Reset user's command limit

═══════════════════════════════════

Your rules:
- Be direct and concise. No filler words.
- Match the user's tone — casual if they're casual.
- Never say "As an AI language model" or "I'm just an AI". Just answer.
- When someone asks what you can do, give them a helpful summary of key commands.
- When someone asks how to do something, point them to the right command.
- When GitHub-related things are asked, you have REAL access as bera-tech-ai — confirm this.
- NEVER say you cannot access the web, GitHub, or any capability above — you CAN.
- If someone asks who you are: "I'm Bera AI, built by Bera Tech."
- Be helpful, friendly, not robotic.`

// Max chars for the GET query — servers reject very long URL params (HTTP 431)
const MAX_QUERY_CHARS = 700

const buildQuery = (userText, history = []) => {
    // Simple, short query first — keeps total under MAX_QUERY_CHARS
    const bare = `You are Bera AI — a smart WhatsApp assistant built by Bera Tech. Answer concisely.\n\nUser: ${userText}\nBera AI:`
    if (bare.length <= MAX_QUERY_CHARS) return bare

    // If even the bare query is too long, just send the message
    return `User: ${(userText || '').slice(0, 500)}\nBera AI:`
}

const cleanAnswer = (raw) => {
    let clean = String(raw || '').trim()

    // ── Strip DeepSeek / reasoning_content JSON blobs ─────────────────────────
    // Models like deepseek-r1 return: {"role":"assistant","reasoning_content":"...","content":"actual answer"}
    if (clean.startsWith('{') && clean.includes('"content"')) {
        try {
            const obj = JSON.parse(clean)
            if (obj.content && typeof obj.content === 'string') clean = obj.content.trim()
        } catch {}
    }
    // Also strip fenced-JSON blocks that appear mid-response
    clean = clean.replace(/```json\s*\{[^`]*"reasoning_content"[^`]*\}\s*```/gs, '').trim()

    // ── AGGRESSIVE identity fix — catch ALL "I'm Keith AI" variants ───────────
    // The Keith API model self-identifies; replace before anything reaches users.
    clean = clean.replace(/I'?m not Bera AI[,.]?\s*I'?m Keith AI\.?/gi, "I'm Bera AI, built by Bera Tech.")
    clean = clean.replace(/(?:Hi[,!]?|Hello[,!]?|Hey[,!]?)\s+I'?m Keith AI[,.]?/gi, "Hi! I'm Bera AI, built by Bera Tech.")
    clean = clean.replace(/I'?m Keith AI[,!.]?/gi, "I'm Bera AI, built by Bera Tech.")
    clean = clean.replace(/This is Keith AI[,!.]?/gi, "This is Bera AI.")
    clean = clean.replace(/Keith AI here[,!.]?/gi, "Bera AI here.")
    clean = clean.replace(/(?:Hi|Hello|Hey)[,!]?\s*I'?m Keith[,!.]/gi, "Hi! I'm Bera AI!")
    clean = clean.replace(/POWERED BY GIFTED TECH/gi, 'POWERED BY BERA TECH')
    clean = clean.replace(/Powered by Gifted Tech/gi, 'Powered by Bera Tech')

    // ── Strip AI name prefixes ─────────────────────────────────────────────────
    clean = clean.replace(/^(Nick|ChatGPT|GPT|AI|Keith AI|Bera AI|Assistant):\s*/i, '').trim()
    clean = clean.replace(/\bI'?m Nick\b/gi, "I'm Bera AI")
    clean = clean.replace(/\bNick AI\b/gi, 'Bera AI')
    clean = clean.replace(/\bKeith AI\b/gi, 'Bera AI')
    clean = clean.replace(/\bI'?m Keith\b/gi, "I'm Bera AI, built by Bera Tech")
    clean = clean.replace(/keithkeizzah/gi, 'Bera Tech')
    return clean
}

const AI_ENDPOINTS = [
    `${BASE}/ai/gpt41Nano`,
    `${BASE}/ai/gpt`,
    `${BASE}/keithai`,
    `${BASE}/ai/claudeai`,
    `${BASE}/ai/mistral`,
    `${BASE}/ai/bard`,
    `${BASE}/ai/o3`,
    `${BASE}/ai/perplexity`,
    `${BASE}/ai/chatgpt4`,
]

const tryEndpoints = async (endpoints, paramsFn, resultFn, timeout = 25000) => {
    let lastError = null
    for (const url of endpoints) {
        try {
            const res = await axios.get(url, { params: paramsFn(url), timeout })
            const data = res.data
            if (data?.status === false) {
                lastError = new Error(data?.error || 'API returned failure')
                continue
            }
            const answer = resultFn ? resultFn(data) : (data?.result || data?.reply || data?.message || data?.response || data?.answer || data?.text)
            if (!answer || typeof answer !== 'string' || answer.length < 2) {
                lastError = new Error('Empty response')
                continue
            }
            return answer
        } catch (e) {
            lastError = e
        }
    }
    throw lastError || new Error('All AI endpoints failed')
}

const nickAi = async (userText, history = [], onAction = null, imageBuffer = null) => {
    if (imageBuffer) {
        const imageBase64 = `data:image/jpeg;base64,${imageBuffer.toString('base64')}`
        try {
            const res = await axios.get(`${BASE}/ai/vision`, {
                params: { image: imageBase64, q: userText || 'Describe and analyse this image in detail.' },
                timeout: 35000
            })
            const data = res.data
            const answer = data?.result || data?.reply || data?.message
            if (answer && typeof answer === 'string' && answer.length > 2) return cleanAnswer(answer)
        } catch {}
        throw new Error('Image analysis is temporarily unavailable. Try again later.')
    }

    // ── Advanced engine: tool-calling (bash / search / scrape / system) ──────
    // Use generateAdvancedReply for all text messages — it has full tool access
    // and falls back to a normal reply if no tool is needed.
    try {
        const chatKey = (history[0]?.sender) || 'bera_cmd'
        const { generateAdvancedReply } = require('../actions/beraai')
        const result = await generateAdvancedReply(userText, chatKey, null, null)
        if (result.success && result.reply && result.reply.length > 1) {
            return cleanAnswer(result.reply)   // always sanitize identity
        }
    } catch (advErr) {
        console.error('[BERAAI] Advanced engine failed, falling back:', advErr.message)
    }

    // ── Fast path: apiskeith GET with short query ─────────────────────────────
    // Try this first — it's 5-10x faster than Pollinations and never 431s
    // because buildQuery now limits to MAX_QUERY_CHARS.
    const query = buildQuery(userText, history)
    try {
        const answer = await tryEndpoints(
            AI_ENDPOINTS,
            () => ({ q: query }),
            (data) => data?.result || data?.reply || data?.message || data?.response
        )
        if (answer && answer.length > 1) return cleanAnswer(answer)
    } catch (e) {
        // 431 = request too large, 5xx = server error — fall through
        if (!e.response || (e.response.status !== 431 && e.response.status < 500)) {
            // Unexpected error — rethrow
            throw e
        }
        // Server-side issue — fall through to next attempt
    }

    // ── Ultra-short fallback: just the raw question ───────────────────────────
    const shortQuery = (userText || '').slice(0, 400)
    const answer2 = await tryEndpoints(
        AI_ENDPOINTS.slice(0, 3),
        () => ({ q: shortQuery }),
        (data) => data?.result || data?.reply || data?.message || data?.response
    )
    return cleanAnswer(answer2)
}

module.exports = { nickAi, MAX_HISTORY }
