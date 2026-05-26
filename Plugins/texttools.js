// Plugins/texttools.js — Text manipulation & encoding tools
// Commands: uppercase, lowercase, reverse, bold, italic, strikethrough,
//           wordcount, charcount, palindrome, hash, rot13, morse,
//           zalgo, smallcaps, clap, vaporwave, base32, remind, timer

const crypto = require('crypto')

const handle = {}
handle.command = [
    'uppercase', 'uc', 'upcase',
    'lowercase', 'lc', 'downcase',
    'reverse', 'rev', 'backwards',
    'bold', 'boldfont',
    'italic', 'italicfont',
    'strikethrough', 'strike', 'crossed',
    'wordcount', 'wc', 'countwords',
    'charcount', 'cc', 'countchars',
    'palindrome', 'ispalindrome',
    'hash', 'sha256', 'md5hash',
    'rot13',
    'morse', 'morsecode',
    'smallcaps', 'sc2',
    'clap', 'claptext',
    'vaporwave', 'vapor', 'aesthetic',
    'spoiler', 'spoilertext',
    'zalgo', 'glitch',
    'base32', 'b32',
    'remind', 'reminder', 'remindme',
    'timer', 'countdown',
    'repeat', 'repeattext',
    'textinfo', 'analyze',
]
handle.tags = ['tools', 'text', 'utility']
handle.help = [
    'uppercase <text>      — CONVERT TO UPPERCASE',
    'lowercase <text>      — convert to lowercase',
    'reverse <text>        — txet esrever',
    'bold <text>           — 𝗕𝗼𝗹𝗱 𝗙𝗼𝗻𝘁',
    'italic <text>         — 𝘐𝘵𝘢𝘭𝘪𝘤 𝘍𝘰𝘯𝘵',
    'strikethrough <text>  — ~~Strike~~',
    'wordcount <text>      — Count words & chars',
    'palindrome <text>     — Is it a palindrome?',
    'hash <text>           — SHA-256 hash',
    'rot13 <text>          — ROT-13 cipher',
    'morse <text>          — Encode to morse code',
    'smallcaps <text>      — ꜱᴍᴀʟʟ ᴄᴀᴘꜱ',
    'clap <text>           — 👏clap👏text',
    'vaporwave <text>      — ａｅｓｔｈｅｔｉｃ',
    'zalgo <text>          — Z̶a̶l̶g̶o̶ text',
    'base32 <text>         — Base32 encode',
    'remind <mins> <msg>   — Set a reminder',
    'timer <seconds>       — Countdown timer',
    'repeat <n> <text>     — Repeat text N times',
    'textinfo <text>       — Full text analysis',
]

