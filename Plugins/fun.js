const axios = require('axios')
const crypto = require('crypto')
const { v4: uuidv4 } = require('uuid').default ? require('uuid') : { v4: () => crypto.randomUUID() }

const JOKES = [
    "Why don't scientists trust atoms? Because they make up everything!",
    "I told my wife she was drawing her eyebrows too high. She looked surprised.",
    "Why can't you give Elsa a balloon? Because she'll let it go.",
    "I'm reading a book about anti-gravity — it's impossible to put down.",
    "Did you hear about the mathematician who's afraid of negative numbers? He'll stop at nothing to avoid them.",
    "Why did the scarecrow win an award? Because he was outstanding in his field.",
    "I only know 25 letters of the alphabet. I don't know y.",
    "Why don't eggs tell jokes? They'd crack each other up.",
    "What do you call fake spaghetti? An impasta.",
    "Why did the bicycle fall over? It was two-tired.",
    "I used to hate facial hair, but then it grew on me.",
    "What's the best thing about Switzerland? The flag is a big plus.",
    "Why can't a nose be 12 inches long? Because then it would be a foot.",
    "What do you call cheese that isn't yours? Nacho cheese.",
    "I told my doctor I broke my arm in two places. He told me to stop going to those places.",
]

const FACTS = [
    "Honey never spoils. Archaeologists have found 3,000-year-old honey in Egyptian tombs that was still edible.",
    "A group of flamingos is called a 'flamboyance'.",
    "Octopuses have three hearts, blue blood, and nine brains.",
    "The Eiffel Tower can grow up to 15 cm taller in summer due to thermal expansion.",
    "Bananas are berries, but strawberries are not.",
    "A day on Venus is longer than a year on Venus.",
    "The shortest war in history lasted only 38–45 minutes (Anglo-Zanzibar War, 1896).",
    "Cleopatra lived closer in time to the Moon landing than to the construction of the Great Pyramid.",
    "Nintendo was founded in 1889 — originally as a playing card company.",
    "Sharks are older than trees. Sharks have been around for ~450 million years; trees for ~350 million.",
    "The human brain can store roughly 2.5 petabytes of information.",
    "A single strand of spaghetti is called a 'spaghetto'.",
    "Wombat poop is cube-shaped — the only mammal with cubic feces.",
    "There are more stars in the universe than grains of sand on all of Earth's beaches.",
    "Crows can recognise human faces and hold grudges.",
]

const QUOTES = [
    { q: "The only way to do great work is to love what you do.", a: "Steve Jobs" },
    { q: "In the middle of every difficulty lies opportunity.", a: "Albert Einstein" },
    { q: "It does not matter how slowly you go as long as you do not stop.", a: "Confucius" },
    { q: "Life is what happens when you're busy making other plans.", a: "John Lennon" },
    { q: "The future belongs to those who believe in the beauty of their dreams.", a: "Eleanor Roosevelt" },
    { q: "Success is not final, failure is not fatal: it is the courage to continue that counts.", a: "Winston Churchill" },
    { q: "The best time to plant a tree was 20 years ago. The second best time is now.", a: "Chinese Proverb" },
    { q: "An unexamined life is not worth living.", a: "Socrates" },
    { q: "Spread love everywhere you go.", a: "Mother Teresa" },
    { q: "When you reach the end of your rope, tie a knot in it and hang on.", a: "Franklin D. Roosevelt" },
    { q: "Don't count the days, make the days count.", a: "Muhammad Ali" },
    { q: "You miss 100% of the shots you don't take.", a: "Wayne Gretzky" },
]

const BALL8 = [
    "It is certain.", "It is decidedly so.", "Without a doubt.", "Yes, definitely.",
    "You may rely on it.", "As I see it, yes.", "Most likely.", "Outlook good.",
    "Yes.", "Signs point to yes.", "Reply hazy, try again.", "Ask again later.",
    "Better not tell you now.", "Cannot predict now.", "Concentrate and ask again.",
    "Don't count on it.", "My reply is no.", "My sources say no.",
    "Outlook not so good.", "Very doubtful."
]

const TRUTHS = [
    "What's the most embarrassing thing you've ever done?",
    "Who was your first crush?",
    "What's a secret you've never told anyone?",
    "What's the biggest lie you've ever told?",
    "What's the most childish thing you still do?",
    "Have you ever cheated on a test?",
    "What's your biggest fear?",
    "What's the weirdest dream you've ever had?",
    "What's the worst gift you've ever received?",
    "Have you ever blamed someone else for something you did?",
]

