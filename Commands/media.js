const { translate }           = require('../Library/actions/translate')
const { generateImage }        = require('../Library/actions/imagegen')
const { searchAndDownload }    = require('../Library/actions/music')
const { analyzeImageFromBuffer } = require('../Library/actions/vision')
const { webSearch }            = require('../Library/actions/search')

const react = (conn, m, e) => conn.sendMessage(m.chat, { react: { text: e, key: m.key } }).catch(() => {})

const hasImage = (msg) => msg && /image|sticker/.test(msg.mimetype || '')

const getMediaBuffer = async (conn, msg) => {
    try {
        if (msg?.key && msg?.message)
            return await conn.downloadMediaMessage({ key: msg.key, message: msg.message })
        return await conn.downloadMediaMessage(msg)
    } catch { return null }
}

const handle = async (m, { conn, text, reply, prefix, command, sender, chat, isOwner, args }) => {

    // ── translate / tl ────────────────────────────────────────────────────────
    if (command === 'translate' || command === 'tl' || command === 'tr') {
        const quoted = m.quoted?.text || m.quoted?.body || ''
        let lang = 'English'
        let content = ''

        if (text) {
            const langMatch = text.match(/\bto\s+(\w+)$/i) || text.match(/\bin\s+(\w+)$/i)
            if (langMatch) {
                lang = langMatch[1]
                content = quoted || text.replace(langMatch[0], '').trim()
            } else {
                const parts = text.split(/\s+/)
                if (parts.length === 1 && !quoted) {
                    return reply(
                        `❌ Usage:\n` +
                        `• ${prefix}tl <text> to <lang>\n` +
                        `• Quote a message + ${prefix}tl to <lang>\n\n` +
                        `Languages: English, Swahili, French, Arabic, Hindi, Chinese, Yoruba, Hausa, Igbo...`
                    )
                }
                lang = parts[0]
                content = quoted || parts.slice(1).join(' ')
            }
        } else if (quoted) {
            content = quoted
        } else {
            return reply(`❌ Quote a message or type text to translate.\nUsage: ${prefix}tl <text> to <lang>`)
        }

        if (!content) return reply(`❌ Nothing to translate.`)
        await react(conn, m, '🌐')
        const res = await translate(content, lang)
        await react(conn, m, res.success ? '✅' : '❌')
        if (!res.success) return reply(`❌ ${res.error}`)
        return reply(`🌐 *Translated to ${res.to}:*\n\n${res.result}`)
    }

    // ── play / song / music ───────────────────────────────────────────────────
    if (command === 'play' || command === 'song' || command === 'music') {
        if (!text) return reply(`❌ Usage: ${prefix}play <song name>\nExample: ${prefix}play Kendrick Lamar Not Like Us`)
        await react(conn, m, '🎵')
        await reply(`⏳ Searching for *${text}*...`)
        const res = await searchAndDownload(text)
        if (!res.success) {
            await react(conn, m, '❌')
            return reply(`❌ Couldn't find that song: ${res.error}`)
        }
        if (typeof res.audioUrl !== 'string' || !res.audioUrl.startsWith('http')) {
            await react(conn, m, '❌')
            return reply(`❌ Got an invalid audio link. Try a different song name.`)
        }
        await react(conn, m, '✅')
        await conn.sendMessage(chat, {
            audio: { url: res.audioUrl },
            mimetype: 'audio/mp4',
            ptt: false,
            fileName: `${res.title || text}.mp3`
        }, { quoted: m })
        const infoLine = `🎵 *${res.title || text}*${res.channel ? `\n📺 ${res.channel}` : ''}${res.duration ? ` · ${res.duration}` : ''}`
        if (res.thumbnail && typeof res.thumbnail === 'string' && res.thumbnail.startsWith('http')) {
            return conn.sendMessage(chat, { image: { url: res.thumbnail }, caption: infoLine })
        }
        return conn.sendMessage(chat, { text: infoLine })
    }

    // ── imagine / draw / gen ──────────────────────────────────────────────────
    if (command === 'imagine' || command === 'draw' || command === 'gen' || command === 'generate') {
        if (!text) return reply(`❌ Usage: ${prefix}imagine <description>\nExample: ${prefix}imagine a dragon flying over Nairobi at sunset`)
        await react(conn, m, '🎨')
        await reply(`⏳ Generating image for: *${text}*...`)
        const res = await generateImage(text)
        await react(conn, m, res.success ? '✅' : '❌')
        if (!res.success) return reply(`❌ Image generation failed: ${res.error}`)
        const caption = `🎨 *${text}*`
        if (res.buffer && Buffer.isBuffer(res.buffer))
            return conn.sendMessage(chat, { image: res.buffer, caption }, { quoted: m })
        if (res.url && typeof res.url === 'string' && res.url.startsWith('http'))
            return conn.sendMessage(chat, { image: { url: res.url }, caption }, { quoted: m })
        await react(conn, m, '❌')
        return reply(`❌ Image returned no usable data. Try again.`)
    }

    // ── see / vision / describe ───────────────────────────────────────────────
    if (command === 'see' || command === 'vision' || command === 'describe' || command === 'read') {
        const src = m.quoted && hasImage(m.quoted) ? m.quoted : (hasImage(m) ? m : null)
        if (!src) return reply(`❌ Send or quote an image with ${prefix}see\n\nOptionally add a question: ${prefix}see what brand is this?`)
        await react(conn, m, '👁️')
        const buffer = await getMediaBuffer(conn, src)
        if (!buffer) return reply(`❌ Couldn't download image.`)
        const question = text || 'Describe this image in detail.'
        const res = await analyzeImageFromBuffer(buffer, question)
        await react(conn, m, res.success ? '✅' : '❌')
        if (!res.success) return reply(`❌ Vision failed: ${res.error}`)
        return reply(`👁️ *Image Analysis:*\n\n${res.result}`)
    }

    // ── search / google / web ─────────────────────────────────────────────────
    if (command === 'search' || command === 'google' || command === 'web') {
        if (!text) return reply(`❌ Usage: ${prefix}search <query>\nExample: ${prefix}search who won the world cup 2022`)
        await react(conn, m, '🔍')
        const res = await webSearch(text)
        await react(conn, m, res.success ? '✅' : '❌')
        if (!res.success) return reply(`❌ Search failed: ${res.error}`)
        return reply(`🔍 *${text}*\n\n${res.result}`)
    }

    // ── remind ────────────────────────────────────────────────────────────────
    if (command === 'remind' || command === 'reminder') {
        if (!text) return reply(
            `❌ Usage: ${prefix}remind <time> <message>\n\n` +
            `Examples:\n` +
            `• ${prefix}remind 30m call the client\n` +
            `• ${prefix}remind 2h send invoice\n` +
            `• ${prefix}remind 1d backup server`
        )
        const timeMatch = text.match(/^(\d+)(s|m|h|d)\s+(.+)/i)
        if (!timeMatch) return reply(`❌ Invalid format.\nExamples: ${prefix}remind 30m call client | ${prefix}remind 2h check server`)

        const amount = parseInt(timeMatch[1])
        const unit   = timeMatch[2].toLowerCase()
        const msg    = timeMatch[3].trim()

        const ms = unit === 's' ? amount * 1000
            : unit === 'm' ? amount * 60000
            : unit === 'h' ? amount * 3600000
            : amount * 86400000

        const fireAt = Date.now() + ms
        const label  = unit === 's' ? `${amount}s`
            : unit === 'm' ? `${amount} min`
            : unit === 'h' ? `${amount} hour${amount > 1 ? 's' : ''}`
            : `${amount} day${amount > 1 ? 's' : ''}`

        if (!global.db.data.reminders) global.db.data.reminders = []
        global.db.data.reminders.push({ jid: sender, chat: m.chat, msg, fireAt, set: Date.now() })
        await global.db.write()

        await react(conn, m, '⏰')
        return reply(`⏰ *Reminder set!*\nI'll remind you in *${label}*:\n_"${msg}"_`)
    }

    // ── poststatus / setstatus ────────────────────────────────────────────────
    if (command === 'poststatus' || command === 'setstatus' || command === 'status') {
        if (!isOwner) return reply(`⛔ Owner only.`)
        if (!text && !m.quoted) return reply(
            `❌ Usage:\n` +
            `• ${prefix}poststatus <text> — Post a text status\n` +
            `• Quote an image + ${prefix}poststatus <caption> — Post an image status`
        )
        await react(conn, m, '📤')
        const src = m.quoted && hasImage(m.quoted) ? m.quoted : (hasImage(m) ? m : null)
        if (src) {
            const buffer = await getMediaBuffer(conn, src)
            if (!buffer) return reply(`❌ Couldn't download the image.`)
            await conn.sendMessage('status@broadcast', {
                image: buffer,
                caption: text || '',
                backgroundColor: '#000000'
            })
        } else {
            await conn.sendMessage('status@broadcast', {
                text: text,
                backgroundColor: '#1DA462',
                font: 1
            })
        }
        await react(conn, m, '✅')
        return reply(`✅ Status posted!`)
    }

    // ── antispam ──────────────────────────────────────────────────────────────
    if (command === 'antispam') {
        if (!isOwner) return reply(`⛔ Owner only.`)
        if (!m.isGroup) return reply(`❌ Group only command.`)
        const toggle = args[0]?.toLowerCase()
        if (!toggle || !['on', 'off'].includes(toggle)) return reply(`❌ Usage: ${prefix}antispam on/off`)
        const key = `antispam_${chat}`
        if (!global.db.data.settings) global.db.data.settings = {}
        global.db.data.settings[key] = toggle === 'on'
        await global.db.write()
        await react(conn, m, toggle === 'on' ? '🛡️' : '✅')
        return reply(`🛡️ Anti-spam *${toggle.toUpperCase()}* for this group.\nUsers sending 5+ messages in 5 seconds will be warned, then kicked.`)
    }

    // ── listreminders ─────────────────────────────────────────────────────────
    if (command === 'reminders' || command === 'listreminders') {
        const mine = (global.db.data.reminders || []).filter(r => r.jid === sender)
        if (!mine.length) return reply(`📭 You have no pending reminders.`)
        const now = Date.now()
        const lines = mine.map((r, i) => {
            const left = r.fireAt - now
            const mins = Math.round(left / 60000)
            const hrs  = Math.round(left / 3600000)
            const label = left < 60000 ? 'soon' : left < 3600000 ? `${mins}m` : `${hrs}h`
            return `${i + 1}. ⏰ _${r.msg}_ (in ${label})`
        }).join('\n')
        return reply(`⏰ *Your reminders (${mine.length}):*\n\n${lines}`)
    }
}

handle.command = [
    'translate', 'tl', 'tr',
    'play', 'song', 'music',
    'imagine', 'draw', 'gen', 'generate',
    'see', 'vision', 'describe',
    'search', 'google', 'web',
    'remind', 'reminder', 'reminders', 'listreminders',
    'poststatus', 'setstatus', 'status',
    'antispam'
]
handle.tags = ['media']

module.exports = handle