// Text transformation maps
const boldMap    = {'a':'𝗮','b':'𝗯','c':'𝗰','d':'𝗱','e':'𝗲','f':'𝗳','g':'𝗴','h':'𝗵','i':'𝗶','j':'𝗷','k':'𝗸','l':'𝗹','m':'𝗺','n':'𝗻','o':'𝗼','p':'𝗽','q':'𝗾','r':'𝗿','s':'𝘀','t':'𝘁','u':'𝘂','v':'𝘃','w':'𝘄','x':'𝘅','y':'𝘆','z':'𝘇','A':'𝗔','B':'𝗕','C':'𝗖','D':'𝗗','E':'𝗘','F':'𝗙','G':'𝗚','H':'𝗛','I':'𝗜','J':'𝗝','K':'𝗞','L':'𝗟','M':'𝗠','N':'𝗡','O':'𝗢','P':'𝗣','Q':'𝗤','R':'𝗥','S':'𝗦','T':'𝗧','U':'𝗨','V':'𝗩','W':'𝗪','X':'𝗫','Y':'𝗬','Z':'𝗭','0':'𝟬','1':'𝟭','2':'𝟮','3':'𝟯','4':'𝟰','5':'𝟱','6':'𝟲','7':'𝟳','8':'𝟴','9':'𝟵'}
const italicMap  = {'a':'𝘢','b':'𝘣','c':'𝘤','d':'𝘥','e':'𝘦','f':'𝘧','g':'𝘨','h':'𝘩','i':'𝘪','j':'𝘫','k':'𝘬','l':'𝘭','m':'𝘮','n':'𝘯','o':'𝘰','p':'𝘱','q':'𝘲','r':'𝘳','s':'𝘴','t':'𝘵','u':'𝘶','v':'𝘷','w':'𝘸','x':'𝘹','y':'𝘺','z':'𝘻','A':'𝘈','B':'𝘉','C':'𝘊','D':'𝘋','E':'𝘌','F':'𝘍','G':'𝘎','H':'𝘏','I':'𝘐','J':'𝘑','K':'𝘒','L':'𝘓','M':'𝘔','N':'𝘕','O':'𝘖','P':'𝘗','Q':'𝘘','R':'𝘙','S':'𝘚','T':'𝘛','U':'𝘜','V':'𝘝','W':'𝘞','X':'𝘟','Y':'𝘠','Z':'𝘡'}
const smallcapsMap = {'a':'ᴀ','b':'ʙ','c':'ᴄ','d':'ᴅ','e':'ᴇ','f':'ꜰ','g':'ɢ','h':'ʜ','i':'ɪ','j':'ᴊ','k':'ᴋ','l':'ʟ','m':'ᴍ','n':'ɴ','o':'ᴏ','p':'ᴘ','q':'Q','r':'ʀ','s':'ꜱ','t':'ᴛ','u':'ᴜ','v':'ᴠ','w':'ᴡ','x':'x','y':'ʏ','z':'ᴢ'}
const vaporwaveMap = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'.split('').reduce((a,c,i) => { const codes = [65313,65313,65313,65313,65313,65313,65313,65313,65313,65313,65313,65313,65313,65313,65313,65313,65313,65313,65313,65313,65313,65313,65313,65313,65313,65313,65345,65345,65345,65345,65345,65345,65345,65345,65345,65345,65345,65345,65345,65345,65345,65345,65345,65345,65345,65345,65345,65345,65345,65345,65345,65345,65296,65296,65296,65296,65296,65296,65296,65296,65296,65296]; a[c]=String.fromCodePoint(codes[i]+(i%26<26?i%26:i%10)); return a }, {})

const zalgoChars = ['̴','̵','̶','̷','̸','҉','͟','͠','͡','͢','̨','̡','̢','̛']
const morseCode = {'A':'.-','B':'-...','C':'-.-.','D':'-..','E':'.','F':'..-.','G':'--.','H':'....','I':'..','J':'.---','K':'-.-','L':'.-..','M':'--','N':'-.','O':'---','P':'.--.','Q':'--.-','R':'.-.','S':'...','T':'-','U':'..-','V':'...-','W':'.--','X':'-..-','Y':'-.--','Z':'--..','0':'-----','1':'.----','2':'..---','3':'...--','4':'....-','5':'.....','6':'-....','7':'--...','8':'---..','9':'----.'}

const transform = (text, map) => text.split('').map(c => map[c] || c).join('')
const toZalgo   = text => text.split('').map(c => c + (Math.random() > 0.5 ? zalgoChars[Math.floor(Math.random()*zalgoChars.length)] : '') + (Math.random() > 0.7 ? zalgoChars[Math.floor(Math.random()*zalgoChars.length)] : '')).join('')
const toMorse   = text => text.toUpperCase().split('').map(c => c === ' ' ? '/' : (morseCode[c] || c)).join(' ')
const toRot13   = text => text.replace(/[a-zA-Z]/g, c => String.fromCharCode(c.charCodeAt(0) + (c.toLowerCase() < 'n' ? 13 : -13)))
const isPalin   = text => { const clean = text.toLowerCase().replace(/[^a-z0-9]/g,''); return clean === clean.split('').reverse().join('') }
const toBase32  = text => {
    const alpha = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'
    let bits = '', out = ''
    for (const c of text) bits += c.charCodeAt(0).toString(2).padStart(8,'0')
    bits += '0'.repeat((8 - bits.length % 8) % 8)
    for (let i = 0; i < bits.length; i += 5) out += alpha[parseInt(bits.slice(i,i+5).padEnd(5,'0'),2)]
    return out + '='.repeat((8 - out.length % 8) % 8)
}

