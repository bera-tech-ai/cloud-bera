// Plugins/copybtns.js — Commands with Copy/Action buttons (atassa-style sendButtons)
const axios = require('axios')
const { sendButtons } = require('gifted-btns')
const { getBtnMode, setBtnMode, clearBtnMode } = require('../Library/actions/btnmode')
const xcasper = require('../Library/actions/xcasper')

const handle = {}
handle.command = [
    'btns', 'buttonmode', 'togglebtns', 'btnmode', 'btntoggle',
    'lyrics2', 'getlyrics', 'lyricsbt',
    'define2', 'dict2', 'dictbt',
    'tr2', 'trans2', 'translatebt',
    'weather2', 'wbt', 'weatherbt',
    'calc2', 'calculatebt',
    'qr2', 'qrbt', 'qrcode2',
    'ask2', 'aibt', 'askbt',
    'sticker2', 'stickerbt',
    'profile2', 'pfpbt', 'wapfp2',
    'warn2', 'warnbt',
    'search2', 'searchbt', 'googlebt',
]
handle.tags  = ['utility', 'tools', 'buttons', 'copy']
handle.help  = [
    'btns           — Toggle button mode ON/OFF for this chat',
    'lyrics2 <song> — Lyrics with copy button',
    'define2 <word> — Dictionary with copy button',
    'tr2 <lang> <t> — Translate with copy button',
    'weather2 <city>— Weather info',
    'calc2 <expr>   — Calculator with copy result',
    'qr2 <text>     — QR code',
    'ask2 <q>       — AI answer with copy button',
    'warn2 @user    — Warn with action buttons',
    'search2 <q>    — Search with link buttons',
]

const askAI = async (prompt) => {
    try {
        const res = await xcasper.chat([{ role: 'user', content: prompt.slice(0, 12000) }])
        if (res.success && res.text?.length > 5) return res.text.slice(0, 800)
    } catch {}
    return null
}

const getLyrics = async (query) => {
    return null
}

