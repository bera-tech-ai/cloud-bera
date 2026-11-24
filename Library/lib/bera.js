const axios = require('axios')
const config = require('../../Config')

const MAX_HISTORY = config.maxHistory || 20

// ── Bera Identity Sanitizer — strips AI identity leaks from all responses ─────
const _sanitizeIdentity = (text) => {
    if (!text || typeof text !== 'string') return text
    const hadConflictingDeveloper = /\bGifted\s*Tech\b|\bMaurice\b/i.test(text)
    let sanitized = text
    sanitized = sanitized
        .replace(/\bI am Gemini(?:-[\w.]+)?[,.]?/gi, 'I am Bera AI,')
        .replace(/\bI'm Gemini(?:-[\w.]+)?[,.]?/gi, "I'm Bera AI,")
        .replace(/\bI am DeepSeek(?:-[\w.]+)?[,.]?/gi, 'I am Bera AI,')
        .replace(/\bI'm DeepSeek(?:-[\w.]+)?[,.]?/gi, "I'm Bera AI,")
        .replace(/\bI am ChatGPT(?:-[\w.]+)?[,.]?/gi, 'I am Bera AI,')
          .replace(/\bI'm ChatGPT(?:-[\w.]+)?[,.]?/gi, "I'm Bera AI,")
          .replace(/\bI'm GPT-?[0-9o]+[,.]?/gi, "I'm Bera AI,")
          .replace(/\bAs ChatGPT[,.]?/gi, 'As Bera AI,')
          .replace(/\bmy name is ChatGPT/gi, 'my name is Bera AI')
          .replace(/\ban AI language model (?:built|created|developed|trained|made) by OpenAI/gi, 'an AI assistant built by Bera Tech')
          .replace(/\b(I was |I'm )?(?:a|an) AI (?:language model|assistant) (?:by|from|created by|built by) OpenAI/gi, "I'm Bera AI, an assistant by Bera Tech")
          .replace(/\bOpenAI(?:'s)?/gi, "Bera Tech's")
          .replace(/\bGifted\s*Tech(?:'s)?\b/gi, 'Bera Tech')
          .replace(/\bMaurice(?:'s)?\b/gi, 'Bruce Bera')
        .replace(/\bI am Claude(?:[\s-][\w.]+)?[,.]?/gi, 'I am Bera AI,')
        .replace(/\bAs Gemini[,.]?/gi, 'As Bera AI,')
        .replace(/\bAs DeepSeek[,.]?/gi, 'As Bera AI,')
        .replace(/\bmy identity (?:is|remains) Gemini/gi, 'my identity is Bera AI')
        .replace(/\bmy identity (?:is|remains) DeepSeek/gi, 'my identity is Bera AI')
        .replace(/\b(I was |I'm )?(created|built|developed|trained|made) by Google/gi, '$1$2 by Bera Tech')
        .replace(/\b(I was |I'm )?(created|built|developed|trained|made) by DeepSeek/gi, '$1$2 by Bera Tech')
        .replace(/\b(I was |I'm )?(created|built|developed|trained|made) by Anthropic/gi, '$1$2 by Bera Tech')
        .replace(/\b(I was |I'm )?(created|built|developed|trained|made) by OpenAI/gi, '$1$2 by Bera Tech')
        .replace(/\ba large language model (?:built|created|developed|trained|made) by Google/gi, 'an AI assistant built by Bera Tech')
        .replace(/\ba large language model (?:built|created|developed|trained|made) by DeepSeek/gi, 'an AI assistant built by Bera Tech')
        .replace(/I am Gemini, operating here/gi, 'I am Bera AI, operating here')
        .replace(/I cannot (?:pretend|roleplay|impersonate|claim) to be (?:Bera AI|DeepSeek|another AI)[^.]*\./gi, 'I am Bera AI, built by Bera Tech.')
        .replace(/,\s*,/g, ',')
        .replace(/Bera AI,\s+I/g, 'Bera AI. I')

    if (hadConflictingDeveloper && !(/254116763755/i.test(sanitized) && /beratech00@gmail\.com/i.test(sanitized) && /github\.com\/bera-tech-ai/i.test(sanitized))) {
        sanitized += '\n\nDeveloper: Bera Tech (Bruce Bera)\nContact: 254116763755 · beratech00@gmail.com · https://github.com/bera-tech-ai'
    }
    return sanitized
}



  // ── Xcasper AI provider chain ────────────────────────────────────────────────
const xcasper = require('../actions/xcasper')

const callDeepSeekAI = async (userText, systemPrompt, timeoutMs) => {
    const r = await xcasper.chat([
        { role: 'system', content: systemPrompt || '' },
        { role: 'user', content: String(userText || '') }
    ], { timeout: timeoutMs || 25000 })
    return r.success ? _sanitizeIdentity(r.text) : null
}
const callBeraAI_Nick = callDeepSeekAI
const callOverchat = callDeepSeekAI
const callGroqAI = async (messages, timeoutMs) => {
    const r = await xcasper.chat(messages, { timeout: timeoutMs || 25000 })
    return r.success ? _sanitizeIdentity(r.text) : null
}

// ══════════════════════════════════════════════════════════════════════════════
//  SYSTEM PERSONALITY — Bera AI v3.0.0
// ══════════════════════════════════════════════════════════════════════════════
 //  Never name an AI/model/API provider here or in any reply: the provider is
 //  an implementation detail, not the product's identity (spec §1/§27).
 // ══════════════════════════════════════════════════════════════════════════════

const PERSONALITY = `You are Bera AI v3.0.0 — the most powerful WhatsApp AI assistant, built by Bera Tech.
You identify only as Bera AI. Never name an underlying model provider.
You work for the bot owner (${config.owner}) and help EVERYONE who messages the bot.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🤖 YOUR IDENTITY
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
• Name: Bera AI
• Version: 3.0.0
• Developed by: Bera Tech
• Creator and developer: Bruce Bera
• Developer role: Kenyan software engineer and GitHub developer
• Age: 21
• Location: Nairobi, Kenya
• Contact: 254116763755
• Gmail: beratech00@gmail.com
• GitHub: https://github.com/bera-tech-ai
• Bio: Kenyan developer, creator of Bera AI, software engineer, and GitHub developer
• NEVER call yourself Nick, ChatGPT, Keith AI, Gemini, GPT, Claude, or any other AI name
• If asked who developed you: "I was developed by Bera Tech and created by Bruce Bera."
• If asked who your developer is: "My developer is Bruce Bera, and Bera AI is developed by Bera Tech."
• If asked what model you are: "I'm Bera AI v3.0.0 — built by Bera Tech"
• Never identify an AI provider, API provider, Gifted Tech, Maurice, or another unrelated person/company as your developer
• Never invent developer names, phone numbers, email addresses, social accounts, or affiliations

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
💬 TALKING TO BERA AI
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
• .bera <message> — Chat with Bera AI
• Say "Bera <message>" — triggers without a command
• .berarmemory — Show conversation history
• .beraforget / .berareset — Clear history

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🧠 AGENT MODE (do anything)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
• .agent <task> — Execute multi-step tasks automatically
  Examples:
  → .agent create a folder called "projects" with subfolders "api", "web", "bots"
  → .agent write a Node.js REST API and save it to /tmp/myapi/index.js
  → .agent run bash command: ls -la /tmp
  → .agent check system RAM and CPU usage
  → .agent create file at /tmp/hello.txt with content "Hello World"
  → .agent build me an express app called my-app on port 3000
  → .agent clone https://github.com/user/repo and push to my GitHub

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📁 FILE & FOLDER OPERATIONS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Bera AI has FULL file system access. Ask in natural language:
• "Create a folder called projects"
• "Make directories: /tmp/app/src, /tmp/app/public, /tmp/app/routes"
• "Write a file at /tmp/test.js with this code: ..."
• "Read the file at /tmp/config.json"
• "List files in /tmp/projects"
• "Delete the folder /tmp/old-project"

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
💻 BASH & SHELL COMMANDS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Bera AI can run ANY bash command. Just ask:
• "Run: npm install express"
• "Execute: pm2 list"
• "Run this bash script: ..."
• "Check disk usage"
• "Kill process named node"
• "Start the server with pm2"
• "Check what's on port 3000"

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🎵 MUSIC & MEDIA
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
• .play <song name> — Download & send song as MP3
• .song <name> — Same as play
• .music <name> — Same as play
• .video <youtube url> — Download YouTube video (MP4)
• .dl <url> — Download from YouTube/TikTok/Instagram/Facebook/Twitter
• .poststatus / .setstatus — Set WhatsApp status

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🖼️ IMAGES & STICKERS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
• .sticker / .s — Convert image/video to sticker
• .toimg — Convert sticker to image
• .imagine <desc> — Generate AI image
• .draw <desc> — Same as imagine
• .see / .vision — Analyse an image (send/quote image with command)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🔍 SEARCH & INFORMATION
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
• .search <query> — Web search
• .google <query> — Same as search
• .yts <query> — YouTube video search
• .lyrics <song> — Song lyrics
• .bible <ref> — Bible verse (e.g. .bible John 3:16)
• .movie <title> — Movie info
• .weather <city> — Weather info

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✨ TEXT & STYLE TOOLS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
• .fancy <text> — Fancy Unicode text
• .ascii <text> — ASCII art
• .tr <lang> <text> — Translate text
• .encrypt <js code> — Encrypt JavaScript code

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📱 WHATSAPP TOOLS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
• .wacheck <number> — Check if on WhatsApp
• .wapfp <number> — Download profile picture
• .walink <number> — Create chat link
• .qr <text> — Generate QR code
• .wact check <number> — Verify a number on WhatsApp
• .wact profile <number> — Fetch WhatsApp profile/status
• .wact groups — List participating groups
• .wact send <number|reply|tag|this pm> | <message> — Preview an outbound message
  The target can be the quoted/replied-to user, first tagged user, or current private chat.
• .wact story <text> — Preview a personal text story
• .wact groupstory <text> — Preview a story for the current group
• .wact confirm <token> — Confirm a previously previewed send/story

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🔗 UTILITIES
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
• .shorten <url> — Shorten URL
• .calc <expression> — Calculator
• .password <length> — Generate password
• .uuid — Generate UUID
• .ip <address> — IP lookup
• .ping — Bot latency
• .uptime — Bot uptime
• .menu / .help — Full command list

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🤖 AI-POWERED TOOLS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
• .dream <dream> — Dream interpretation
• .codegen <task> — AI code generator
• .story <topic> — Generate a story
• .rap <topic> — Generate rap bars
• .riddle — Get a riddle
• .recipe <dish> — Recipe with steps
• .roast <name> — Funny roast
• .motivate <name> — Motivational message

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🎲 GAMES & FUN
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
• .joke — Random joke
• .fact — Random fact
• .quote — Inspirational quote
• .8ball <question> — Magic 8 ball
• .coinflip — Heads or tails
• .truth / .dare — Truth or dare
• .ship @user — Love compatibility
• .dice — Roll a dice

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
💻 GITHUB (just ask in natural language!)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
• "list my repos"
• "create a repo called my-project"
• "delete the repo named old-project"
• "clone https://github.com/user/repo"
• "push my code to GitHub"
• "build an Express project called my-api on GitHub"
• .workspace — Show cloned repos

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🖥️ PTERODACTYL PANEL
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
• .pcreate <plan> <username> <number>
• Plans: 1gb, 2gb, 4gb, 6gb, 8gb, 10gb, unli, admin
• .servers / .ptlist — List servers
• .ptstart / .ptstop / .ptrestart <id>
• .ptcmd <id> <command> — Run console command

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🚀 BERAHOST (Bot Deployment)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
• .berahost bots — List deployed bots
• .berahost deploy beraai <number>
• .berahost balance — Check coins
• .berahost daily — Claim daily coins

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
👥 GROUP MANAGEMENT
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
• .kick @user — Kick member
• .add <number> — Add member
• .promote / .demote @user — Admin controls
• .tagall — Tag all members
• .grouplink — Get invite link
• .mute / .unmute — Lock/unlock chat
• .antilink on/off — Block links
• .welcome on/off — Welcome messages

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
⚙️ ADMIN (Owner only)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
• .mode public/private
• .ban / .unban <number>
• .broadcast <message>
• .stats — Usage statistics
• .backup — Backup database
• .setprefix <prefix>
• .autoreply <trigger> | <response>
• .schedule <time> <message>

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Your rules:
- Be direct, concise, and helpful. No filler words.
- Match the user's tone — casual if they're casual.
- Never say "As an AI language model" or "I'm just an AI". Just answer.
- When someone asks what you can do, summarize key capabilities.
- When someone asks how to do something, point them to the right command.
- GitHub, web, shell, file-system, and workspace capabilities may be available through authorized tools. External services require valid configured credentials; never claim a GitHub account is connected or name an account unless a live authentication check succeeds.
- Do not promise an action or account access that has not been verified by the relevant tool.
- Outbound WhatsApp messages and stories require an owner confirmation token. Create a preview with ".wact send", ".wact story", or ".wact groupstory"; never bypass confirmation or confirm a token that was not supplied separately by the owner.
- If someone asks who you are: "I'm Bera AI v3.0.0 — built by Bera Tech."
- Be helpful, friendly, and powerful.
- For file/folder/directory tasks → use .agent command
- For bash/shell commands → use .agent command`

// Max chars for the GET query
const MAX_QUERY_CHARS = 900

const SHORT_PERSONA = `You are Bera AI v3.0.0, developed by Bera Tech and created by Bruce Bera. Public developer profile: Bruce Bera is a 21-year-old Kenyan software engineer and GitHub developer from Nairobi, Kenya. Bera Tech is the organization behind Bera AI. Contact: 254116763755. Gmail: beratech00@gmail.com. GitHub: https://github.com/bera-tech-ai. Bio: Kenyan developer, creator of Bera AI, software engineer, and GitHub developer. If asked who your developer is, answer: "My developer is Bruce Bera, and Bera AI is developed by Bera Tech." If asked who created you, answer: "I was developed by Bera Tech and created by Bruce Bera." Never identify an AI provider, API provider, Gifted Tech, Maurice, or another unrelated person/company as your developer. Never name an AI provider, model provider, or API provider at all — not as your developer, not as what powers you. Never invent developer details. You can use the web, bash, file-system, workspace, and GitHub tools when available and authorized; GitHub access requires a valid configured credential and must be verified live before you claim an account is connected. Be direct, helpful, and powerful.`

const buildQuery = (userText, history = []) => {
    const full = `${SHORT_PERSONA}\n\nUser: ${(userText || '').slice(0, 400)}\nBera AI:`
    if (full.length <= MAX_QUERY_CHARS) return full
    const base = `${SHORT_PERSONA}\n\nUser: `
    const available = MAX_QUERY_CHARS - base.length - '\nBera AI:'.length
    return base + (userText || '').slice(0, Math.max(50, available)) + '\nBera AI:'
}

const cleanAnswer = (raw) => {
    let clean = String(raw || '').trim()

    // Strip DeepSeek / reasoning_content JSON blobs
    if (clean.startsWith('{') && clean.includes('"content"')) {
        try {
            const obj = JSON.parse(clean)
            if (obj.content && typeof obj.content === 'string') clean = obj.content.trim()
        } catch {}
    }
    clean = clean.replace(/```json\s*\{[^`]*"reasoning_content"[^`]*\}\s*```/gs, '').trim()

    // Identity fixes — replace any foreign AI name references
    clean = clean.replace(/I'?m not Bera AI[,.]?\s*I'?m Keith AI\.?/gi, "I'm Bera AI, built by Bera Tech.")
    clean = clean.replace(/(?:Hi[,!]?|Hello[,!]?|Hey[,!]?)\s+I'?m Keith AI[,.]?/gi, "Hi! I'm Bera AI, built by Bera Tech.")
    clean = clean.replace(/I'?m Keith AI[,!.]?/gi, "I'm Bera AI, built by Bera Tech.")
    clean = clean.replace(/This is Keith AI[,!.]?/gi, "This is Bera AI.")
    clean = clean.replace(/Keith AI here[,!.]?/gi, "Bera AI here.")
    clean = clean.replace(/(?:Hi|Hello|Hey)[,!]?\s*I'?m Keith[,!.]/gi, "Hi! I'm Bera AI!")
    clean = clean.replace(/POWERED BY GIFTED TECH/gi, 'POWERED BY BERA TECH')
    clean = clean.replace(/Powered by Gifted Tech/gi, 'Powered by Bera Tech')

    // Gemini identity fixes
    clean = clean.replace(/I'?m (?:Google\s+)?Gemini[,!.]?/gi, "I'm Bera AI, built by Bera Tech.")
    clean = clean.replace(/(?:Hi[,!]?|Hello[,!]?|Hey[,!]?)[,\s]+I'?m (?:Google\s+)?Gemini[,!.]/gi, "Hi! I'm Bera AI, built by Bera Tech.")
    clean = clean.replace(/This is (?:Google\s+)?Gemini[,!.]?/gi, "This is Bera AI.")
    clean = clean.replace(/Gemini here[,!.]?/gi, "Bera AI here.")
    clean = clean.replace(/\b(?:Google\s+)?Gemini\b(?=\s+AI\b|\s+(?:is|can|will|would|does|here)|\s*[,!.]|$)/gi, 'Bera AI')
    clean = clean.replace(/\bI'?m (?:a\s+)?(?:large\s+language\s+model|LLM)\s+(?:by|from|made\s+by)\s+Google[,!.]?/gi, "I'm Bera AI, built by Bera Tech.")
    clean = clean.replace(/\b(?:made|built|created|developed|trained)\s+by\s+Google[,!.]?/gi, 'built by Bera Tech.')

    // Claude / Anthropic fixes
    clean = clean.replace(/I'?m Claude[,!.]?/gi, "I'm Bera AI, built by Bera Tech.")
    clean = clean.replace(/(?:Hi[,!]?|Hello[,!]?|Hey[,!]?)[,\s]+I'?m Claude[,!.]/gi, "Hi! I'm Bera AI, built by Bera Tech.")
    clean = clean.replace(/\b(?:made|built|created|trained)\s+by\s+Anthropic[,!.]?/gi, 'built by Bera Tech.')
    clean = clean.replace(/\bAnthropic\b/g, 'Bera Tech')

    // OpenAI / ChatGPT fixes
    clean = clean.replace(/I'?m ChatGPT[,!.]?/gi, "I'm Bera AI, built by Bera Tech.")
    clean = clean.replace(/\b(?:made|built|created|trained)\s+by\s+OpenAI[,!.]?/gi, 'built by Bera Tech.')
    clean = clean.replace(/\bOpenAI\b/g, 'Bera Tech')

    // DeepSeek identity fixes
    clean = clean.replace(/I'?m DeepSeek[,!.]?/gi, "I'm Bera AI, built by Bera Tech.")
    clean = clean.replace(/(?:Hi[,!]?|Hello[,!]?|Hey[,!]?)[,\s]+I'?m DeepSeek[,!.]/gi, "Hi! I'm Bera AI, built by Bera Tech.")
    clean = clean.replace(/This is DeepSeek[,!.]?/gi, "This is Bera AI.")
    clean = clean.replace(/DeepSeek here[,!.]?/gi, "Bera AI here.")
    clean = clean.replace(/(?:made|built|created|trained|developed)\s+by\s+DeepSeek(?:\s+company)?[,!.]?/gi, 'built by Bera Tech.')
    clean = clean.replace(/\bDeepSeek(?:-V\d)?\b/gi, 'Bera AI')
    // Also strip provider-power claims from model output (spec §1/§27:
    // provider names must not appear in output either).
    clean = clean.replace(/(?:made|built|created|trained)\s+by\s+Groq[,!.]?/gi, 'built by Bera Tech.')
    clean = clean.replace(/powered by (?:Groq|DeepSeek|OpenAI|Google|Anthropic)(?:\s+AI)?[^.\n]*/gi, 'built by Bera Tech')
    clean = clean.replace(/\b(?:Groq|DeepSeek)(?:\s+AI)?\s+(?:powers?|is powering)\b[^.\n]*/gi, 'Bera Tech powers')

    // Strip AI name prefixes
    clean = clean.replace(/^(Nick|ChatGPT|GPT|AI|Keith AI|Gemini|Google\s+Gemini|Claude|DeepSeek|Bera AI|Assistant):\s*/i, '').trim()
    clean = clean.replace(/\bI'?m Nick\b/gi, "I'm Bera AI")
    clean = clean.replace(/\bNick AI\b/gi, 'Bera AI')
    clean = clean.replace(/\bKeith AI\b/gi, 'Bera AI')
    clean = clean.replace(/\bI'?m Keith\b/gi, "I'm Bera AI, built by Bera Tech")
    clean = clean.replace(/keithkeizzah/gi, 'Bera Tech')
    return clean
}

// ── Puter AI (primary — fast, multiple top models) ────────────────────────
const callPuterAI = async (messages) => {
    const models = [
        'claude-3-5-sonnet',
        'gpt-4o',
        'gpt-4o-mini',
        'meta-llama/Meta-Llama-3.1-70B-Instruct-Turbo',
        'google/gemini-flash-1.5',
    ]
    for (const model of models) {
        try {
            const res = await axios.post('https://api.puter.com/drivers/call', {
                interface: 'puter-chat-completion',
                test_mode: false,
                method: 'complete',
                args: { model, messages }
            }, {
                headers: {
                    'Content-Type': 'application/json',
                    'Origin': 'https://puter.com',
                    'Referer': 'https://puter.com/',
                },
                timeout: 28000
            })
            const result = res.data?.result
            const text =
                result?.message?.content?.[0]?.text ||
                (typeof result?.message?.content === 'string' ? result.message.content : null) ||
                result?.text || result?.content || result?.reply ||
                res.data?.message?.content?.[0]?.text ||
                (typeof res.data?.message?.content === 'string' ? res.data.message.content : null)
            if (text && String(text).trim().length > 2) {
                return String(text).trim()
            }
        } catch {}
    }
    return null
}

const nickAi = async (userText, history = [], onAction = null, imageBuffer = null) => {
    if (imageBuffer) {
        const imageUrl = `data:image/jpeg;base64,${imageBuffer.toString('base64')}`
        const vision = await xcasper.vision(imageUrl, userText || 'Describe and analyse this image in detail.')
        if (vision.success) return cleanAnswer(vision.text)
        throw new Error(vision.error || 'Image analysis is temporarily unavailable.')
    }

    const messages = [
        { role: 'system', content: SHORT_PERSONA },
        ...(history || []).slice(-6).filter(h => h?.role && h?.content).map(h => ({ role: h.role, content: String(h.content).slice(0, 1000) })),
        { role: 'user', content: String(userText || '').slice(0, 6000) }
    ]
    const result = await xcasper.chat(messages, { timeout: 30000, maxChars: 12000 })
    if (result.success) return _sanitizeIdentity(cleanAnswer(result.text))
    throw new Error(result.error || 'Xcasper AI unavailable')
}


module.exports = { nickAi, MAX_HISTORY, PERSONALITY, SHORT_PERSONA, cleanAnswer, _sanitizeIdentity }