const DARES = [
    "Send a voice note saying 'I love you' to the last person you texted.",
    "Change your profile picture to a funny face for 1 hour.",
    "Post a status saying 'I eat sand for breakfast'.",
    "Text someone 'I know what you did last summer'.",
    "Do 20 push-ups right now.",
    "Set your name in this group to 'Potato' for 30 minutes.",
    "Send a singing voice note to this group.",
    "Text your mum or dad a random emoji and don't explain it.",
    "Do your best robot dance and send a video.",
    "Write the name of your crush in this chat.",
]

const rand = arr => arr[Math.floor(Math.random() * arr.length)]

const handle = async (m, { conn, text, reply, prefix, command, sender, isOwner }) => {

    // ── .joke ────────────────────────────────────────────────────────────────
    if (command === 'joke') {
        let joke = rand(JOKES)
        try {
            const r = await axios.get('https://official-joke-api.appspot.com/random_joke', { timeout: 5000 })
            if (r.data?.setup) joke = r.data.setup + '\n\n' + r.data.punchline
        } catch {}
        return reply(`╭══〘 *😂 JOKE* 〙═⊷\n┃\n┃ ${joke}\n┃\n╰══════════════════⊷`)
    }

    // ── .fact ────────────────────────────────────────────────────────────────
    if (command === 'fact') {
        let fact = rand(FACTS)
        try {
            const r = await axios.get('https://uselessfacts.jsph.pl/api/v2/facts/random?language=en', { timeout: 5000 })
            if (r.data?.text) fact = r.data.text
        } catch {}
        return reply(`╭══〘 *💡 RANDOM FACT* 〙═⊷\n┃\n┃ ${fact}\n┃\n╰══════════════════⊷`)
    }

    // ── .quote ───────────────────────────────────────────────────────────────
    if (command === 'quote') {
        let q = rand(QUOTES)
        try {
            const r = await axios.get('https://api.quotable.io/random', { timeout: 5000 })
            if (r.data?.content) q = { q: r.data.content, a: r.data.author }
        } catch {}
        return reply(`╭══〘 *💬 QUOTE* 〙═⊷\n┃\n┃ _"${q.q}"_\n┃\n┃ — *${q.a}*\n╰══════════════════⊷`)
    }

    // ── .8ball ───────────────────────────────────────────────────────────────
    if (command === '8ball') {
        if (!text) return reply(`Usage: ${prefix}8ball <question>`)
        return reply(`╭══〘 *🎱 MAGIC 8 BALL* 〙═⊷\n┃❍ Q: ${text}\n┃❍ A: *${rand(BALL8)}*\n╰══════════════════⊷`)
    }

    // ── .coinflip ────────────────────────────────────────────────────────────
    if (command === 'coinflip' || command === 'flip') {
        const result = Math.random() < 0.5 ? '🪙 HEADS' : '🔵 TAILS'
        return reply(`╭══〘 *🪙 COIN FLIP* 〙═⊷\n┃❍ Result: *${result}*\n╰══════════════════⊷`)
    }

    // ── .truth ───────────────────────────────────────────────────────────────
    if (command === 'truth') {
        return reply(`╭══〘 *🟢 TRUTH* 〙═⊷\n┃\n┃ ${rand(TRUTHS)}\n┃\n╰══════════════════⊷`)
    }

    // ── .dare ────────────────────────────────────────────────────────────────
    if (command === 'dare') {
        return reply(`╭══〘 *🔴 DARE* 〙═⊷\n┃\n┃ ${rand(DARES)}\n┃\n╰══════════════════⊷`)
    }

    // ── .ship ────────────────────────────────────────────────────────────────
    if (command === 'ship') {
        const mentioned = m.msg?.contextInfo?.mentionedJid?.[0] || ''
        const name1 = m.pushName || sender.split('@')[0]
        const name2 = mentioned ? mentioned.split('@')[0] : (text || 'Mystery Person')
        const seed = (name1 + name2).split('').reduce((a, c) => a + c.charCodeAt(0), 0)
        const pct = seed % 101
        const bar = '█'.repeat(Math.floor(pct / 10)) + '░'.repeat(10 - Math.floor(pct / 10))
        const verdict = pct >= 80 ? '💞 Perfect Match!' : pct >= 60 ? '💕 Great Couple!' : pct >= 40 ? '😊 Good Vibes' : pct >= 20 ? '🤔 Needs Work' : '😬 Unlikely'
        return reply(`╭══〘 *💘 SHIP METER* 〙═⊷\n┃❍ ${name1} + ${name2}\n┃❍ [${bar}] ${pct}%\n┃❍ ${verdict}\n╰══════════════════⊷`)
    }

    // ── .password ────────────────────────────────────────────────────────────
    if (command === 'password') {
        const len = Math.min(Math.max(parseInt(text) || 16, 8), 64)
        const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#$%^&*'
        let pwd = ''
        for (let i = 0; i < len; i++) pwd += chars[Math.floor(Math.random() * chars.length)]
        return reply(`╭══〘 *🔑 PASSWORD GENERATOR* 〙═⊷\n┃❍ Length: ${len} chars\n┃\n┃ \`${pwd}\`\n┃\n┃ ⚠️ Save this somewhere safe!\n╰══════════════════⊷`)
    }

    // ── .uuid ────────────────────────────────────────────────────────────────
    if (command === 'uuid') {
        const id = crypto.randomUUID ? crypto.randomUUID() : [8,4,4,4,12].map(n => crypto.randomBytes(Math.ceil(n/2)).toString('hex').slice(0,n)).join('-')
        return reply(`╭══〘 *🆔 UUID* 〙═⊷\n┃\n┃ \`${id}\`\n┃\n╰══════════════════⊷`)
    }

    // ── .color ───────────────────────────────────────────────────────────────
    if (command === 'color' || command === 'colour') {
        if (!text) return reply(`Usage: ${prefix}color <hex>  e.g. ${prefix}color #FF5733`)
        const hex = text.replace('#', '').trim().slice(0, 6).padEnd(6, '0')
        const r = parseInt(hex.slice(0,2),16), g = parseInt(hex.slice(2,4),16), b = parseInt(hex.slice(4,6),16)
        const luminance = (0.299*r + 0.587*g + 0.114*b) / 255
        const shade = luminance > 0.5 ? 'Light' : 'Dark'
        return reply(
            `╭══〘 *🎨 COLOUR INFO* 〙═⊷\n` +
            `┃❍ HEX: #${hex.toUpperCase()}\n` +
            `┃❍ RGB: rgb(${r}, ${g}, ${b})\n` +
            `┃❍ Shade: ${shade}\n` +
            `┃❍ Preview: https://singlecolorimage.com/get/${hex}/100x100\n` +
            `╰══════════════════⊷`
        )
    }

    // ── .currency ────────────────────────────────────────────────────────────
    if (command === 'currency') {
        if (!text) return reply(`Usage: ${prefix}currency <amount> <FROM> <TO>\nExample: ${prefix}currency 100 USD KES`)
        const parts = text.trim().split(/\s+/)
        if (parts.length < 3) return reply(`Usage: ${prefix}currency 100 USD KES`)
        const [amount, from, to] = parts
        try {
            const r = await axios.get(`https://open.er-api.com/v6/latest/${from.toUpperCase()}`, { timeout: 8000 })
            if (r.data?.result !== 'success') return reply('❌ Could not fetch exchange rates.')
            const rate = r.data.rates[to.toUpperCase()]
            if (!rate) return reply(`❌ Unknown currency: ${to.toUpperCase()}`)
            const result = (parseFloat(amount) * rate).toFixed(2)
            return reply(
                `╭══〘 *💱 CURRENCY* 〙═⊷\n` +
                `┃❍ ${amount} ${from.toUpperCase()} = *${result} ${to.toUpperCase()}*\n` +
                `┃❍ Rate: 1 ${from.toUpperCase()} = ${rate.toFixed(4)} ${to.toUpperCase()}\n` +
                `╰══════════════════⊷`
            )
        } catch (e) {
            return reply('❌ Currency conversion failed. Try again.')
        }
    }

    // ── .worldtime ───────────────────────────────────────────────────────────
    if (command === 'worldtime' || command === 'wtime') {
        if (!text) return reply(`Usage: ${prefix}worldtime <city>\nExample: ${prefix}worldtime Nairobi`)
        try {
            const r = await axios.get(`https://worldtimeapi.org/api/timezone`, { timeout: 6000 })
            const tzList = r.data
            const city = text.trim()
            const match = tzList.find(tz => tz.toLowerCase().includes(city.toLowerCase()))
            if (!match) return reply(`❌ Could not find timezone for "${city}".\nTip: Try continent/city like Africa/Nairobi`)
            const timeR = await axios.get(`https://worldtimeapi.org/api/timezone/${match}`, { timeout: 6000 })
            const d = timeR.data
            const dt = new Date(d.datetime)
            const timeStr = dt.toLocaleString('en-GB', { weekday:'long', year:'numeric', month:'long', day:'numeric', hour:'2-digit', minute:'2-digit', second:'2-digit', timeZoneName:'short' })
            return reply(
                `╭══〘 *🕐 WORLD TIME* 〙═⊷\n` +
                `┃❍ Location: ${match}\n` +
                `┃❍ ${timeStr}\n` +
                `┃❍ UTC Offset: ${d.utc_offset}\n` +
                `╰══════════════════⊷`
            )
        } catch {
            return reply('❌ Could not get time. Try: Africa/Nairobi, Europe/London, America/New_York')
        }
    }

    // ── .country ─────────────────────────────────────────────────────────────
    if (command === 'country') {
        if (!text) return reply(`Usage: ${prefix}country <name>\nExample: ${prefix}country Kenya`)
        try {
            const r = await axios.get(`https://restcountries.com/v3.1/name/${encodeURIComponent(text)}`, { timeout: 8000 })
            const c = r.data[0]
            const capital = c.capital?.[0] || 'N/A'
            const pop = c.population?.toLocaleString() || 'N/A'
            const currency = Object.values(c.currencies || {})[0]
            const currStr = currency ? `${currency.name} (${currency.symbol})` : 'N/A'
            const languages = Object.values(c.languages || {}).join(', ') || 'N/A'
            const region = c.region + (c.subregion ? ` — ${c.subregion}` : '')
            return reply(
                `╭══〘 *🌍 COUNTRY INFO* 〙═⊷\n` +
                `┃❍ Name: ${c.name.common}\n` +
                `┃❍ Official: ${c.name.official}\n` +
                `┃❍ Capital: ${capital}\n` +
                `┃❍ Region: ${region}\n` +
                `┃❍ Population: ${pop}\n` +
                `┃❍ Currency: ${currStr}\n` +
                `┃❍ Languages: ${languages}\n` +
                `┃❍ Flag: ${c.flag || '🏳️'}\n` +
                `╰══════════════════⊷`
            )
        } catch {
            return reply(`❌ Country not found: "${text}"`)
        }
    }

    // ── .iplookup ────────────────────────────────────────────────────────────
    if (command === 'iplookup' || command === 'ip') {
        const ip = text?.trim() || ''
        if (!ip || !/^[\d.:\w]+$/.test(ip)) return reply(`Usage: ${prefix}iplookup <ip address>`)
        try {
            const r = await axios.get(`https://ipapi.co/${ip}/json/`, { timeout: 8000 })
            const d = r.data
            if (d.error) return reply(`❌ ${d.reason || 'IP not found'}`)
            return reply(
                `╭══〘 *🌐 IP LOOKUP* 〙═⊷\n` +
                `┃❍ IP: ${d.ip}\n` +
                `┃❍ City: ${d.city || 'N/A'}\n` +
                `┃❍ Region: ${d.region || 'N/A'}\n` +
                `┃❍ Country: ${d.country_name || 'N/A'} ${d.country_flag_emoji || ''}\n` +
                `┃❍ ISP: ${d.org || 'N/A'}\n` +
                `┃❍ Timezone: ${d.timezone || 'N/A'}\n` +
                `┃❍ Currency: ${d.currency_name || 'N/A'}\n` +
                `╰══════════════════⊷`
            )
        } catch {
            return reply('❌ IP lookup failed.')
        }
    }
}

handle.command = [
    'joke', 'fact', 'quote', '8ball', 'coinflip', 'flip',
    'truth', 'dare', 'ship', 'password', 'uuid',
    'color', 'colour', 'currency', 'worldtime', 'wtime',
    'country', 'iplookup', 'ip'
]

module.exports = handle
