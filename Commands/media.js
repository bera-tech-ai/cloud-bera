const { translate }           = require('../Library/actions/translate')
const { generateImage }        = require('../Library/actions/imagegen')
const { searchAndDownload }    = require('../Library/actions/music')
const { sendAudioMessage }     = require('../Library/actions/whatsapp-media')
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
    if (command === 'play' || command === 'song' || command === 'music' || command === 'play2') {
        if (!text) return reply(`🎵 *ʙᴇʀᴀ ᴀɪ ᴘʟᴀʏ*\n\nUsage: ${prefix}play [song name]\nExample: ${prefix}play faded`)
        await react(conn, m, '🎧')
        await reply(`⏳ *ʙᴇʀᴀ ᴀɪ ᴘʟᴀʏ*\n\nSearching: *${text}*\nGive me a moment...`)
        const res = await searchAndDownload(text)
        if (!res.success) {
            await react(conn, m, '❌')
            return reply(`❌ *ʙᴇʀᴀ ᴀɪ ᴘʟᴀʏ*\n\nTrack "${text}" not found. Try a different song name or check spelling.\n\n💡 Tip: Try being more specific — e.g. "${text} official audio"`)
        }
        const hasAudioUrl  = typeof res.audioUrl === 'string' && res.audioUrl.startsWith('http')
        const hasAudioBuf  = Buffer.isBuffer(res.audioBuffer)
        if (!hasAudioUrl && !hasAudioBuf) {
            await react(conn, m, '❌')
            return reply(`⚠️ *ʙᴇʀᴀ ᴀɪ ᴘʟᴀʏ*\n\nMusic service is napping. Try again in a moment.`)
        }
        await reply(`🎵 *ʙᴇʀᴀ ᴀɪ ᴘʟᴀʏ*\n\nTitle: ${res.title || text}\nDuration: ${res.duration || 'N/A'}\nSource: ${res.source || 'auto'}\n\nDownloading audio...`)
        const hasThumbnail = res.thumbnail && typeof res.thumbnail === 'string' && res.thumbnail.startsWith('http')
        await sendAudioMessage(conn, chat, hasAudioUrl ? res.audioUrl : res.audioBuffer, {
            mimetype: 'audio/mpeg',
            fileName: `${res.title || text}.mp3`,
            quoted: m,
            contextInfo: hasThumbnail ? {
                externalAdReply: {
                    thumbnailUrl: res.thumbnail,
                    title: res.title || text,
                    body: `${res.channel ? res.channel + ' • ' : ''}⏱️ ${res.duration || 'N/A'}`,
                    sourceUrl: `https://www.youtube.com/results?search_query=${encodeURIComponent(res.title || text)}`,
                    renderLargerThumbnail: true,
                    mediaType: 1
                }
            } : undefined
        })
        await react(conn, m, '✅')
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
    // Persistent reminders (Library/actions/reminders.js): saved in
    // db.reminders, delivered by the loop in Connection/start.js, so they
    // survive a restart. This is the canonical .remind command.
    if (command === 'remind' || command === 'reminder') {
        const { parseReminderRequest, createReminder, cancelReminder, listReminders, formatNairobi, formatDelay, repeatLabel } = require('../Library/actions/reminders')
        const sub = (text || '').trim()
        const usage =
            `❌ Usage: ${prefix}remind <when> <message>\n\n` +
            `Examples:\n` +
            `• ${prefix}remind 30m call the client\n` +
            `• ${prefix}remind 2h send invoice\n` +
            `• ${prefix}remind tomorrow at 9am call mum\n` +
            `• ${prefix}remind every Monday at 9am review goals\n` +
            `• ${prefix}remind 2026-11-25 09:00 team standup\n\n` +
            `Manage them: ${prefix}reminders · ${prefix}remind cancel <id> · ${prefix}done <id> · ${prefix}snooze <id> 10m`
        if (!sub) return reply(usage)

        const firstWord = sub.split(/\s+/)[0].toLowerCase()
        if (firstWord === 'list') {
            const mine = listReminders(sender)
            if (!mine.length) return reply(`📭 You have no pending reminders.`)
            const lines = mine.map((r) => {
                const when = r.fireAt <= Date.now() ? 'due now' : formatNairobi(r.fireAt)
                const waiting = r.status === 'fired' ? ` (waiting — reply ${prefix}done ${r.id})` : ''
                return `• [#${r.id}] ⏰ _${r.msg}_ — ${when}${r.repeat ? ` (${repeatLabel(r.repeat)})` : ''}${waiting}`
            }).join('\n')
            return reply(`⏰ *Your reminders (${mine.length}):*\n\n${lines}\n\nCancel one with: ${prefix}remind cancel <id>`)
        }
        if (firstWord === 'cancel') {
            const id = sub.split(/\s+/)[1]
            if (!id) return reply(`❌ Usage: ${prefix}remind cancel <id>\nSee your ids with ${prefix}reminders`)
            const r = cancelReminder(id, sender)
            return reply(r.success ? `✅ Reminder [#${r.reminder.id}] cancelled: _${r.reminder.msg}_` : `❌ ${r.error}`)
        }

        const parsed = parseReminderRequest(sub)
        if (parsed.error) return reply(`❌ ${parsed.error}\n\n${usage}`)
        let created
        try {
            created = await createReminder({ chat: m.chat, jid: sender, msg: parsed.msg, fireAt: parsed.fireAt, repeat: parsed.repeat })
        } catch (e) { return reply(`❌ ${e.message}`) }

        await react(conn, m, '⏰')
        return reply(
            `⏰ *Reminder set!* [#${created.id}]\n` +
            `I'll remind you ${formatDelay(created.fireAt - Date.now())} — *${formatNairobi(created.fireAt)}* (Africa/Nairobi):\n` +
            `_"${created.msg}"_` +
            (created.repeat ? `\n🔁 Repeats: ${repeatLabel(created.repeat)}` : '') +
            `\n\nDone early? ${prefix}done ${created.id} · Snooze? ${prefix}snooze ${created.id} 10m`
        )
    }

    // ── done / snooze ─────────────────────────────────────────────────────────
    if (command === 'done') {
        const { doneReminder } = require('../Library/actions/reminders')
        const id = (text || '').trim().split(/\s+/)[0]
        if (!id) return reply(`❌ Usage: ${prefix}done <id>\nSee your ids with ${prefix}reminders`)
        const r = doneReminder(id, sender)
        return reply(r.success ? `✅ Done: _${r.reminder.msg}_` : `❌ ${r.error}`)
    }
    if (command === 'snooze') {
        const { snoozeReminder, parseReminderTime } = require('../Library/actions/reminders')
        const parts = (text || '').trim().split(/\s+/)
        const id = parts[0]
        if (!id) return reply(`❌ Usage: ${prefix}snooze <id> [10m]\nSee your ids with ${prefix}reminders`)
        const when = parts[1] || '10m'
        const parsed = parseReminderTime(when)
        if (parsed.error) return reply(`❌ ${parsed.error}`)
        const minutes = Math.max(1, Math.round((parsed.fireAt - Date.now()) / 60000))
        const r = snoozeReminder(id, sender, minutes)
        return reply(r.success
            ? `😴 Snoozed for ${minutes}m: _${r.reminder.msg}_\nNext: ${require('../Library/actions/reminders').formatNairobi(r.reminder.fireAt)} (snooze ${r.reminder.snoozeCount}/3)`
            : `❌ ${r.error}`)
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
        const { listReminders, formatNairobi, repeatLabel } = require('../Library/actions/reminders')
        const mine = listReminders(sender)
        if (!mine.length) return reply(`📭 You have no pending reminders.`)
        const lines = mine.map((r) => {
            const when = r.fireAt <= Date.now() ? 'due now' : formatNairobi(r.fireAt)
            const waiting = r.status === 'fired' ? ` (waiting — reply ${prefix}done ${r.id})` : ''
            return `• [#${r.id}] ⏰ _${r.msg}_ — ${when}${r.repeat ? ` (${repeatLabel(r.repeat)})` : ''}${waiting}`
        }).join('\n')
        return reply(`⏰ *Your reminders (${mine.length}):*\n\n${lines}\n\nCancel one with: ${prefix}remind cancel <id>`)
    }
}

handle.command = [
    'translate', 'tl', 'tr',
    'play', 'play2', 'song', 'music',
    'imagine', 'draw', 'gen', 'generate',
    'see', 'vision', 'describe',
    'search', 'google', 'web',
    'remind', 'reminder', 'reminders', 'listreminders', 'done', 'snooze',
    'poststatus', 'setstatus', 'status',
    'antispam'
]
handle.tags = ['media']

module.exports = handle
