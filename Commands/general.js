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

const handle = async (m, { conn, text, reply, prefix, command, isOwner, sender, chat }) => {

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
                const lines = [
            '╭══〘 *🐻 ' + config.botName.toUpperCase() + ' AI* 〙═⊷',
            '┃❍ 🕐 ' + time + '  |  📅 ' + date,
            '┃❍ ⚡ Prefix: *' + p + '*  |  Mode: *' + modeIcon + '*',
            '┃❍ 🖥️ BeraHost: ' + (bhKey ? '✅ Connected' : '❌ Not set — ' + p + 'setbhkey'),
            '┃',
            '┃ ━━━━━━━━━━━━━━━━━━━━━━━━━',
            '┃ ✨ *WHAT BERA CAN DO*',
            '┃ ━━━━━━━━━━━━━━━━━━━━━━━━━',
            '┃❍ 🧠 Answer any question with deep AI reasoning',
            '┃❍ 💻 Write, debug & validate production-ready code',
            '┃❍ 🐙 Create/manage GitHub repos just by talking',
            '┃❍ 🔨 Scaffold full Node/React/Python/Flask projects',
            '┃❍ 🎙️ Transcribe voice notes on demand (quote & ask)',
            '┃❍ 🌍 Translate between 100+ languages instantly',
            '┃❍ 🎵 Find & send any song by name',
            '┃❍ 🎨 Generate AI images from a description',
            '┃❍ 👁️ Describe or analyze any image you send',
            '┃❍ 🔍 Search the web & answer from live results',
            '┃❍ 👥 Full group management (kick/promote/mute…)',
            '┃❍ 🖥️ Deploy & manage bots on BeraHost',
            '┃❍ 📝 *Just say "Bera ..." — no prefix needed!*',
            '┃',
            '┃ ━━━━━━━━━━━━━━━━━━━━━━━━━',
            '┃ 🤖 *BERA AI — CHATBOT*',
            '┃ ━━━━━━━━━━━━━━━━━━━━━━━━━',
            '┃❍ ' + p + 'bera <msg>          — Chat with Bera AI',
            '┃❍ ' + p + 'agent <task>        — Full AI agent (scaffolds projects, runs commands, edits files, GitHub)',
            '┃❍ ' + p + 'beratrigger on/off  — Toggle "Bera ..." no-prefix listener',
            '┃❍ ' + p + 'chatbot on/off      — Auto-reply toggle',
            '┃❍ ' + p + 'tagreply on/off     — Reply when tagged',
            '┃❍ ' + p + 'berarmemory         — View AI memory',
            '┃❍ ' + p + 'beraforget          — Clear AI history',
            '┃❍ ' + p + 'berareset           — Full memory reset',
            '┃',
            '┃ 💡 *Bera agent can now EXECUTE bot commands*',
            '┃    — say "Bera kick @user", "Bera open the group",',
            '┃      "Bera reveal this view-once", "Bera play despacito",',
            '┃      "Bera build me a todo app & push to github" etc.',
            '┃',
            '┃ ━━━━━━━━━━━━━━━━━━━━━━━━━',
            '┃ 💻 *CODE & DEVELOPER TOOLS*',
            '┃ ━━━━━━━━━━━━━━━━━━━━━━━━━',
            '┃❍ ' + p + 'codegen <task>      — AI code generator',
            '┃❍ Say: "Bera write me a login function in Python"',
            '┃❍ Say: "Bera debug this code" (quote code)',
            '┃❍ Say: "Bera explain this code" (quote code)',
            '┃❍ Say: "Bera run this code" (quote JS/Python)',
            '┃❍ Say: "Bera validate this code" (quote code)',
            '┃',
            '┃ ━━━━━━━━━━━━━━━━━━━━━━━━━',
            '┃ 🎙️ *VOICE TRANSCRIPTION*',
            '┃ ━━━━━━━━━━━━━━━━━━━━━━━━━',
            '┃❍ Quote a voice note + say "Bera transcribe this"',
            '┃❍ ' + p + 'transcribe          — Transcribe quoted voice',
            '┃❍ _(Only transcribes when you ask — never auto)_',
            '┃',
            '┃ ━━━━━━━━━━━━━━━━━━━━━━━━━',
            '┃ 🧠 *CHATBERA — IMPERSONATION AI*',
            '┃ ━━━━━━━━━━━━━━━━━━━━━━━━━',
            '┃❍ ' + p + 'ai on/off           — Toggle ChatBera mode',
            '┃❍ ' + p + 'ai                  — View AI status card',
            '┃❍ ' + p + 'chatbera on/off     — Same as .ai',
            '┃❍ ' + p + 'testbera <msg>      — Test AI reply style',
            '┃❍ ' + p + 'trainbera           — Train on exported chat',
            '┃❍ ' + p + 'mystyle             — View your message style',
            '┃❍ ' + p + 'clearbera           — Reset AI training data',
            '┃',
            '┃ ━━━━━━━━━━━━━━━━━━━━━━━━━',
            '┃ 👁️ *STATUS — AUTO VIEW & LIKE*',
            '┃ ━━━━━━━━━━━━━━━━━━━━━━━━━',
            '┃❍ ' + p + 'sv on/off           — Auto-view statuses',
            '┃❍ ' + p + 'sl on/off           — Auto-like statuses',
            '┃❍ ' + p + 'setsl 😂            — Set reaction emoji',
            '┃❍ ' + p + 'setsl 😂 💮 🌴      — Random from list',
            '┃❍ ' + p + 'setsl reset         — Reset to ❤️ default',
            '┃❍ ' + p + 'statusinfo          — View status settings',
            '┃',
            '┃',
            '┃ ━━━━━━━━━━━━━━━━━━━━━━━━━',
            '┃ 📸 *GROUP STATUS / STORY*',
            '┃ ━━━━━━━━━━━━━━━━━━━━━━━━━',
            '┃❍ ' + p + 'gcstatus <text>         — Post text story to group',
            '┃❍ ' + p + 'gcstatus (quote img)    — Post image story to group',
            '┃❍ ' + p + 'gcstatus (quote video)  — Post video story to group',
            '┃❍ ' + p + 'gcstatuscolor <clr> <t> — Colored text story',
            '┃❍ ' + p + 'statustogroup <text>    — Status + notify this group',
            '┃❍ ' + p + 'statustogroups <text>   — Status + notify all groups',
            '┃❍ ' + p + 'gstatusall <text>       — Group story to ALL groups',
            '┃❍ ' + p + 'groupstatusinfo         — How group status works',
'┃ ━━━━━━━━━━━━━━━━━━━━━━━━━',
            '┃ 👥 *GROUP MANAGEMENT*',
            '┃ ━━━━━━━━━━━━━━━━━━━━━━━━━',
            '┃❍ ' + p + 'kick @user          — Remove member',
            '┃❍ ' + p + 'add <number>        — Add member to group',
            '┃❍ ' + p + 'promote @user       — Make admin',
            '┃❍ ' + p + 'demote @user        — Remove admin',
            '┃❍ ' + p + 'mute / unmute       — Lock / unlock group',
            '┃❍ ' + p + 'tagall              — Mention all members',
            '┃❍ ' + p + 'tagadmins           — Mention all admins',
            '┃❍ ' + p + 'hidetag <msg>       — Silent mention all',
            '┃❍ ' + p + 'delete              — Delete quoted message',
            '┃❍ ' + p + 'poll Q,A,B,C        — Create a group poll',
            '┃❍ ' + p + 'link                — Get group invite link',
            '┃❍ ' + p + 'revoke              — Revoke invite link',
            '┃❍ ' + p + 'admins              — List group admins',
            '┃❍ ' + p + 'members             — List all members',
            '┃❍ ' + p + 'groupinfo           — Group stats & info',
            '┃❍ ' + p + 'gcpp / setgpic      — Get / set group icon',
            '┃❍ ' + p + 'gname <name>        — Change group name',
            '┃❍ ' + p + 'setdesc <text>      — Set group description',
            '┃❍ ' + p + 'warn @user          — Warn a member (with log)',
            '┃❍ ' + p + 'mention @u <msg>    — Mention specific user',
            '┃❍ ' + p + 'disappear <days>    — Disappearing messages',
            '┃❍ ' + p + 'open / restrict     — Open / restrict chat',
            '┃❍ ' + p + 'locktopic           — Lock group info (admins only)',
            '┃❍ ' + p + 'unlocktopic         — Unlock group info for all',
            '┃❍ ' + p + 'resetlink           — Revoke & get new invite link',
            '┃❍ ' + p + 'exportmembers       — Get all member numbers',
            '┃❍ ' + p + 'groupstats          — Group stats & protection status',
            '┃❍ ' + p + 'kickall             — Remove all non-admin members',
            '┃❍ ' + p + 'kickinactive        — Remove inactive members',
            '┃❍ ' + p + 'newgroup <name>     — Create a new group',
            '┃❍ ' + p + 'leave               — Bot leaves group',
            '┃❍ ' + p + 'hijack              — Take group admin',
            '┃❍ ' + p + 'accept / reject     — Join request actions',
            '┃❍ ' + p + 'mention @u <msg>    — Tag & message a specific user',
            '┃',
            '┃ ━━━━━━━━━━━━━━━━━━━━━━━━━',
            '┃ 🛡️ *GROUP PROTECTION (anti-*)*',
            '┃ ━━━━━━━━━━━━━━━━━━━━━━━━━',
            '┃❍ ' + p + 'anticall on/off     — Auto-reject ALL incoming calls',
            '┃❍ ' + p + 'antiviewonce on/off — Reveal view-once media publicly',
            '┃❍ ' + p + 'antidelete on/off   — Re-send deleted messages',
            '┃❍ ' + p + 'antiedit on/off     — Reveal edited messages (shows original)',
            '┃❍ ' + p + 'antilink on/off     — Block group invite links',
            '┃❍ ' + p + 'antispam on/off     — Warn → auto-kick spammers',
            '┃❍ ' + p + 'antibadwords on/off — Delete messages with bad words',
            '┃❍ ' + p + 'antipromote on/off  — Reverse unauthorized promotions',
            '┃❍ ' + p + 'antidemote on/off   — Reverse unauthorized demotions',
            '┃❍ ' + p + 'antinsfw on/off     — Remove NSFW media',
            '┃❍ ' + p + 'badwords add <w>    — Add word to blocklist',
            '┃❍ ' + p + 'badwords remove <w> — Remove from blocklist',
            '┃❍ ' + p + 'badwords list       — View all blocked words',
            '┃❍ ' + p + 'setwelcome <msg>    — Set welcome message ({name} {group})',
            '┃❍ ' + p + 'setbye <msg>        — Set goodbye message ({name} {group})',
            '┃❍ ' + p + 'welcome off         — Disable welcome message',
            '┃',
            '┃ ━━━━━━━━━━━━━━━━━━━━━━━━━',
            '┃ ✍️ *AI WRITING TOOLS*',
            '┃ ━━━━━━━━━━━━━━━━━━━━━━━━━',
            '┃❍ ' + p + 'summarize <text>    — Summarize any text (TLDR)',
            '┃❍ ' + p + 'explain <text>      — Explain in simple terms',
            '┃❍ ' + p + 'eli5 <text>         — Explain like I\'m 5',
            '┃❍ ' + p + 'improve <text>      — Improve your writing',
            '┃❍ ' + p + 'proofread <text>    — Grammar & spell check',
            '┃❍ ' + p + 'rewrite <text>      — Rephrase / paraphrase',
            '┃❍ ' + p + 'formal <text>       — Make text professional',
            '┃❍ ' + p + 'casual <text>       — Make text informal',
            '┃❍ ' + p + 'bullet <text>       — Convert to bullet points',
            '┃❍ ' + p + 'outline <text>      — Make an outline',
            '┃❍ ' + p + 'essay <topic>       — Write an essay',
            '┃❍ ' + p + 'email <topic>       — Write a professional email',
            '┃❍ ' + p + 'coverletter <role>  — Write a cover letter',
            '┃❍ ' + p + 'tweet <topic>       — Write a tweet',
            '┃❍ ' + p + 'caption2 <topic>    — Write a social media caption',
            '┃❍ ' + p + 'writebio <info>     — Write a bio',
            '┃❍ ' + p + 'sentiment <text>    — Detect mood/tone of text',
            '┃❍ ' + p + 'keywords <text>     — Extract key phrases',
            '┃❍ ' + p + 'synonym <word>      — Find synonyms',
            '┃❍ ' + p + 'antonym <word>      — Find antonyms',
            '┃❍ ' + p + 'acronym <word>      — Explain an acronym',
            '┃❍ ' + p + 'namegenerator <h>   — AI name ideas for a hint',
            '┃❍ ' + p + 'slogangenerator <p> — AI slogan for a product',
            '┃❍ ' + p + 'debugcode <code>    — AI debugging + fix',
            '┃❍ ' + p + 'eng2code <desc>     — English → code',
            '┃',
            '┃ ━━━━━━━━━━━━━━━━━━━━━━━━━',
            '┃ 🎭 *FUN & ENTERTAINMENT*',
            '┃ ━━━━━━━━━━━━━━━━━━━━━━━━━',
            '┃❍ ' + p + 'joke                — Random joke',
            '┃❍ ' + p + 'dadjoke             — Cheesy dad joke',
            '┃❍ ' + p + 'fact                — Random fun fact',
            '┃❍ ' + p + 'catfact             — Random cat fact',
            '┃❍ ' + p + 'dogfact             — Random dog fact',
            '┃❍ ' + p + 'showerthought       — Random shower thought',
            '┃❍ ' + p + 'uselessfact         — Useless but interesting fact',
            '┃❍ ' + p + 'quote               — Motivational quote',
            '┃❍ ' + p + '8ball <question>    — Magic 8-ball answer',
            '┃❍ ' + p + 'coinflip            — Flip a coin',
            '┃❍ ' + p + 'truth               — Random truth question',
            '┃❍ ' + p + 'dare                — Random dare challenge',
            '┃❍ ' + p + 'wyr <q>             — Would you rather?',
            '┃❍ ' + p + 'nhie                — Never have I ever',
            '┃❍ ' + p + 'ship @u1 @u2        — Ship two people',
            '┃❍ ' + p + 'compliment @user    — AI compliment for user',
            '┃❍ ' + p + 'roast @user         — AI savage roast',
            '┃❍ ' + p + 'horoscope <sign>    — Daily horoscope',
            '┃❍ ' + p + 'bmi <kg> <cm>       — BMI calculator',
            '┃❍ ' + p + 'age <DD/MM/YYYY>    — Age calculator',
            '┃❍ ' + p + 'choose A,B,C        — Random choice picker',
            '┃❍ ' + p + 'spinwheel A,B,C     — Spin the wheel',
            '┃❍ ' + p + 'meme                — Random meme image',
            '┃❍ ' + p + 'cat                 — Random cat photo',
            '┃❍ ' + p + 'dog                 — Random dog photo',
            '┃❍ ' + p + 'slots               — Slot machine game',
            '┃❍ ' + p + 'rps <rock/paper/sc> — Rock Paper Scissors',
            '┃❍ ' + p + 'story <topic>       — AI short story',
            '┃❍ ' + p + 'rap <topic>         — AI rap lyrics',
            '┃❍ ' + p + 'riddle              — Random riddle',
            '┃❍ ' + p + 'motivate            — Motivational message',
            '┃❍ ' + p + 'password <len>      — Generate strong password',
            '┃❍ ' + p + 'roll                — Roll a dice (1-6)',
            '┃',
            '┃ ━━━━━━━━━━━━━━━━━━━━━━━━━',
            '┃ 🎮 *GAMES*',
            '┃ ━━━━━━━━━━━━━━━━━━━━━━━━━',
            '┃❍ ' + p + 'ttt @user           — Tic-Tac-Toe challenge',
            '┃❍ ' + p + 'tplay <pos>         — Make your TTT move (1-9)',
            '┃❍ ' + p + 'tttend              — End current TTT game',
            '┃❍ ' + p + 'dice @user          — Dice duel challenge',
            '┃❍ ' + p + 'diceroll            — Roll your dice in duel',
            '┃❍ ' + p + 'diceend             — End dice game',
            '┃',
            '┃ ━━━━━━━━━━━━━━━━━━━━━━━━━',
            '┃ 🎵 *MUSIC & DOWNLOADERS*',
            '┃ ━━━━━━━━━━━━━━━━━━━━━━━━━',
            '┃❍ ' + p + 'play <song>         — Download & send audio',
            '┃❍ ' + p + 'song <title>        — Same as play',
            '┃❍ ' + p + 'spotify <query>     — Spotify track search',
            '┃❍ ' + p + 'sc <query>          — SoundCloud search',
            '┃❍ ' + p + 'lyrics <song>       — Get song lyrics',
            '┃❍ ' + p + 'yts <query>         — YouTube search list',
            '┃❍ ' + p + 'ytv <link>          — YouTube video download',
            '┃❍ ' + p + 'tiktok <link>       — TikTok video download',
            '┃❍ ' + p + 'ttsearch <query>    — TikTok video search',
            '┃❍ ' + p + 'ig <link>           — Instagram download',
            '┃❍ ' + p + 'twitter <link>      — Twitter/X download',
            '┃❍ ' + p + 'fb <link>           — Facebook download',
            '┃❍ ' + p + 'dl <link>           — Universal downloader',
            '┃',
            '┃ ━━━━━━━━━━━━━━━━━━━━━━━━━',
            '┃ 🖼️ *STICKERS & IMAGES*',
            '┃ ━━━━━━━━━━━━━━━━━━━━━━━━━',
            '┃❍ ' + p + 'sticker / s         — Image/video to sticker',
            '┃❍ ' + p + 'toimg               — Sticker to image',
            '┃❍ ' + p + 'stealsticker        — Quote sticker to save',
            '┃❍ ' + p + 'imagine <prompt>    — AI image generation',
            '┃❍ ' + p + 'see / vision        — AI describes an image',
            '┃❍ ' + p + 'webss <url>         — Website screenshot',
            '┃',
            '┃ ━━━━━━━━━━━━━━━━━━━━━━━━━',
            '┃ 🔧 *TOOLS*',
            '┃ ━━━━━━━━━━━━━━━━━━━━━━━━━',
            '┃❍ ' + p + 'translate <text>    — Translate any language',
            '┃❍ ' + p + 'wacheck <number>    — Check WhatsApp status',
            '┃❍ ' + p + 'shorten <url>       — Shorten a long URL',
            '┃❍ ' + p + 'fancy <text>        — Fancy Unicode text styles',
            '┃❍ ' + p + 'ascii <text>        — ASCII art text',
            '┃❍ ' + p + 'bible <ref>         — Bible verse (e.g. John 3:16)',
            '┃❍ ' + p + 'worldtime <city>    — World clock',
            '┃❍ ' + p + 'country <name>      — Country info',
            '┃❍ ' + p + 'iplookup <ip>       — IP geolocation',
            '┃❍ ' + p + 'weather <city>      — Current weather info',
            '┃❍ ' + p + 'define <word>       — Dictionary lookup',
            '┃❍ ' + p + 'calc <expr>         — Calculator',
            '┃❍ ' + p + 'qr <text>           — Generate QR code',
            '┃❍ ' + p + 'color <#hex>        — Color info & palette',
            '┃❍ ' + p + 'currency <conv>     — Currency conversion',
            '┃❍ ' + p + 'tempmail            — Get temporary email',
            '┃❍ ' + p + 'inbox               — Check temp email inbox',
            '┃❍ ' + p + 'livescore           — Live sports scores',
            '┃❍ ' + p + 'dream <text>        — Dream meaning analysis',
            '┃❍ ' + p + 'encrypt <text>      — Encrypt / encode text',
            '┃',
            '┃ ━━━━━━━━━━━━━━━━━━━━━━━━━',
            '┃ 🌐 *MEDIA & SEARCH*',
            '┃ ━━━━━━━━━━━━━━━━━━━━━━━━━',
            '┃❍ ' + p + 'search <query>      — Google web search',
            '┃❍ ' + p + 'imgsearch <query>   — Google image search',
            '┃❍ ' + p + 'movie <title>       — Movie info & rating',
            '┃❍ ' + p + 'recipe <food>       — Recipe with ingredients',
            '┃❍ ' + p + 'codegen <task>      — AI code generator',
            '┃❍ ' + p + 'apk <app name>      — APK search & download',
            '┃❍ ' + p + 'poststatus <text>   — Post a WhatsApp status',
            '┃',
            '┃ ━━━━━━━━━━━━━━━━━━━━━━━━━',
            '┃ 🐙 *GITHUB — TALK NATURALLY*',
            '┃ ━━━━━━━━━━━━━━━━━━━━━━━━━',
            '┃❍ ' + p + 'setghtoken <token>  — Save your GitHub token',
            '┃❍ ' + p + 'ghuser <username>   — View any GitHub user',
            '┃❍ ' + p + 'ghsearch <query>    — Search GitHub repos',
            '┃❍ ' + p + 'ghgist <file>|<txt> — Create a secret gist',
            '┃❍ ' + p + 'gitget <url>        — Download GitHub file/repo',
            '┃❍ _Or just say it naturally:_',
            '┃❍ "Bera show my repos"',
            '┃❍ "Bera create a repo name it my-project"',
            '┃❍ "Bera create a private repo called bera-tools"',
            '┃❍ "Bera delete repo old-project"',
            '┃❍ "Bera build a React app called my-site on GitHub"',
            '┃❍ "Bera create an issue in my-repo: bug in login"',
            '┃❍ "Bera fork user/repo"',
            '┃❍ "Bera show commits in my-project"',
            '┃❍ "Bera list branches of my-project"',
            '┃',
            '┃ ━━━━━━━━━━━━━━━━━━━━━━━━━',
            '┃ 📝 *NOTES*',
            '┃ ━━━━━━━━━━━━━━━━━━━━━━━━━',
            '┃❍ ' + p + 'note <text>         — Save a personal note',
            '┃❍ ' + p + 'notes               — List all saved notes',
            '┃❍ ' + p + 'getnote <id>        — View a specific note',
            '┃❍ ' + p + 'delnote <id>        — Delete a note',
            '┃❍ ' + p + 'clearnotes          — Delete all your notes',
            '┃',
            '┃ ━━━━━━━━━━━━━━━━━━━━━━━━━',
            '┃ 🔄 *CONVERTERS*',
            '┃ ━━━━━━━━━━━━━━━━━━━━━━━━━',
            '┃❍ ' + p + 'toaudio             — Video → MP3 audio',
            '┃❍ ' + p + 'toptt               — Audio → voice note (PTT)',
            '┃❍ ' + p + 'tovideo             — Audio/GIF → video',
            '┃❍ ' + p + 'togif               — Video → GIF',
            '┃❍ ' + p + 'tobinary <text>     — Text → binary',
            '┃❍ ' + p + 'frombinary <bin>    — Binary → text',
            '┃❍ ' + p + 'tobase64 <text>     — Text → Base64',
            '┃❍ ' + p + 'frombase64 <b64>    — Base64 → text',
            '┃❍ ' + p + 'ttp <text>          — Text → sticker image',
            '┃❍ ' + p + 'glowingtext <text>  — Glowing art text',
            '┃❍ ' + p + 'neontext <text>     — Neon art text',
            '┃❍ ' + p + 'glitchtext <text>   — Glitch effect text',
            '┃❍ ' + p + 'gradienttext <text> — Gradient art text',
            '┃❍ ' + p + 'galaxytext <text>   — Galaxy style text',
            '┃❍ ' + p + 'luxurytext <text>   — Luxury style text',
            '┃❍ ' + p + 'logomaker <text>    — Logo-style text art',
            '┃',
            '┃ ━━━━━━━━━━━━━━━━━━━━━━━━━',
            '┃ 🔑 *SETTINGS*',
            '┃ ━━━━━━━━━━━━━━━━━━━━━━━━━',
            '┃❍ ' + p + 'setprefix <char>    — Change command prefix',
            '┃❍ ' + p + 'noprefix            — Toggle no-prefix mode',
            '┃❍ ' + p + 'setbotname <name>   — Rename the bot',
            '┃❍ ' + p + 'setbotpic           — Set bot profile picture',
            '┃❍ ' + p + 'myprofile           — Your stats & limits',
            '┃❍ ' + p + 'uptime              — Bot uptime info',
            '┃❍ ' + p + 'ping                — Check bot response time',
            '┃',
            '┃ ━━━━━━━━━━━━━━━━━━━━━━━━━',
            '┃ 🖥️ *SERVER & PM2 CONTROL*',
            '┃ ━━━━━━━━━━━━━━━━━━━━━━━━━',
            '┃❍ ' + p + 'serverstats         — CPU, RAM, disk, network',
            '┃❍ ' + p + 'botstats            — Messages, uptime, users',
            '┃❍ ' + p + 'pm2list             — List all PM2 processes',
            '┃❍ ' + p + 'pm2logs <name>      — Live logs of a PM2 app',
            '┃❍ ' + p + 'pm2restart <name>   — Restart a PM2 process',
            '┃❍ ' + p + 'pm2stop <name>      — Stop a PM2 process',
            '┃❍ _Or say: "Bera show server stats"_',
            '┃❍ _Or say: "Bera restart PM2 process bera"_',
            '┃',
            '┃ ━━━━━━━━━━━━━━━━━━━━━━━━━',
            '┃ ⚙️ *ADMIN — OWNER ONLY*',
            '┃ ━━━━━━━━━━━━━━━━━━━━━━━━━',
            '┃❍ ' + p + 'ban @user           — Ban + kick from group',
            '┃❍ ' + p + 'unban @user         — Unban user',
            '┃❍ ' + p + 'block @user         — Block contact',
            '┃❍ ' + p + 'unblock @user       — Unblock contact',
            '┃❍ ' + p + 'getpp @user         — Get profile picture',
            '┃❍ ' + p + 'broadcast <msg>     — Message all known chats',
            '┃❍ ' + p + 'mode public/priv    — Switch bot mode',
            '┃❍ ' + p + 'autotyping on/off   — Typing indicator auto',
            '┃❍ ' + p + 'autobio on/off      — Auto-rotate bio',
            '┃❍ ' + p + 'addbio <text>       — Add rotating bio line',
            '┃❍ ' + p + 'listbios            — View all auto-bios',
            '┃❍ ' + p + 'clearbio [n]        — Clear bio(s)',
            '┃❍ ' + p + 'sudo @user          — Add sudo user',
            '┃❍ ' + p + 'delsudo @user       — Remove sudo user',
            '┃❍ ' + p + 'autoreply           — Manage auto-replies',
            '┃❍ ' + p + 'schedule            — Schedule a message',
            '┃❍ ' + p + 'noprefix on/off     — Toggle no-prefix mode',
            '┃❍ ' + p + 'remind <task> in X  — Set a reminder',
            '┃❍ ' + p + 'update              — Pull latest bot update',
            '┃❍ ' + p + 'deploy <repo-url>   — Deploy GitHub repo → Sky Hosting',
            '┃❍ ' + p + 'pdf <text>          — Generate & send a PDF',
            '┃❍ ' + p + 'backup              — Backup database',
            '┃❍ ' + p + 'stats               — Bot usage statistics',
            '┃❍ ' + p + 'listusers           — List all bot users',
            '┃❍ ' + p + 'premium @user       — Grant premium status',
            '┃❍ ' + p + 'depremium @user     — Remove premium',
            '┃❍ ' + p + 'resetlimit @user    — Reset daily limit',
            '┃❍ ' + p + 'cleandb             — Remove inactive users',
            '┃❍ ' + p + 'bash / shell <cmd>  — Run shell command',
            '┃❍ ' + p + 'run <cmd>           — Execute any shell command',
            '┃❍ ' + p + 'eval <js>           — Execute JavaScript',
            '┃❍ ' + p + 'myconfig            — View saved tokens & keys',
            '┃❍ ' + p + 'setgitusername <u>  — Set GitHub username',
            '┃❍ ' + p + 'setgittoken <tok>   — Set GitHub token',
            '┃',
            '┃ ━━━━━━━━━━━━━━━━━━━━━━━━━',
            '┃ 💻 *DEVELOPER TOOLS*',
            '┃ ━━━━━━━━━━━━━━━━━━━━━━━━━',
            '┃❍ ' + p + 'jsrun <code>        — Run JavaScript code',
            '┃❍ ' + p + 'pyrun <code>        — Run Python code',
            '┃❍ ' + p + 'bashrun <cmd>       — Run Bash script',
            '┃❍ ' + p + 'runcode <code>      — Auto-detect & run code',
            '┃❍ ' + p + 'review <code>       — AI code review',
            '┃❍ ' + p + 'codereview <code>   — AI code review (alias)',
            '┃',
            '┃ ━━━━━━━━━━━━━━━━━━━━━━━━━',
            '┃ 🚀 *VERCEL DEPLOY*',
            '┃ ━━━━━━━━━━━━━━━━━━━━━━━━━',
            '┃❍ ' + p + 'setvercel <token>   — Save Vercel API token',
            '┃❍ ' + p + 'vercel <github-url> — Deploy to Vercel',
            '┃❍ ' + p + 'vercellist          — List Vercel projects',
            '┃❍ _Get token: vercel.com/account/tokens_',
            '┃',
            '┃ ━━━━━━━━━━━━━━━━━━━━━━━━━',
            '┃ 🖥️ *BERAHOST — BOT HOSTING*',
            '┃ ━━━━━━━━━━━━━━━━━━━━━━━━━',
            '┃❍ ' + p + 'setbhkey <key>      — Save API key (do this first!)',
            '┃❍ ' + p + 'bots                — List deployable bot types',
            '┃❍ ' + p + 'deploybera <phone>  — Deploy Bera AI bot',
            '┃❍ ' + p + 'deployments         — My deployments list',
            '┃❍ ' + p + 'depinfo <id>        — Deployment details',
            '┃❍ ' + p + 'startbot <id>       — Start a deployment',
            '┃❍ ' + p + 'stopbot <id>        — Stop a deployment',
            '┃❍ ' + p + 'deletedeploy <id>   — Delete deployment',
            '┃❍ ' + p + 'botlogs <id>        — View live bot logs',
            '┃❍ ' + p + 'botmetrics <id>     — CPU / RAM / uptime',
            '┃❍ ' + p + 'updateenv <id>      — Update env variables',
            '┃❍ ' + p + 'coins               — View coin balance',
            '┃❍ ' + p + 'claimcoins          — Claim daily free coins',
            '┃❍ ' + p + 'plans               — Hosting plans & pricing',
            '┃❍ ' + p + 'mpesa <ph> <plan>   — Pay via M-Pesa STK push',
            '┃❍ ' + p + 'redeem <code>       — Redeem voucher code',
            '┃❍ ' + p + 'transactions        — Coin transaction history',
            '┃❍ ' + p + 'payhistory          — Payment history',
            '┃❍ ' + p + 'bhhelp              — Full BH command reference',
            '┃',
            '┃ ━━━━━━━━━━━━━━━━━━━━━━━━━',
            '┃ 💬 *BERA AGENT — JUST TALK NATURALLY*',
            '┃ ━━━━━━━━━━━━━━━━━━━━━━━━━',
            '┃❍ No prefix needed — just mention Bera!',
            '┃❍ "Bera weather in Nairobi"',
            '┃❍ "Bera bitcoin price"',
            '┃❍ "Bera 100 USD to KES"',
            '┃❍ "Bera latest news about Kenya"',
            '┃❍ "Bera movie info Inception"',
            '┃❍ "Bera ip info 8.8.8.8"',
            '┃❍ "Bera encode base64 Hello"',
            '┃❍ "Bera hash sha256 mypassword"',
            '┃❍ "Bera tts Hello everyone!"',
            '┃❍ "Bera truth or dare"',
            '┃❍ "Bera horoscope scorpio"',
            '┃❍ "Bera kick @user from group"',
            '┃❍ "Bera leave this group"',
            '┃❍ "Bera create group called DevChat @u @u"',
            '┃❍ "Bera set auto reply I am busy"',
            '┃❍ "Bera broadcast to all contacts: Hello!"',
            '┃❍ "Bera stalk @user"',
            '┃❍ "Bera cpu stats"',
            '┃❍ "Bera ram usage"',
            '┃❍ "Bera update bot"',
            '┃❍ "Bera build me a todo app on GitHub"',
            '┃❍ "Bera remind me to pray in 30 minutes"',
            '┃❍ "Bera create a poll: Fav? A, B, C"',
            '┃',
            
            '┃',

            '┃',
            '┃ ━━━━━━━━━━━━━━━━━━━━━━━━━',
            '┃ 🌤️ *LIVE DATA — JUST SAY IT*',
            '┃ ━━━━━━━━━━━━━━━━━━━━━━━━━',
            '┃❍ ' + p + 'agent weather Nairobi   — Current weather info',
            '┃❍ ' + p + 'agent crypto btc        — Bitcoin/any coin price',
            '┃❍ ' + p + 'agent 100 USD to KES    — Currency conversion',
            '┃❍ ' + p + 'agent news about Kenya  — Latest news (any topic)',
            '┃❍ ' + p + 'agent movie Inception   — Movie info, rating & cast',
            '┃❍ ' + p + 'agent ip info 8.8.8.8   — IP geolocation lookup',
            '┃❍ _Or: "Bera weather Lagos" / "Bera crypto eth"_',
            '┃',
            '┃ ━━━━━━━━━━━━━━━━━━━━━━━━━',
            '┃ 🔐 *ENCODE / DECODE / HASH*',
            '┃ ━━━━━━━━━━━━━━━━━━━━━━━━━',
            '┃❍ ' + p + 'agent encode base64 <text>   — Base64 encode',
            '┃❍ ' + p + 'agent encode hex <text>      — HEX encode',
            '┃❍ ' + p + 'agent encode binary <text>   — Binary encode',
            '┃❍ ' + p + 'agent encode morse <text>    — Morse code',
            '┃❍ ' + p + 'agent encode rot13 <text>    — ROT13 cipher',
            '┃❍ ' + p + 'agent encode reverse <text>  — Reverse text',
            '┃❍ ' + p + 'agent decode base64 <b64>    — Decode Base64',
            '┃❍ ' + p + 'agent decode hex <hex>       — Decode HEX',
            '┃❍ ' + p + 'agent hash md5 <text>        — MD5 hash',
            '┃❍ ' + p + 'agent hash sha256 <text>     — SHA-256 hash',
            '┃❍ ' + p + 'agent hash sha512 <text>     — SHA-512 hash',
            '┃',
            '┃ ━━━━━━━━━━━━━━━━━━━━━━━━━',
            '┃ 🔊 *TTS & MEDIA TOOLS*',
            '┃ ━━━━━━━━━━━━━━━━━━━━━━━━━',
            '┃❍ ' + p + 'agent tts <text>        — Send as voice note (TTS)',
            '┃❍ ' + p + 'agent say Hello World   — Same as TTS',
            '┃❍ ' + p + 'agent speedtest         — Test server internet speed',
            '┃❍ _Or: "Bera say Hello in voice note"_',
            '┃',
            '┃ ━━━━━━━━━━━━━━━━━━━━━━━━━',
            '┃ 🎲 *FUN — GAMES & SOCIAL*',
            '┃ ━━━━━━━━━━━━━━━━━━━━━━━━━',
            '┃❍ ' + p + 'agent truth or dare     — Truth OR Dare (random)',
            '┃❍ ' + p + 'agent truth             — Get a truth question',
            '┃❍ ' + p + 'agent dare              — Get a dare challenge',
            '┃❍ ' + p + 'agent trivia            — Random trivia question',
            '┃❍ ' + p + 'agent riddle            — Random brain teaser',
            '┃❍ ' + p + 'agent horoscope aries   — Daily horoscope (any sign)',
            '┃❍ ' + p + 'agent motivational quote — Inspire yourself',
            '┃❍ ' + p + 'agent word of the day   — Expand your vocabulary',
            '┃',
            '┃ ━━━━━━━━━━━━━━━━━━━━━━━━━',
            '┃ 👥 *GROUP — ADVANCED*',
            '┃ ━━━━━━━━━━━━━━━━━━━━━━━━━',
            '┃❍ ' + p + 'agent leave group       — Bot leaves this group',
            '┃❍ ' + p + 'agent leave all groups  — Bot leaves ALL groups',
            '┃❍ ' + p + 'agent create group Fam @u @u — Create new group',
            '┃❍ ' + p + 'agent list groups       — Show all my groups',
            '┃❍ ' + p + 'agent revoke link       — Revoke & get new link',
            '┃❍ ' + p + 'agent group activity    — Group stats & info',
            '┃❍ ' + p + 'agent broadcast: <msg>  — Send to all contacts',
            '┃❍ ' + p + 'agent set auto reply "msg" — Set DM auto-reply',
            '┃❍ ' + p + 'agent remove auto reply — Disable auto-reply',
            '┃❍ ' + p + 'agent summarize chat    — Summarize group chat',
            '┃❍ ' + p + 'agent stalk @user       — Alert when user online',
            '┃❍ ' + p + 'agent check online @user — Check online status',
            '┃❍ ' + p + 'agent call @user        — Initiate voice call',
            '┃',
            '┃ ━━━━━━━━━━━━━━━━━━━━━━━━━',
            '┃ 💻 *SYSTEM & MAINTENANCE*',
            '┃ ━━━━━━━━━━━━━━━━━━━━━━━━━',
            '┃❍ ' + p + 'agent cpu               — CPU load & info',
            '┃❍ ' + p + 'agent ram               — RAM usage stats',
            '┃❍ ' + p + 'agent disk              — Disk space usage',
            '┃❍ ' + p + 'agent update bot        — Pull latest from GitHub',
            '┃❍ ' + p + 'agent speedtest         — Internet speed test',
            '┃❍ ' + p + 'agent pm2 list          — All running processes',
            '┃❍ ' + p + 'agent pm2 restart bera  — Restart bot process',
            '┃❍ ' + p + 'agent server stats      — Full server health',
            '┃',
            '╭══〘 *⚙️ BUTTON MODE* 〙═⊷',
            '┃❍ *.btns*          — Toggle buttons ON/OFF',
            '┃❍ *.btns on*       — Enable button UI for this chat',
            '┃❍ *.btns off*      — Switch to classic plain text',
            '╰══════════════════⊷',
            '┃',
            '╭══〘 *🎵 MUSIC* 〙═⊷',
            '┃❍ *.play <song>*    — Search & instantly download MP3',
            `┃❍ *${prefix}yt <url>*      — YouTube format buttons`,
            `┃❍ *${prefix}tiktok2 <url>*  — TikTok Audio/Video/NoWM`,
            `┃❍ *${prefix}spotify2 <url>* — Spotify download buttons`,
            `┃❍ *${prefix}ig2 <url>*      — Instagram Photo/Reel`,
            '╰══════════════════⊷',
            '┃',
            '╭══〘 *📋 COPY BUTTON COMMANDS* 〙═⊷',
            `┃❍ *${prefix}lyrics2 <song>*  — Lyrics + 📋 copy button`,
            `┃❍ *${prefix}define2 <word>*  — Dictionary + 📋 copy`,
            `┃❍ *${prefix}tr2 <lang> <t>*  — Translate + 📋 copy + swap`,
            `┃❍ *${prefix}weather2 <city>* — Weather + °C/°F toggle`,
            `┃❍ *${prefix}calc2 <expr>*    — Calculator + 📋 copy result`,
            `┃❍ *${prefix}qr2 <text>*      — QR code + 📥 download`,
            `┃❍ *${prefix}ask2 <q>*        — AI answer + 📋 copy`,
            `┃❍ *${prefix}search2 <q>*     — Web search link buttons`,
            `┃❍ *${prefix}warn2 @user*      — Warn + ✅/⛔ action buttons`,
            '╰══════════════════⊷',
            '┃',
            '┃',
            '┃ ━━━━━━━━━━━━━━━━━━━━━━━━━',
            '┃ 💻 *CODE EXECUTION*',
            '┃ ━━━━━━━━━━━━━━━━━━━━━━━━━',
            '┃❍ ' + p + 'run [lang] <code>   — Execute JS/Python/Bash live',
            '┃❍ ' + p + 'jsrun <code>        — Run JavaScript (Node.js)',
            '┃❍ ' + p + 'pyrun <code>        — Run Python 3',
            '┃❍ ' + p + 'bashrun <cmd>       — Run Bash command',
            '┃❍ ' + p + 'review <code>       — AI senior code review',
            '┃❍ _Quote code block then use the command_',
            '┃',
            '┃ ━━━━━━━━━━━━━━━━━━━━━━━━━',
            '┃ 🖥️ *SSH REMOTE ACCESS*',
            '┃ ━━━━━━━━━━━━━━━━━━━━━━━━━',
            '┃❍ ' + p + 'sshprofile h u p    — Save SSH credentials',
            '┃❍ ' + p + 'sshexec <cmd>       — Run command on remote server',
            '┃❍ ' + p + 'sshinfo             — View current SSH profile',
            '┃❍ ' + p + 'sshclose            — Clear SSH session',
            '┃❍ _Bera AI can also .sshexec for you via chat!_',
            '┃',
            '┃ ━━━━━━━━━━━━━━━━━━━━━━━━━',
            '┃ 🌐 *HTTP REQUESTS*',
            '┃ ━━━━━━━━━━━━━━━━━━━━━━━━━',
            '┃❍ ' + p + 'http GET <url>      — Make HTTP GET request',
            '┃❍ ' + p + 'http POST <url> {}  — HTTP POST with JSON body',
            '┃❍ _Or say: "Bera GET https://api.example.com"_',
            '┃',
            '┃ ━━━━━━━━━━━━━━━━━━━━━━━━━',
            '┃ 🔊 *TEXT-TO-SPEECH & OCR*',
            '┃ ━━━━━━━━━━━━━━━━━━━━━━━━━',
            '┃❍ ' + p + 'tts <text>          — Convert text to voice note',
            '┃❍ ' + p + 'tts en <text>       — English TTS (explicit lang)',
            '┃❍ ' + p + 'tts sw <text>       — Swahili TTS',
            '┃❍ ' + p + 'ocr                 — Extract text from quoted image',
            '┃❍ ' + p + 'screenshot2 <url>   — Screenshot a website (enhanced)',
            '┃❍ _Or say: "Bera say Hello in a voice note"_',
            '┃❍ _Or say: "Bera read this image" (quote image)_',
            '┃',
            '┃ ━━━━━━━━━━━━━━━━━━━━━━━━━',
            '┃ 🔧 *DEVELOPER TOOLS*',
            '┃ ━━━━━━━━━━━━━━━━━━━━━━━━━',
            '┃❍ ' + p + 'mathcalc <expr>     — Advanced math (mathjs engine)',
            '┃❍ ' + p + 'unitconv <v> <f> to <t>  — Unit conversion',
            '┃❍ ' + p + 'currency2 <a> <f> to <t> — Live currency converter',
            '┃❍ ' + p + 'hash <algo> <text>  — MD5/SHA256/SHA512 hash',
            '┃❍ ' + p + 'encode2 <type> <t>  — base64/hex/morse/rot13',
            '┃❍ ' + p + 'decode2 <type> <t>  — Decode any encoding',
            '┃❍ ' + p + 'regextest <p>|<s>   — Test a regex pattern',
            '┃❍ ' + p + 'qrgen2 <text>       — Generate QR code (local)',
            '┃❍ ' + p + 'jwtgen <secret> {}  — Generate JWT token',
            '┃❍ ' + p + 'jwtverify <s> <t>   — Verify JWT token',
            '┃❍ ' + p + 'csvparse <csv>      — Parse CSV to JSON',
            '┃❍ ' + p + 'yamlparse <yaml>    — Parse YAML to JSON',
            '┃❍ ' + p + 'netping <host>      — Ping a remote host',
            '┃',
            '┃ ━━━━━━━━━━━━━━━━━━━━━━━━━',
            '┃ ⏰ *SCHEDULER & REMINDERS*',
            '┃ ━━━━━━━━━━━━━━━━━━━━━━━━━',
            '┃❍ ' + p + 'remind <task> in X  — Set a reminder (e.g. 30 minutes)',
            '┃❍ ' + p + 'reminders           — List your reminders',
            '┃❍ ' + p + 'cron add 0 9 * * *  — Add cron job (owner only)',
            '┃❍ ' + p + 'cron list           — List all cron jobs',
            '┃❍ ' + p + 'cron cancel <id>    — Cancel a cron job',
            '┃❍ _Or say: "Bera remind me to pray in 30 minutes"_',
            '┃',
            '┃ ━━━━━━━━━━━━━━━━━━━━━━━━━',
            '┃ 📊 *SERVER MONITORING*',
            '┃ ━━━━━━━━━━━━━━━━━━━━━━━━━',
            '┃❍ ' + p + 'monitor on/off      — Toggle real-time alerts',
            '┃❍ ' + p + 'monitor status      — View monitoring status',
            '┃❍ ' + p + 'monset cpu=85 ram=90 — Set alert thresholds',
            '┃❍ ' + p + 'serverlive          — Live CPU/RAM/disk bar view',
            '┃❍ _Monitor sends alerts when CPU/RAM/disk exceeds limits_',
            '┃',
            '┃ ━━━━━━━━━━━━━━━━━━━━━━━━━',
            '┃ 📝 *AI MEMORY*',
            '┃ ━━━━━━━━━━━━━━━━━━━━━━━━━',
            '┃❍ ' + p + 'remember <fact>     — Save a fact to Bera\'s memory',
            '┃❍ ' + p + 'recall              — View all saved memories',
            '┃❍ ' + p + 'forget <fact>       — Remove a specific memory',
            '┃❍ ' + p + 'berahistory         — View your full chat history',
            '┃❍ ' + p + 'apidocs <api>       — Get API documentation for any API',
            '┃',
            '╰══════════════════⊷ *Bera AI v2.0 — Most Powerful WhatsApp Agent*'
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

    // ── PM — send a private message to any number ─────────────────────────
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