// Active reminders & timers store (in-memory, per bot session)
const activeReminders = new Map()

handle.all = async (m, { conn, command, args, prefix, reply, sender } = {}) => {
    const text = args.join(' ').trim()

    // ── UPPERCASE ────────────────────────────────────────────────────────────
    if (['uppercase','uc','upcase'].includes(command)) {
        if (!text) return reply('❌ Usage: ' + prefix + command + ' <text>')
        return reply(text.toUpperCase())
    }

    // ── LOWERCASE ────────────────────────────────────────────────────────────
    if (['lowercase','lc','downcase'].includes(command)) {
        if (!text) return reply('❌ Usage: ' + prefix + command + ' <text>')
        return reply(text.toLowerCase())
    }

    // ── REVERSE ──────────────────────────────────────────────────────────────
    if (['reverse','rev','backwards'].includes(command)) {
        if (!text) return reply('❌ Usage: ' + prefix + command + ' <text>')
        return reply(text.split('').reverse().join(''))
    }

    // ── BOLD FONT ────────────────────────────────────────────────────────────
    if (['bold','boldfont'].includes(command)) {
        if (!text) return reply('❌ Usage: ' + prefix + command + ' <text>')
        return reply(transform(text, boldMap))
    }

    // ── ITALIC FONT ──────────────────────────────────────────────────────────
    if (['italic','italicfont'].includes(command)) {
        if (!text) return reply('❌ Usage: ' + prefix + command + ' <text>')
        return reply(transform(text, italicMap))
    }

    // ── STRIKETHROUGH ────────────────────────────────────────────────────────
    if (['strikethrough','strike','crossed'].includes(command)) {
        if (!text) return reply('❌ Usage: ' + prefix + command + ' <text>')
        return reply(text.split('').map(c => c + '\u0336').join(''))
    }

    // ── WORD COUNT ───────────────────────────────────────────────────────────
    if (['wordcount','wc','countwords'].includes(command)) {
        if (!text) return reply('❌ Usage: ' + prefix + command + ' <text>')
        const words = text.trim().split(/\s+/).length
        const chars = text.length
        const sentences = (text.match(/[.!?]+/g)||[]).length
        const lines = text.split('\n').length
        return reply(
            '╭══〘 *📊 Text Stats* 〙═⊷\n' +
            '┃ 📝 Words:     ' + words + '\n' +
            '┃ 🔤 Chars:     ' + chars + '\n' +
            '┃ 🔡 No spaces: ' + text.replace(/\s/g,'').length + '\n' +
            '┃ 📄 Lines:     ' + lines + '\n' +
            '┃ 💬 Sentences: ' + (sentences || 1) + '\n' +
            '╰══════════════════⊷'
        )
    }

    // ── CHAR COUNT ───────────────────────────────────────────────────────────
    if (['charcount','cc','countchars'].includes(command)) {
        if (!text) return reply('❌ Usage: ' + prefix + command + ' <text>')
        return reply('🔤 Characters: *' + text.length + '*\n📝 Without spaces: *' + text.replace(/\s/g,'').length + '*')
    }

    // ── PALINDROME CHECK ─────────────────────────────────────────────────────
    if (['palindrome','ispalindrome'].includes(command)) {
        if (!text) return reply('❌ Usage: ' + prefix + command + ' <text>')
        const result = isPalin(text)
        return reply(result
            ? '✅ *"' + text + '"* is a palindrome! 🪞'
            : '❌ *"' + text + '"* is NOT a palindrome.')
    }

    // ── HASH ─────────────────────────────────────────────────────────────────
    if (['hash','sha256'].includes(command)) {
        if (!text) return reply('❌ Usage: ' + prefix + command + ' <text>')
        const sha256 = crypto.createHash('sha256').update(text).digest('hex')
        const md5    = crypto.createHash('md5').update(text).digest('hex')
        return reply(
            '╭══〘 *🔐 Hash Results* 〙═⊷\n' +
            '┃ *Input:*  ' + text.slice(0,40) + (text.length>40?'...':'') + '\n' +
            '┃\n' +
            '┃ *SHA-256:*\n' +
            '┃ ' + sha256 + '\n' +
            '┃\n' +
            '┃ *MD5:*\n' +
            '┃ ' + md5 + '\n' +
            '╰══════════════════⊷'
        )
    }

    // ── MD5 HASH ─────────────────────────────────────────────────────────────
    if (command === 'md5hash') {
        if (!text) return reply('❌ Usage: ' + prefix + command + ' <text>')
        return reply('🔐 MD5: `' + crypto.createHash('md5').update(text).digest('hex') + '`')
    }

    // ── ROT13 ────────────────────────────────────────────────────────────────
    if (command === 'rot13') {
        if (!text) return reply('❌ Usage: ' + prefix + command + ' <text>')
        return reply('🔄 ROT-13:\n' + toRot13(text))
    }

    // ── MORSE CODE ───────────────────────────────────────────────────────────
    if (['morse','morsecode'].includes(command)) {
        if (!text) return reply('❌ Usage: ' + prefix + command + ' <text>')
        const encoded = toMorse(text)
        return reply('📡 *Morse Code:*\n\n' + encoded)
    }

    // ── SMALL CAPS ───────────────────────────────────────────────────────────
    if (['smallcaps','sc2'].includes(command)) {
        if (!text) return reply('❌ Usage: ' + prefix + command + ' <text>')
        return reply(transform(text.toLowerCase(), smallcapsMap))
    }

    // ── CLAP TEXT ────────────────────────────────────────────────────────────
    if (['clap','claptext'].includes(command)) {
        if (!text) return reply('❌ Usage: ' + prefix + command + ' <text>')
        return reply(text.trim().split(/\s+/).join(' 👏 ') + ' 👏')
    }

    // ── VAPORWAVE ────────────────────────────────────────────────────────────
    if (['vaporwave','vapor','aesthetic'].includes(command)) {
        if (!text) return reply('❌ Usage: ' + prefix + command + ' <text>')
        // Full-width Unicode characters
        const fw = text.split('').map(c => {
            const code = c.charCodeAt(0)
            if (code >= 33 && code <= 126) return String.fromCodePoint(code + 65248)
            if (c === ' ') return '　'
            return c
        }).join('')
        return reply(fw)
    }

    // ── SPOILER ──────────────────────────────────────────────────────────────
    if (['spoiler','spoilertext'].includes(command)) {
        if (!text) return reply('❌ Usage: ' + prefix + command + ' <text>')
        return reply('🙈 *Spoiler hidden!*\nLong press / hold to reveal:\n\n' + '▓'.repeat(Math.min(text.length, 40)))
    }

    // ── ZALGO ────────────────────────────────────────────────────────────────
    if (['zalgo','glitch'].includes(command)) {
        if (!text) return reply('❌ Usage: ' + prefix + command + ' <text>')
        return reply('👾 ' + toZalgo(text))
    }

    // ── BASE32 ───────────────────────────────────────────────────────────────
    if (['base32','b32'].includes(command)) {
        if (!text) return reply('❌ Usage: ' + prefix + command + ' <text>')
        return reply('📦 *Base32:*\n' + toBase32(text))
    }

    // ── REMIND ───────────────────────────────────────────────────────────────
    if (['remind','reminder','remindme'].includes(command)) {
        if (args.length < 2) return reply(
            '❌ Usage: ' + prefix + 'remind <minutes> <message>\n\n' +
            'Examples:\n' +
            prefix + 'remind 5 Check the oven\n' +
            prefix + 'remind 30 Take medicine\n' +
            prefix + 'remind 60 Meeting starts'
        )
        const mins = parseFloat(args[0])
        if (isNaN(mins) || mins <= 0 || mins > 1440) return reply('❌ Minutes must be between 1 and 1440 (24 hours)')
        const msg = args.slice(1).join(' ')
        const ms  = mins * 60 * 1000
        const key = sender + '_' + Date.now()
        const eta = new Date(Date.now() + ms).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })

        reply('⏰ *Reminder set!*\n\n📝 Message: *' + msg + '*\n⏱️ In: *' + mins + ' minute(s)*\n🕐 At: *' + eta + '*')

        const timeout = setTimeout(async () => {
            try {
                await conn.sendMessage(m.chat, {
                    text: '🔔 *REMINDER!*\n\n📝 ' + msg + '\n\n_(Set ' + mins + ' min ago)_',
                    mentions: [sender]
                })
            } catch {}
            activeReminders.delete(key)
        }, ms)

        activeReminders.set(key, timeout)
        return
    }

    // ── TIMER / COUNTDOWN ────────────────────────────────────────────────────
    if (['timer','countdown'].includes(command)) {
        const secs = parseInt(args[0])
        if (isNaN(secs) || secs <= 0 || secs > 300) return reply('❌ Usage: ' + prefix + 'timer <1-300 seconds>')

        await reply('⏳ Timer started: *' + secs + ' second(s)*')
        await new Promise(r => setTimeout(r, secs * 1000))
        return reply('🔔 *Time\'s up!* (' + secs + 's timer ended)\n@' + sender.split('@')[0], { mentions: [sender] })
    }

    // ── REPEAT TEXT ──────────────────────────────────────────────────────────
    if (['repeat','repeattext'].includes(command)) {
        const n    = parseInt(args[0])
        const msg2 = args.slice(1).join(' ')
        if (isNaN(n) || n < 1 || n > 20 || !msg2) return reply('❌ Usage: ' + prefix + 'repeat <1-20> <text>')
        return reply(Array(n).fill(msg2).join('\n'))
    }

    // ── TEXT INFO / ANALYZE ──────────────────────────────────────────────────
    if (['textinfo','analyze'].includes(command)) {
        if (!text) return reply('❌ Usage: ' + prefix + command + ' <text>')
        const words    = text.trim().split(/\s+/)
        const vowels   = (text.match(/[aeiou]/gi)||[]).length
        const consonants = (text.match(/[bcdfghjklmnpqrstvwxyz]/gi)||[]).length
        const digits   = (text.match(/\d/g)||[]).length
        const specials = (text.match(/[^a-zA-Z0-9\s]/g)||[]).length
        const longest  = words.sort((a,b) => b.length-a.length)[0]
        return reply(
            '╭══〘 *🔬 Text Analysis* 〙═⊷\n' +
            '┃ 📝 Words:      ' + words.length + '\n' +
            '┃ 🔤 Chars:      ' + text.length + '\n' +
            '┃ 🅰️ Vowels:     ' + vowels + '\n' +
            '┃ 🔡 Consonants: ' + consonants + '\n' +
            '┃ 🔢 Digits:     ' + digits + '\n' +
            '┃ ❇️ Specials:   ' + specials + '\n' +
            '┃ 📏 Avg word:   ' + (text.replace(/\s+/g,' ').split(' ').reduce((s,w)=>s+w.length,0)/words.length).toFixed(1) + ' chars\n' +
            '┃ 🏆 Longest:    ' + longest + '\n' +
            '╰══════════════════⊷'
        )
    }
}

module.exports = handle