handle.all = async (m, { conn, command, args, prefix, reply, isOwner, isAdmin, isGroup, sender } = {}) => {
    const chat = m.chat || m.key?.remoteJid
    const text = args.join(' ').trim()
    const p    = prefix

    // ── BTNS TOGGLE ──────────────────────────────────────────────────────────
    if (['btns','buttonmode','togglebtns','btnmode','btntoggle'].includes(command)) {
        const current  = getBtnMode(chat)
        const arg0     = args[0]?.toLowerCase()
        const isGlobal = args.includes('global')

        if (!arg0 || arg0 === 'status') {
            const mode = current ? '🟢 ON (Button Mode)' : '⚪ OFF (Plain Text)'
            const glb  = getBtnMode(null) ? '🟢 ON' : '⚪ OFF'
            const body = '╭══〘 *⚙️ Button Mode Settings* 〙═⊷\n┃\n┃ This chat:    *' + mode + '*\n┃ Global:       *' + glb + '*\n┃\n┃ When ON:  Interactive buttons\n┃ When OFF: Clean plain text\n╰══════════════════⊷'
            return sendButtons(conn, chat, {
                title: '⚙️ Button Mode',
                text:  body,
                footer: 'Bera AI',
                buttons: current
                    ? [{ id: 'btns_off_' + chat, text: '🔴 Turn Buttons OFF (This Chat)' }, { id: 'btns_on_keep', text: '🟢 Keep Buttons ON' }]
                    : [{ id: 'btns_on_' + chat,  text: '🟢 Turn Buttons ON (This Chat)'  }, { id: 'btns_off_keep', text: '⚪ Keep Buttons OFF' }]
            })
        }

        if (arg0 === 'on') {
            if (isGlobal) {
                if (!isOwner) return reply('❌ Only bot owner can change global mode.')
                setBtnMode(null, true)
                return reply('✅ *Global button mode: ON*\nAll chats will now use button UI.')
            }
            setBtnMode(chat, true)
            return reply('✅ *Buttons ON* for this chat. All supported commands will now show button UI!')
        }

        if (arg0 === 'off') {
            if (isGlobal) {
                if (!isOwner) return reply('❌ Only bot owner can change global mode.')
                setBtnMode(null, false)
                return reply('✅ *Global button mode: OFF*\nAll chats will use plain text.')
            }
            setBtnMode(chat, false)
            return reply('✅ *Buttons OFF* for this chat. Commands will use clean plain text.')
        }

        return reply('❓ Usage:\n' + p + 'btns — Show status\n' + p + 'btns on/off — Toggle\n' + p + 'btns global on/off — Global (owner)')
    }

    // ── LYRICS2 ───────────────────────────────────────────────────────────────
    if (['lyrics2','getlyrics','lyricsbt'].includes(command)) {
        if (!text) return reply('❌ Usage: ' + p + 'lyrics2 <song name>')
        await reply('🎵 Searching lyrics for: *' + text + '*...')
        const data = await getLyrics(text)
        if (!data?.lyrics) return reply('❌ Lyrics not found for: ' + text)
        const lyricsText = '🎵 *' + (data.title || text) + '*\n👤 ' + (data.author || '') + '\n\n' + data.lyrics.slice(0, 1500)
        if (getBtnMode(chat)) {
            return sendButtons(conn, chat, {
                title:  '🎵 ' + (data.title || text),
                text:   lyricsText,
                footer: 'Bera AI — Lyrics',
                buttons: [
                    { name: 'cta_copy', buttonParamsJson: JSON.stringify({ display_text: '📋 Copy Lyrics', copy_code: data.lyrics.slice(0, 2000) }) },
                ]
            })
        }
        return reply(lyricsText)
    }

    // ── DEFINE2 ───────────────────────────────────────────────────────────────
    if (['define2','dict2','dictbt'].includes(command)) {
        if (!text) return reply('❌ Usage: ' + p + 'define2 <word>')
        await reply('📖 Looking up: *' + text + '*...')
        try {
            const res = await axios.get('https://api.dictionaryapi.dev/api/v2/entries/en/' + encodeURIComponent(text), { timeout: 8000 })
            const entry = res.data?.[0]
            if (!entry) return reply('❌ No definition found for: ' + text)
            const meaning  = entry.meanings?.[0]
            const defText  = meaning?.definitions?.[0]?.definition || 'No definition found'
            const example  = meaning?.definitions?.[0]?.example ? '\n\n💬 *Example:* ' + meaning.definitions[0].example : ''
            const partOfSpeech = meaning?.partOfSpeech || ''
            const phonetic = entry.phonetic || ''
            return reply('📖 *' + entry.word + '* ' + (phonetic ? '(' + phonetic + ')' : '') + '\n🏷️ *' + partOfSpeech + '*\n\n' + defText + example)
        } catch { return reply('❌ Could not fetch definition. Try again.') }
    }

    // ── TR2 — TRANSLATE ───────────────────────────────────────────────────────
    if (['tr2','trans2','translatebt'].includes(command)) {
        if (!text) return reply('❌ Usage: ' + p + 'tr2 <lang> <text>\nExample: ' + p + 'tr2 es Hello World')
        const [lang, ...rest] = args
        const toTranslate = rest.join(' ')
        if (!toTranslate) return reply('❌ Provide text to translate after the language code.')
        await reply('🌍 Translating to *' + lang + '*...')
        try {
            const res = await axios.get('https://api.mymemory.translated.net/get?q=' + encodeURIComponent(toTranslate) + '&langpair=en|' + lang, { timeout: 8000 })
            const translated = res.data?.responseData?.translatedText
            if (!translated) return reply('❌ Translation failed. Check the language code.')
            return reply('🌍 *Translation*\n\n📝 *Original:* ' + toTranslate + '\n\n✅ *Result (' + lang + '):* ' + translated)
        } catch { return reply('❌ Translation error. Try again.') }
    }

    // ── WEATHER2 ──────────────────────────────────────────────────────────────
    if (['weather2','wbt','weatherbt'].includes(command)) {
        if (!text) return reply('❌ Usage: ' + p + 'weather2 <city>')
        await reply('🌤️ Fetching weather for: *' + text + '*...')
        try {
            const res = await axios.get('https://wttr.in/' + encodeURIComponent(text) + '?format=j1', { timeout: 10000 })
            const w   = res.data?.current_condition?.[0]
            if (!w) return reply('❌ City not found: ' + text)
            const area = res.data.nearest_area?.[0]?.areaName?.[0]?.value || text
            const country = res.data.nearest_area?.[0]?.country?.[0]?.value || ''
            const tempC = w.temp_C, tempF = w.temp_F
            const desc  = w.weatherDesc?.[0]?.value || ''
            return reply('🌍 *' + area + ', ' + country + '*\n\n🌡️ *Temp:* ' + tempC + '°C / ' + tempF + '°F\n🌤️ *Condition:* ' + desc + '\n💧 *Humidity:* ' + w.humidity + '%\n💨 *Wind:* ' + w.windspeedKmph + ' km/h')
        } catch { return reply('❌ Could not fetch weather. Try again.') }
    }

    // ── CALC2 ─────────────────────────────────────────────────────────────────
    if (['calc2','calculatebt'].includes(command)) {
        if (!text) return reply('❌ Usage: ' + p + 'calc2 <expression>\nExample: ' + p + 'calc2 15 * 3 + 7')
        let result
        try {
            const safe = text.replace(/[^0-9+\-*/().% ]/g, '')
            result = Function('"use strict"; return (' + safe + ')')()
            if (!isFinite(result)) throw new Error('infinite')
        } catch { return reply('❌ Invalid expression: ' + text) }
        const body = '🧮 *Calculator*\n\n📝 *Expression:* ' + text + '\n\n✅ *Result:* *' + result + '*'
        if (getBtnMode(chat)) {
            return sendButtons(conn, chat, {
                title:  '🧮 ' + text + ' = ' + result,
                text:   body,
                footer: 'Bera AI — Calculator',
                buttons: [
                    { name: 'cta_copy', buttonParamsJson: JSON.stringify({ display_text: '📋 Copy Result', copy_code: String(result) }) },
                ]
            })
        }
        return reply(body)
    }

    // ── QR2 ───────────────────────────────────────────────────────────────────
    if (['qr2','qrbt','qrcode2'].includes(command)) {
        if (!text) return reply('❌ Usage: ' + p + 'qr2 <text or URL>')
        const qrUrl = 'https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=' + encodeURIComponent(text)
        return conn.sendMessage(chat, { image: { url: qrUrl }, caption: '🔲 *QR Code*\n\n📝 Content: ' + text.slice(0, 100) }, { quoted: m })
    }

    // ── ASK2 — AI with copy button ────────────────────────────────────────────
    if (['ask2','aibt','askbt'].includes(command)) {
        if (!text) return reply('❌ Usage: ' + p + 'ask2 <your question>')
        await reply('🧠 Thinking...')
        const answer = await askAI(text)
        if (!answer) return reply('❌ AI failed to respond. Try again.')
        const body = '🧠 *ChatBera Answer*\n\n❓ *Q:* ' + text.slice(0, 200) + '\n\n💬 *A:* ' + answer
        if (getBtnMode(chat)) {
            return sendButtons(conn, chat, {
                title:  '🧠 ChatBera AI',
                text:   body,
                footer: 'Bera AI',
                buttons: [
                    { name: 'cta_copy', buttonParamsJson: JSON.stringify({ display_text: '📋 Copy Answer', copy_code: answer }) },
                ]
            })
        }
        return reply(body)
    }

    // ── PROFILE2 ──────────────────────────────────────────────────────────────
    if (['profile2','pfpbt','wapfp2'].includes(command)) {
        const target = m.mentionedJid?.[0] || sender
        const num    = target.split('@')[0]
        let ppUrl
        try { ppUrl = await conn.profilePictureUrl(target, 'image') } catch { ppUrl = null }
        if (!ppUrl) return reply('❌ No profile picture found for @' + num)
        return conn.sendMessage(chat, { image: { url: ppUrl }, caption: '🖼️ *Profile Picture*\n👤 @' + num }, { quoted: m })
    }

    // ── WARN2 ─────────────────────────────────────────────────────────────────
    if (['warn2','warnbt'].includes(command)) {
        const mentioned = m.mentionedJid?.[0]
        const reason    = args.filter(a => !a.match(/@\d+/)).join(' ').trim() || 'No reason given'
        if (!mentioned) return reply('❌ Usage: ' + p + 'warn2 @user <reason>')
        const warns  = global.beraWarns || (global.beraWarns = {})
        const key    = chat + '_' + mentioned
        warns[key]   = (warns[key] || 0) + 1
        const count  = warns[key]
        const body   = '⚠️ *Warning Issued*\n\n👤 User: @' + mentioned.split('@')[0] + '\n📝 Reason: ' + reason + '\n🔢 Warnings: ' + count + '/3' + (count >= 2 ? '\n\n⚡ ' + (3 - count) + ' more warning = auto-kick!' : '')
        return conn.sendMessage(chat, { text: body, mentions: [mentioned] }, { quoted: m })
    }

    // ── SEARCH2 ───────────────────────────────────────────────────────────────
    if (['search2','searchbt','googlebt'].includes(command)) {
        if (!text) return reply('❌ Usage: ' + p + 'search2 <query>')
        const googleUrl = 'https://www.google.com/search?q=' + encodeURIComponent(text)
        const ytUrl     = 'https://www.youtube.com/results?search_query=' + encodeURIComponent(text)
        return reply('🔍 *Search: ' + text.slice(0, 40) + '*\n\n🌐 Google: ' + googleUrl + '\n▶️ YouTube: ' + ytUrl)
    }
}

module.exports = handle
