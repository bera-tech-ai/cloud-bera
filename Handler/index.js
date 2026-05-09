const config = require('../Config')
const { isAuthorized } = require('../Auth')
const { getUser } = require('../Database')
const fs = require('fs')
const path = require('path')

// Pre-warm library modules so first command has zero load delay
try { require('../Library/actions/music') } catch {}
try { require('../Library/actions/search') } catch {}
try { require('../Library/actions/chatbera') } catch {}
try { require('gifted-btns') } catch {}

const _seenMsgIds = new Set()

const commandFiles = ['general', 'bera', 'group', 'admin', 'media', 'pterodactyl']
const handlers = commandFiles.map(f => require(`../Commands/${f}`))

const loadPlugins = () => {
    const pluginDir = path.resolve('./Plugins')
    if (!fs.existsSync(pluginDir)) return
    const files = fs.readdirSync(pluginDir).filter(f => f.endsWith('.js') && f !== 'example.js')
    for (const file of files) {
        try {
            const plugin = require(path.join(pluginDir, file))
            const isFunc = plugin && typeof plugin === 'function'
            const isObj  = plugin && typeof plugin === 'object' && (plugin.command || plugin.all)
            if (isFunc || isObj) {
                handlers.push(plugin)
                console.log(`[PLUGIN] Loaded: ${file}`)
            } else {
                console.log(`[PLUGIN] Skipped (bad export): ${file}`)
            }
        } catch (e) {
            console.error(`[PLUGIN] Failed to load ${file}: ${e.message}`)
        }
    }
}
loadPlugins()

const buildCommandMap = () => {
    const map = new Map()
    for (const handler of handlers) {
        const cmds = Array.isArray(handler.command) ? handler.command : [handler.command].filter(Boolean)
        for (const cmd of cmds) {
            map.set(cmd.toLowerCase(), handler)
        }
    }
    return map
}

let commandMap = buildCommandMap()

const getPrefix = () => {
    try {
        const saved = global.db?.data?.settings?.prefix
        if (saved !== undefined && saved !== null && saved !== '') return saved
    } catch {}
    return config.prefix
}

const smsg = (conn, m) => {
    if (!m) return m
    const M = m.message
    if (!M) return m

    m.mtype = Object.keys(M).find(k => k !== 'messageContextInfo') || ''
    m.msg = M[m.mtype] || {}

    m.text = m.msg?.text || m.msg?.caption || m.msg?.conversation ||
        (m.mtype === 'conversation' ? M.conversation : '') || ''
    m.mimetype = m.msg?.mimetype || ''
    m.body = m.text

    if (m.msg?.contextInfo?.quotedMessage) {
        const q = m.msg.contextInfo.quotedMessage
        const qtype = Object.keys(q).find(k => k !== 'messageContextInfo') || ''
        const qSender = m.msg.contextInfo.participant || m.msg.contextInfo.remoteJid || m.key?.remoteJid || ''
        m.quoted = {
            id: m.msg.contextInfo.stanzaId,
            sender: qSender,
            text: q[qtype]?.text || q[qtype]?.caption || (qtype === 'conversation' ? q.conversation : '') || '',
            body: q[qtype]?.text || q[qtype]?.caption || (qtype === 'conversation' ? q.conversation : '') || '',
            mimetype: q[qtype]?.mimetype || '',
            mtype: qtype,
            message: q,
            key: {
                remoteJid: m.key?.remoteJid || '',
                id: m.msg.contextInfo.stanzaId || '',
                participant: qSender,
                fromMe: false
            }
        }
    } else {
        m.quoted = null
    }

    m.sender = m.key?.fromMe
        ? (conn.user?.id || '').replace(/:[0-9]+@/, '@')
        : (m.key?.participant || m.key?.remoteJid || '')

    m.chat = m.key?.remoteJid || ''
    m.fromMe = m.key?.fromMe || false
    m.isGroup = m.chat?.endsWith('@g.us') || false
    m.pushName = m.pushName || ''

    return m
}

const checkLimit = (user, isOwner) => {
    return { ok: true }
}

const checkAutoReply = async (conn, m, text) => {
    const autoReplies = global.db?.data?.settings?.autoReplies || {}
    const lower = text.toLowerCase()
    for (const [keyword, response] of Object.entries(autoReplies)) {
        if (lower.includes(keyword.toLowerCase())) {
            await conn.sendMessage(m.chat, { text: response }, { quoted: m })
            return true
        }
    }
    return false
}

// ── Anti-spam tracker (in-memory) ─────────────────────────────────────────
const spamTracker = new Map()
const spamWarned  = new Set()

const checkAntiSpam = async (conn, m, isOwner) => {
    if (!m.isGroup || isOwner || m.fromMe) return false
    const antispamOn = global.db?.data?.settings?.[`antispam_${m.chat}`]
    if (!antispamOn) return false

    const key = `${m.chat}:${m.sender}`
    const now = Date.now()
    const WINDOW = 5000
    const MAX    = 5

    const timestamps = (spamTracker.get(key) || []).filter(t => now - t < WINDOW)
    timestamps.push(now)
    spamTracker.set(key, timestamps)

    if (timestamps.length >= MAX) {
        const num = m.sender.split('@')[0]
        if (spamWarned.has(key)) {
            spamWarned.delete(key)
            spamTracker.delete(key)
            try {
                await conn.sendMessage(m.chat, {
                    text: `🚫 @${num} has been removed for spamming.`,
                    mentions: [m.sender]
                })
                await conn.groupParticipantsUpdate(m.chat, [m.sender], 'remove')
            } catch {}
            return true
        } else {
            spamWarned.add(key)
            setTimeout(() => spamWarned.delete(key), 30000)
            try {
                await conn.sendMessage(m.chat, {
                    text: `⚠️ @${num} — *Slow down!* You're sending messages too fast.\nNext offence: auto-kick.`,
                    mentions: [m.sender]
                })
            } catch {}
        }
    }
    return false
}

// ── In-memory message cache for reaction triggers ─────────────────────────
const msgCache = new Map()
const CACHE_SIZE = 200

const cacheMessage = (m) => {
    if (!m?.key?.id) return
    msgCache.set(m.key.id, {
        text: m.text || '',
        sender: m.sender,
        chat: m.chat,
        hasImage: /image/.test(m.mimetype || ''),
        mimetype: m.mimetype || '',
        msg: m.msg,
        key: m.key,
        message: m.message
    })
    if (msgCache.size > CACHE_SIZE) {
        const oldest = msgCache.keys().next().value
        msgCache.delete(oldest)
    }
}

const handleReaction = async (conn, reactionMsg) => {
    try {
        const rx = reactionMsg?.message?.reactionMessage
        if (!rx?.text) return

        const emoji    = rx.text
        const origId   = rx.key?.id
        const sender   = reactionMsg.key?.participant || reactionMsg.key?.remoteJid || ''
        const chat     = reactionMsg.key?.remoteJid || ''
        if (!origId || !sender || !chat) return

        const orig = msgCache.get(origId)
        if (!orig) return

        const { webSearch }              = require('../Library/actions/search')
        const { translate }              = require('../Library/actions/translate')
        const { generateImage }          = require('../Library/actions/imagegen')
        const { searchAndDownload }      = require('../Library/actions/music')
        const { analyzeImageFromBuffer } = require('../Library/actions/vision')

        const react = (e) => conn.sendMessage(chat, { react: { text: e, key: reactionMsg.key } }).catch(() => {})

        if (emoji === '🌐' && orig.text) {
            await react('⏳')
            const res = await translate(orig.text, 'English')
            if (res.success) {
                await conn.sendMessage(chat, { text: `🌐 *Translated:*\n\n${res.result}` }, { quoted: reactionMsg })
                await react('✅')
            } else await react('❌')

        } else if (emoji === '🎵' && orig.text) {
            await react('⏳')
            const res = await searchAndDownload(orig.text.slice(0, 100))
            if (res.success && res.audioUrl) {
                await conn.sendMessage(chat, {
                    audio: { url: res.audioUrl },
                    mimetype: 'audio/mp4',
                    ptt: false,
                    fileName: `${res.title || 'audio'}.mp3`
                }, { quoted: reactionMsg })
                await react('✅')
            } else await react('❌')

        } else if (emoji === '🎨' && orig.text) {
            await react('⏳')
            const res = await generateImage(orig.text.slice(0, 300))
            if (res.success) {
                const caption = `🎨 *${orig.text.slice(0, 80)}*`
                if (res.buffer) await conn.sendMessage(chat, { image: res.buffer, caption }, { quoted: reactionMsg })
                else if (res.url) await conn.sendMessage(chat, { image: { url: res.url }, caption }, { quoted: reactionMsg })
                await react('✅')
            } else await react('❌')

        } else if (emoji === '👁️' || emoji === '🔍') {
            if (orig.hasImage) {
                await react('⏳')
                try {
                    const buf = await conn.downloadMediaMessage({ key: orig.key, message: orig.message })
                    const res = await analyzeImageFromBuffer(buf, 'Describe and analyse this image in detail.')
                    if (res.success) {
                        await conn.sendMessage(chat, { text: `👁️ *Image Analysis:*\n\n${res.result}` }, { quoted: reactionMsg })
                        await react('✅')
                    } else await react('❌')
                } catch { await react('❌') }
            } else if (orig.text && emoji === '🔍') {
                await react('⏳')
                const res = await webSearch(orig.text.slice(0, 200))
                if (res.success) {
                    await conn.sendMessage(chat, { text: `🔍 *${orig.text.slice(0, 60)}*\n\n${res.result}` }, { quoted: reactionMsg })
                    await react('✅')
                } else await react('❌')
            }
        }
    } catch (e) {
        console.error('[REACTION]', e.message)
    }
}

const checkAntiLink = async (conn, m, text, isOwner) => {
    if (!m.isGroup) return false
    const hasLink = /chat\.whatsapp\.com\//i.test(text)
    if (!hasLink) return false
    const antilinkOn = global.db?.data?.settings?.[`antilink_${m.chat}`]
    if (!antilinkOn) return false
    if (isOwner) return false
    try {
        await conn.sendMessage(m.chat, { delete: m.key })
        await conn.sendMessage(m.chat, {
            text: `⚠️ @${m.sender.split('@')[0]} — Group links are not allowed here.`,
            mentions: [m.sender]
        })
    } catch {}
    return true
}

// ── Anti-ViewOnce: re-send view-once media without restriction ─────────────
const checkAntiViewOnce = async (conn, m) => {
    try {
        const chat   = m.chat
        const raw    = m.message || {}
        // Detect view-once message types
        const voImg  = raw.viewOnceMessage?.message?.imageMessage
                    || raw.viewOnceMessageV2?.message?.imageMessage
                    || raw.viewOnceMessageV2Extension?.message?.imageMessage
        const voVid  = raw.viewOnceMessage?.message?.videoMessage
                    || raw.viewOnceMessageV2?.message?.videoMessage
                    || raw.viewOnceMessageV2Extension?.message?.videoMessage
        const voAud  = raw.viewOnceMessage?.message?.audioMessage
                    || raw.viewOnceMessageV2?.message?.audioMessage
        if (!voImg && !voVid && !voAud) return

        const key = m.isGroup ? `antiviewonce_${chat}` : 'antiviewonce'
        const antivoOn = global.db?.data?.settings?.[key]
        if (!antivoOn) return

        const sender = m.sender || m.key?.participant || m.key?.remoteJid
        const num    = sender?.split('@')[0] || '?'

        await conn.sendMessage(chat, {
            text: `👁️ *Anti-ViewOnce Alert*\n@${num} sent a view-once ${voImg ? 'image' : voVid ? 'video' : 'audio'}:`,
            mentions: [sender]
        })

        // Re-download and re-send without view-once
        const msgForDownload = {
            key: m.key,
            message: raw.viewOnceMessage?.message
                   || raw.viewOnceMessageV2?.message
                   || raw.viewOnceMessageV2Extension?.message
                   || raw
        }
        const buf = await conn.downloadMediaMessage(msgForDownload).catch(() => null)
        if (!buf) return

        if (voImg)      await conn.sendMessage(chat, { image: buf,  caption: '👁️ View-once image (revealed)' }).catch(() => {})
        else if (voVid) await conn.sendMessage(chat, { video: buf,  caption: '👁️ View-once video (revealed)' }).catch(() => {})
        else if (voAud) await conn.sendMessage(chat, { audio: buf,  mimetype: 'audio/ogg; codecs=opus' }).catch(() => {})
    } catch {}
}

// ── Anti-Badwords enforcement ──────────────────────────────────────────────
const checkAntiBadwords = async (conn, m, text, isOwner) => {
    if (!m.isGroup || !text || isOwner) return false
    const antibadOn = global.db?.data?.settings?.[`antibad_${m.chat}`]
    if (!antibadOn) return false
    const badwordList = global.db?.data?.settings?.[`badwords_${m.chat}`] || []
    if (!badwordList.length) return false
    const lower = text.toLowerCase()
    const found = badwordList.find(w => lower.includes(w.toLowerCase()))
    if (!found) return false
    try {
        await conn.sendMessage(m.chat, { delete: m.key })
        await conn.sendMessage(m.chat, {
            text: `🤬 @${m.sender.split('@')[0]} — *Bad word detected* and message removed. Please keep it clean!`,
            mentions: [m.sender]
        })
    } catch {}
    return true
}

// ── Anti-Delete: cache + re-send ───────────────────────────────────────────
const _deletedMsgCache = new Map()
const ANTI_DEL_CACHE_SIZE = 500

const cacheForAntiDelete = (m, chat) => {
    if (!m?.key?.id || !chat) return
    const textContent = m.text || m.body || ''
    const hasMedia = !!(m.mimetype || m.msg?.imageMessage || m.msg?.videoMessage || m.msg?.audioMessage || m.msg?.documentMessage || m.msg?.stickerMessage)
    if (!textContent && !hasMedia) return
    _deletedMsgCache.set(m.key.id, {
        chat,
        sender: m.sender || m.key?.participant || m.key?.remoteJid,
        text: textContent,
        mimetype: m.mimetype,
        hasMedia,
        msg: m.msg || m.message,
        timestamp: Date.now()
    })
    if (_deletedMsgCache.size > ANTI_DEL_CACHE_SIZE) {
        const oldest = _deletedMsgCache.keys().next().value
        _deletedMsgCache.delete(oldest)
    }
}

const handleAntiDelete = async (conn, deleteEvent) => {
    try {
        const keys = deleteEvent?.keys || deleteEvent?.['messages.delete']?.keys || []
        for (const key of keys) {
            const chat  = key.remoteJid
            const msgId = key.id
            if (!chat || !msgId) continue
            const antidelOn = global.db?.data?.settings?.[`antidelete_${chat}`]
                || global.db?.data?.groups?.[chat]?.antidelete
                || global.beraGroupSettings?.[chat]?.antidelete
            if (!antidelOn) continue
            const cached = _deletedMsgCache.get(msgId)
            if (!cached) continue
            const deleterNum = key.participant || key.remoteJid || 'someone'
            const num = cached.sender?.split('@')[0] || 'them'
            const header = `🗑️ *Anti-Delete Alert*\n📌 @${num} deleted a message:\n\n`
            try {
                if (cached.text) {
                    await conn.sendMessage(chat, {
                        text: header + cached.text,
                        mentions: [cached.sender]
                    })
                } else if (cached.hasMedia && cached.msg) {
                    const imgMsg = cached.msg?.imageMessage
                    const vidMsg = cached.msg?.videoMessage
                    const audMsg = cached.msg?.audioMessage
                    const docMsg = cached.msg?.documentMessage
                    const stkMsg = cached.msg?.stickerMessage
                    await conn.sendMessage(chat, { text: header, mentions: [cached.sender] })
                    if (imgMsg)      await conn.sendMessage(chat, { image: imgMsg,  caption: '🗑️ Deleted image' }).catch(() => {})
                    else if (vidMsg) await conn.sendMessage(chat, { video: vidMsg,  caption: '🗑️ Deleted video' }).catch(() => {})
                    else if (audMsg) await conn.sendMessage(chat, { audio: audMsg,  mimetype: 'audio/ogg; codecs=opus' }).catch(() => {})
                    else if (docMsg) await conn.sendMessage(chat, { document: docMsg, fileName: docMsg.fileName || 'file' }).catch(() => {})
                    else if (stkMsg) await conn.sendMessage(chat, { sticker: stkMsg }).catch(() => {})
                }
            } catch {}
        }
    } catch {}
}

// ── Anti-Edit: reveal original when someone edits a message ───────────────
const handleAntiEdit = async (conn, updateEvent) => {
    try {
        const updates = updateEvent?.updates || updateEvent || []
        for (const update of updates) {
            const chat = update?.key?.remoteJid
            if (!chat) continue
            const antieditOn = global.db?.data?.settings?.[`antiedit_${chat}`]
                || global.db?.data?.groups?.[chat]?.antiedit
            if (!antieditOn) continue
            const editContent = update?.update?.message?.editedMessage || update?.message?.editedMessage
            if (!editContent) continue
            const origId   = editContent?.message?.protocolMessage?.key?.id
                           || editContent?.protocolMessage?.key?.id
            const newText  = editContent?.message?.conversation
                           || editContent?.message?.extendedTextMessage?.text
                           || editContent?.conversation
                           || editContent?.extendedTextMessage?.text
            if (!newText) continue
            const cached  = origId ? _deletedMsgCache.get(origId) : null
            const sender  = update?.key?.participant || update?.key?.remoteJid
            const num     = sender?.split('@')[0] || '?'
            const origTxt = cached?.text || '_(original not cached)_'
            await conn.sendMessage(chat, {
                text: `✏️ *Anti-Edit Alert*\n@${num} edited their message:\n\n*Before:* ${origTxt}\n*After:* ${newText}`,
                mentions: [sender]
            })
        }
    } catch {}
}

const handleGroupEvents = async (conn, event) => {
    try {
        const updates = event['group-participants.update']
        if (!updates) return
        for (const update of updates) {
            const { id: chat, participants, action } = update

            // ── Welcome / Goodbye ───────────────────────────────────────────
            if (action === 'add') {
                const welcomeOn = global.db?.data?.settings?.[`welcome_${chat}`]
                    || global.db?.data?.groups?.[chat]?.welcome
                if (welcomeOn) {
                    for (const jid of participants) {
                        const name = jid.split('@')[0]
                        try {
                            const meta = await conn.groupMetadata(chat)
                            const customMsg = global.db?.data?.settings?.[`welcomemsg_${chat}`]
                                || global.beraGroupSettings?.[chat]?.welcome
                            const msg = customMsg
                                ? customMsg.replace('{name}', `@${name}`).replace('{group}', meta.subject).replace('{count}', meta.participants.length)
                                : `👋 Welcome @${name} to *${meta.subject}*!\n\nWe're glad to have you here. Feel free to introduce yourself!`
                            await conn.sendMessage(chat, { text: msg, mentions: [jid] })
                        } catch {}
                    }
                }
            }

            if (action === 'remove') {
                const byeOn = global.db?.data?.settings?.[`bye_${chat}`]
                    || global.db?.data?.groups?.[chat]?.bye
                if (byeOn) {
                    for (const jid of participants) {
                        const name = jid.split('@')[0]
                        try {
                            const meta = await conn.groupMetadata(chat)
                            const customMsg = global.db?.data?.settings?.[`byemsg_${chat}`]
                                || global.beraGroupSettings?.[chat]?.bye
                            const msg = customMsg
                                ? customMsg.replace('{name}', `@${name}`).replace('{group}', meta.subject)
                                : `👋 *${name}* has left *${meta.subject}*. Goodbye!`
                            await conn.sendMessage(chat, { text: msg, mentions: [jid] })
                        } catch {}
                    }
                }
            }

            // ── Anti-Promote: reverse unauthorized admin grants ─────────────
            if (action === 'promote') {
                const antiprOn = global.db?.data?.settings?.[`antipromote_${chat}`]
                if (!antiprOn) continue
                try {
                    const meta  = await conn.groupMetadata(chat)
                    const botJid = conn.user?.id?.split(':')[0] + '@s.whatsapp.net'
                    const botIsAdmin = meta.participants.some(p => p.id === botJid && p.admin)
                    if (!botIsAdmin) continue
                    for (const jid of participants) {
                        await conn.groupParticipantsUpdate(chat, [jid], 'demote')
                        await conn.sendMessage(chat, {
                            text: `🚫 *Anti-Promote*: @${jid.split('@')[0]} was promoted without authorization — demoted back.`,
                            mentions: [jid]
                        })
                    }
                } catch {}
            }

            // ── Anti-Demote: reverse unauthorized admin removal ─────────────
            if (action === 'demote') {
                const antidmOn = global.db?.data?.settings?.[`antidemote_${chat}`]
                if (!antidmOn) continue
                try {
                    const meta  = await conn.groupMetadata(chat)
                    const botJid = conn.user?.id?.split(':')[0] + '@s.whatsapp.net'
                    const botIsAdmin = meta.participants.some(p => p.id === botJid && p.admin)
                    if (!botIsAdmin) continue
                    for (const jid of participants) {
                        await conn.groupParticipantsUpdate(chat, [jid], 'promote')
                        await conn.sendMessage(chat, {
                            text: `🚫 *Anti-Demote*: @${jid.split('@')[0]} was demoted without authorization — restored to admin.`,
                            mentions: [jid]
                        })
                    }
                } catch {}
            }
        }
    } catch {}
}

// ── DB write debounce — batch writes instead of writing on every command ───
let dbWriteTimer = null
const debouncedDbWrite = () => {
    if (dbWriteTimer) clearTimeout(dbWriteTimer)
    dbWriteTimer = setTimeout(async () => {
        try { await global.db.write() } catch {}
    }, 2000)
}

const handleMessage = async (conn, rawMsg) => {
    try {
        const m = smsg(conn, rawMsg)
        if (!m || !m.message) return

        // ── DROP OLD / DUPLICATE MESSAGES ─────────────────────────────────────
        // Skip any message that arrived before the bot connected (replayed history)
        const msgTime = m.messageTimestamp || rawMsg.messageTimestamp || 0
        const readyAt = global.botReadyAt || 0
        if (msgTime && readyAt && msgTime < readyAt - 5) return

        // Skip duplicates (WhatsApp sometimes fires upsert twice for same msg)
        const msgId = rawMsg.key?.id
        if (msgId) {
            if (_seenMsgIds.has(msgId)) return
            _seenMsgIds.add(msgId)
            if (_seenMsgIds.size > 500) {
                const first = _seenMsgIds.values().next().value
                _seenMsgIds.delete(first)
            }
        }

        // ── INTERACTIVE BUTTON CLICK HANDLER ─────────────────────────────────
        // When user taps a quick_reply/cta button, WA sends interactiveResponseMessage
        const irm = m.message?.interactiveResponseMessage
        if (irm) {
            try {
                const nfr    = irm.nativeFlowResponseMessage
                const body   = irm.body?.text || ''
                const params = nfr?.paramsJson ? JSON.parse(nfr.paramsJson) : {}
                const btnId  = params.id || body || ''
                const { sendButtons }                         = require('gifted-btns')
                const { setBtnMode }                          = require('../Library/actions/btnmode')
                const { downloadAudio, downloadVideo }        = require('../Library/actions/music')
                const pref   = global.prefix || '.'

                // ─── Button Mode toggle ────────────────────────────────────────────
                if (btnId.startsWith('btns_off_') && btnId !== 'btns_off_keep') {
                    setBtnMode(btnId.slice('btns_off_'.length), false)
                    await conn.sendMessage(m.chat, { text: 'Buttons OFF for this chat. Commands will use plain text.' }, { quoted: m }).catch(() => {})
                    return
                }
                if (btnId.startsWith('btns_on_') && btnId !== 'btns_on_keep') {
                    setBtnMode(btnId.slice('btns_on_'.length), true)
                    await conn.sendMessage(m.chat, { text: 'Buttons ON for this chat. Commands will use interactive buttons!' }, { quoted: m }).catch(() => {})
                    return
                }
                if (btnId === 'btns_on_keep' || btnId === 'btns_off_keep') {
                    await conn.sendMessage(m.chat, { text: 'Button mode kept as-is.' }, { quoted: m }).catch(() => {})
                    return
                }

                // ─── play_pick: user selected a track → show format buttons ──────────
                if (btnId.startsWith('play_pick_')) {
                    const segs5  = btnId.split('_')
                    const idx5   = parseInt(segs5[2]) || 0
                    const url5   = decodeURIComponent(segs5.slice(3).join('_'))
                    const track5 = global.beraPlaySearch?.[m.chat]?.[idx5]
                    const name5  = track5?.title || 'Track ' + (idx5 + 1)
                    return sendButtons(conn, m.chat, {
                        title:   'Choose Format',
                        text:    'Pick a format for: ' + name5.slice(0, 45),
                        footer:  'Tap to download',
                        buttons: [
                            { id: 'yt_audio_' + encodeURIComponent(url5), text: 'Audio Only (MP3)' },
                            { id: 'yt_video_' + encodeURIComponent(url5), text: 'Video + Sound (MP4)' },
                            { id: 'yt_360_'   + encodeURIComponent(url5), text: 'Video 360p' },
                            { id: 'yt_720_'   + encodeURIComponent(url5), text: 'Video 720p (HD)' },
                            { id: 'play_cancel', text: 'Cancel' },
                        ]
                    })
                }

                // ─── Cancel ───────────────────────────────────────────────────────────
                if (btnId === 'play_cancel') {
                    await conn.sendMessage(m.chat, { text: 'Search cancelled.' }, { quoted: m }).catch(() => {})
                    return
                }

                // ─── Copy button ──────────────────────────────────────────────────────
                if (btnId.startsWith('copy_')) {
                    const stored = global.beraLastOutput?.[m.chat]
                    await conn.sendMessage(m.chat, { text: stored ? 'Copy below: ' + stored : 'Tap and hold the original message to copy!' }, { quoted: m }).catch(() => {})
                    return
                }

                // ─── YOUTUBE format buttons: download directly via music library ──────
                // yt_audio_ → download as MP3 and send (same as what .play does internally)
                // yt_video_ / yt_360_ / yt_720_ → download as video and send
                if (/^yt_/.test(btnId)) {
                    const segs   = btnId.split('_')
                    const action = segs[1]
                    const ytUrl  = decodeURIComponent(segs.slice(2).join('_'))
                    await conn.sendMessage(m.chat, { react: { text: '⏳', key: m.key } }).catch(() => {})
                    if (action === 'audio') {
                        const dl = await downloadAudio(ytUrl)
                        if (!dl.success) {
                            await conn.sendMessage(m.chat, { text: 'Download failed: ' + (dl.error || 'unknown error') }, { quoted: m }).catch(() => {})
                            await conn.sendMessage(m.chat, { react: { text: '❌', key: m.key } }).catch(() => {})
                        } else {
                            if (dl.thumbnail) {
                                await conn.sendMessage(m.chat, { image: { url: dl.thumbnail }, caption: 'Now Playing: ' + dl.title }).catch(() => {})
                            }
                            await conn.sendMessage(m.chat, { audio: { url: dl.url || dl.audioUrl }, mimetype: 'audio/mpeg', fileName: (dl.title || 'audio') + '.mp3' }, { quoted: m }).catch(() => {})
                            await conn.sendMessage(m.chat, { react: { text: '✅', key: m.key } }).catch(() => {})
                        }
                    } else {
                        const dl = await downloadVideo(ytUrl)
                        if (!dl.success) {
                            await conn.sendMessage(m.chat, { text: 'Download failed: ' + (dl.error || 'unknown error') }, { quoted: m }).catch(() => {})
                            await conn.sendMessage(m.chat, { react: { text: '❌', key: m.key } }).catch(() => {})
                        } else {
                            await conn.sendMessage(m.chat, { video: { url: dl.url }, caption: (dl.title || '') + ' (' + action + ')' }, { quoted: m }).catch(() => {})
                            await conn.sendMessage(m.chat, { react: { text: '✅', key: m.key } }).catch(() => {})
                        }
                    }
                    return
                }

                // ─── Other platform buttons: inject as command and dispatch ────────────
                // All platform buttons (tiktok/ig/fb/twitter/spotify) pass URL to command
                if (/^(tt|sp|ig|fb|tw)_/.test(btnId)) {
                    const segs   = btnId.split('_')
                    const src2   = segs[0]
                    const action = segs[1]
                    const url2   = decodeURIComponent(segs.slice(2).join('_'))

                    // sp_open: just send the link, no download needed
                    if (src2 === 'sp' && action === 'open') {
                        await conn.sendMessage(m.chat, { text: 'Open Spotify: ' + url2 }, { quoted: m }).catch(() => {})
                        return
                    }
                    // sp_info: send track info link
                    if (src2 === 'sp' && action === 'info') {
                        await conn.sendMessage(m.chat, { text: 'Track link: ' + url2 }, { quoted: m }).catch(() => {})
                        return
                    }

                    // All other platform buttons map to a download command
                    const cmdMap = {
                        tt: { audio: 'tiktok', video: 'tiktok', nowm: 'tiktok', thumb: 'tiktok' },
                        sp: { dl: 'spotify' },
                        ig: { photo: 'ig', reel: 'ig', story: 'ig', video: 'ig' },
                        fb: { hd: 'fb', sd: 'fb', mp3: 'fb' },
                        tw: { hd: 'twitter', sd: 'twitter', video: 'twitter', gif: 'twitter', mp3: 'twitter' }
                    }
                    const cmd = cmdMap[src2]?.[action]
                    if (cmd && url2) {
                        m.text = pref + cmd + " " + url2
                        m.body = m.text
                        rawMsg.message.conversation = m.text
                        // fall through to command dispatch
                    }
                }

                // ─── WARN action buttons ──────────────────────────────────────────────
                if (btnId.startsWith('warn_')) {
                    const segs4   = btnId.split('_')
                    const action4 = segs4[1]
                    const jid4    = segs4.slice(2).join('_')
                    const warns4  = global.beraWarns || (global.beraWarns = {})
                    const wkey    = m.chat + '_' + jid4
                    if (action4 === 'forgive') {
                        warns4[wkey] = Math.max(0, (warns4[wkey] || 1) - 1)
                        await conn.sendMessage(m.chat, { text: 'Warning removed for @' + jid4.split('@')[0], mentions: [jid4] }).catch(() => {})
                    } else if (action4 === 'kick') {
                        await conn.groupParticipantsUpdate(m.chat, [jid4], 'remove').catch(async () => {
                            await conn.sendMessage(m.chat, { text: 'Could not kick - bot needs admin.' })
                        })
                    } else if (action4 === 'mute') {
                        await conn.sendMessage(m.chat, { text: 'Mute noted for @' + jid4.split('@')[0], mentions: [jid4] }).catch(() => {})
                    }
                    return
                }

                // ─── Generic: prefix-based command button ─────────────────────────────
                if (btnId && btnId.startsWith(pref)) {
                    m.text = btnId
                    m.body = btnId
                    rawMsg.message.conversation = btnId
                }
            } catch (e) {
                console.error('[BtnHandler]', e?.message || e)
            }
        }

        // ── AUTO STATUS VIEW & LIKE ─────────────────────────────────────
        if (m.key && m.key.remoteJid === 'status@broadcast') {
            const stSettings = global.db?.data?.settings || {}
            if (stSettings.autoStatusView) {
                conn.readMessages([m.key]).catch(() => {})
            }
            if (stSettings.autoStatusLike) {
                                const emojiList  = stSettings.statusLikeEmojis
                const likeEmoji  = Array.isArray(emojiList) && emojiList.length
                    ? emojiList[Math.floor(Math.random() * emojiList.length)]
                    : (stSettings.statusLikeEmoji || '❤️')
                const participant = m.key.participant || m.sender || m.key.remoteJid
                conn.sendMessage('status@broadcast',
                    { react: { text: likeEmoji, key: m.key } },
                    { statusJidList: [participant, conn.user?.id].filter(Boolean) }
                ).catch(() => {})
            }
            return
        }

        // Handle reaction messages separately
        if (m.mtype === 'reactionMessage') {
            handleReaction(conn, rawMsg).catch(() => {})
            return
        }

        // Voice notes are NOT auto-transcribed — user must explicitly request it.
        // Use: .transcribe (while quoting a voice note)
        //  or: quote the voice note and say "bera transcribe this"

        const prefix = getPrefix()
        const noPrefix = global.db?.data?.settings?.noPrefix || false
        const rawText = m.text?.trim() || ''

        // fromMe guard
        if (m.fromMe) {
            const firstWord = rawText.split(/\s+/)[0].toLowerCase()
            const noPrefixHit = noPrefix && commandMap.has(firstWord)
            if (!rawText.startsWith(prefix) && !noPrefixHit) return
        }

        if (!m.text?.trim() && !m.mimetype) return

        // Cache for reaction triggers
        cacheMessage(m)

        const sender = m.sender
        const chat = m.chat

        const { authorized, isOwner } = isAuthorized(sender)

        const existingUser = global.db?.data?.users?.[sender]
        if (existingUser?.banned) return

        let text = m.text?.trim() || ''

        // Command detection
        let isCmd, command, args, body
        if (text.startsWith(prefix) && prefix !== '') {
            isCmd = true
            command = text.slice(prefix.length).trim().split(/\s+/)[0].toLowerCase()
            body    = text.slice(prefix.length + command.length).trim()
            args    = body.split(/\s+/).filter(Boolean)
        } else if (noPrefix && text) {
            const firstWord = text.split(/\s+/)[0].toLowerCase()
            if (commandMap.has(firstWord)) {
                isCmd   = true
                command = firstWord
                body    = text.slice(firstWord.length).trim()
                args    = body.split(/\s+/).filter(Boolean)
            } else {
                isCmd = false; command = ''; args = []; body = ''
            }
        } else {
            isCmd = false; command = ''; args = []; body = ''
        }

        // ── .agent INTERCEPT: route through the full intent system first ──────────
        // When the user types ".agent <task>", we detect the intent of <task>.
        // If it's an actionable intent (not generic chat/AI), we skip bera.js and
        // run it through the same intent engine that "Bera ..." messages use.
        // This is what makes ".agent send X to 254xxx", ".agent kick @user" etc. work.
        let _agentForceMode = false
        const _PASSTHROUGH_INTENTS = new Set(['chat', 'agent', 'menu', 'search', 'wiki',
            'weather', 'define', 'translate', 'code_review', 'code_explain', 'bug_finder',
            'code_gen', 'image_gen', 'music', 'yt_audio', 'yt_video', 'download',
            'lyrics', 'media_lyrics', 'fun_joke', 'fun_fact', 'fun_quote', 'fun_coin',
            'fun_8ball', 'fun_truth', 'fun_dare', 'fun_ship', 'fun_trivia', 'fun_roast',
            'fun_story', 'fun_rap', 'fun_riddle', 'fun_motivate', 'gen_password'])
        if (isCmd && command === 'agent' && body && authorized) {
            const { detectIntent: _di } = require('../Library/router')
            const _preIntent = _di(body)
            if (!_PASSTHROUGH_INTENTS.has(_preIntent)) {
                // Actionable intent detected — redirect through the intent engine
                text = body
                isCmd = false
                command = ''; args = []; body = ''
                _agentForceMode = true
            }
        }

        // ── NON-COMMAND: only do lightweight group checks, then exit ──────
        if (!isCmd) {
            // ── PRIVATE MODE GATE: if bot is private, non-owners get NO response ──
            // This blocks Bera Agent, ChatBera AI, auto-reply, and all NLP responses
            // for anyone who isn't the owner. Silent exit — no message sent.
            if (!authorized) return

            // Anti-viewonce (groups + DMs)
            await checkAntiViewOnce(conn, m)

            // Anti-spam / anti-link / anti-badwords for group messages
            if (m.isGroup) {
                cacheForAntiDelete(m, chat)
                const spammed = await checkAntiSpam(conn, m, isOwner)
                if (spammed) return
                await checkAntiLink(conn, m, text, isOwner)
                const badword = await checkAntiBadwords(conn, m, text, isOwner)
                if (badword) return
            }
            // Auto-reply (DM and group)
            // Auto-reply (DM and group)
            await checkAutoReply(conn, m, text)


            // ── GitHub Download — DMs only (groups: command prefix required) ────
            const ghUrlMatch = !m.isGroup && text && text.match(/https?:\/\/github\.com\/[\w.\-]+\/[\w.\-]+(?:\/[^\s]*)*/i)
            const ghDownloadIntent = text && /\b(download|get|send|fetch|grab|zip|clone|dl)\b/i.test(text)
            if (ghUrlMatch && (ghDownloadIntent || /github\.com\/[\w.\-]+\/[\w.\-]+\/blob\//.test(text))) {
                const ghUrl = ghUrlMatch[0]
                const isFile = ghUrl.includes('/blob/')
                try {
                    await conn.sendMessage(chat, { react: { text: '⏳', key: m.key } })
                    const makeReq = (urlStr) => new Promise((resolve, reject) => {
                        const u = new URL(urlStr)
                        const req = require('https').request({ hostname: u.hostname, path: u.pathname + u.search, headers: { 'User-Agent': 'Bera-AI' } }, res => {
                            if ((res.statusCode === 301 || res.statusCode === 302) && res.headers.location) return resolve(makeReq(res.headers.location))
                            if (res.statusCode !== 200) return reject(new Error('HTTP ' + res.statusCode))
                            const chunks = []; res.on('data', c => chunks.push(c)); res.on('end', () => resolve(Buffer.concat(chunks)))
                        })
                        req.on('error', reject); req.setTimeout(60000, () => { req.destroy(); reject(new Error('timeout')) }); req.end()
                    })
                    let buf, fileName, mimetype, caption
                    if (isFile) {
                        const rawUrl = ghUrl.replace('github.com', 'raw.githubusercontent.com').replace('/blob/', '/')
                        fileName = rawUrl.split('/').pop()
                        buf = await makeReq(rawUrl)
                        mimetype = 'application/octet-stream'
                        caption = '📄 *' + fileName + '*\n🔗 ' + ghUrl
                    } else {
                        const parts = ghUrl.replace('https://github.com/', '').split('/')
                        const owner = parts[0]; const repo = (parts[1] || '').replace('.git', '')
                        if (!owner || !repo) throw new Error('Invalid repo URL')
                        const branch = parts[3] || 'main'
                        const zipUrl = 'https://github.com/' + owner + '/' + repo + '/archive/refs/heads/' + branch + '.zip'
                        fileName = repo + '.zip'; mimetype = 'application/zip'
                        buf = await makeReq(zipUrl)
                        caption = '📦 *' + owner + '/' + repo + '* (' + branch + ')\n📏 ' + (buf.length / 1024).toFixed(1) + ' KB\n🔗 ' + ghUrl
                    }
                    await conn.sendMessage(chat, { react: { text: '✅', key: m.key } })
                    await conn.sendMessage(chat, { document: buf, fileName, mimetype, caption }, { quoted: m })
                } catch (e) {
                    await conn.sendMessage(chat, { react: { text: '❌', key: m.key } })
                    await conn.sendMessage(chat, { text: '❌ Download failed: ' + e.message }, { quoted: m })
                }
                return
            }
            // ═══════════════════════════════════════════════════════════════
            // BERA AGENT — Full Intent Router (fires before ChatBera)
            // Only fires when "bera" is said OR bot is @mentioned — in both
            // DMs and groups. Never fires on random messages.
            // ═══════════════════════════════════════════════════════════════
            const _agentMentioned = (m.message?.extendedTextMessage?.contextInfo?.mentionedJid || []).some(j => j === conn.user?.id)
            // Toggle: settings.beraTrigger (default ON). When false, "bera/agent <text>" without prefix is ignored.
            const _beraTriggerOn   = global.db?.data?.settings?.beraTrigger !== false
            // Fires when message contains "bera" OR "agent" as a trigger word (no dot required)
            const _agentBeraCall  = _beraTriggerOn && text && /\b(bera|agent)\b/i.test(text)
            // _agentForceMode: set when user used .agent <task> and we intercepted it above
            const _agentAllowed   = _agentMentioned || _agentBeraCall || _agentForceMode
            if ((!m.fromMe || _agentForceMode) && text && _agentAllowed) {
                const { detectIntent } = require('../Library/router')
                // Strip the trigger word ("bera" or "agent") from the start of the text
                // so "agent kick @user" → detectIntent("kick @user") → 'kick_user' (not 'agent')
                const _taskText = text.replace(/^\s*(bera|agent)\s+/i, '').trim() || text
                const intent = detectIntent(_taskText)
                // Use the stripped text inside all handlers for accurate parsing
                text = _taskText
                const agent  = require('../Library/actions/agent')
                const react  = (e) => conn.sendMessage(chat, { react: { text: e, key: m.key } }).catch(() => {})
                const reply  = (t) => conn.sendMessage(chat, { text: String(t) }, { quoted: m })
                const fmt    = (lines) => lines.split('\n').slice(0, 30).map(l => '┃ ' + l.slice(0, 90)).join('\n')


                // ─────────────────────────────────────────────────────────────────




                if (intent === 'bh_clone') {
                    if (!isOwner) { await reply('Owner only.'); return }
                    const bh = require('../Library/actions/berahost')
                    const words = text.split(/\s+/)
                    const skipWords = ['clone','redeploy','copy','duplicate','deploy','bot','server','for','as','named','called','to']
                    const nameCandidate = words.find(w => !skipWords.includes(w.toLowerCase()) && w.length > 2 && /^[a-zA-Z0-9-]+$/.test(w))
                    const phoneMatch = text.match(/(\d{6,15})/)
                    const newNameMatch = text.match(/(?:as|to)\s+([\w-]+)/i)
                    if (!nameCandidate) { await reply('Usage: deploy bot atassa  or  clone server atassa for 254712345678'); return }
                    await react('🔄'); await reply('Cloning server "' + nameCandidate + '"...')
                    const r = await bh.cloneServer(nameCandidate, phoneMatch ? phoneMatch[1] : null, newNameMatch ? newNameMatch[1] : null)
                    if (r.success) {
                        await react('✅')
                        await reply('SUCCESS\n' + r.message)
                        if (phoneMatch) {
                            await conn.sendMessage(phoneMatch[1] + '@s.whatsapp.net', { text: 'YOUR BOT IS READY!\n' + r.message + '\nPanel: ' + bh.PANEL }).catch(()=>{})
                        }
                    } else { await react('❌'); await reply('Clone failed: ' + r.error) }
                    return
                }

                if (intent === 'bh_files') {
                    if (!isOwner) { await reply('Owner only.'); return }
                    const bh = require('../Library/actions/berahost')
                    const onMatch  = text.match(/(?:on|from|in)\s+(?:server\s+)?([\w-]+)/i)
                    const fileMatch = text.match(/(?:read|cat|get)\s+([\w/.~-]+\.\w+)/i)
                    const dirMatch  = text.match(/(?:ls|list|dir)\s+([\w/.~-]+)/i)
                    if (!onMatch) { await reply('Usage: list files on server atassa  or  read session/creds.json on atassa'); return }
                    const srvName = onMatch[1]
                    await react('📁')
                    if (fileMatch) {
                        const r = await bh.readServerFile(srvName, fileMatch[1])
                        await reply(r.success ? r.content.slice(0,3000) : 'Error: ' + r.error)
                    } else {
                        const dir = dirMatch ? dirMatch[1] : '/'
                        const r   = await bh.listServerFiles(srvName, dir)
                        if (r.success) { await reply(r.files.map(f=>(f.isDir?'📁 ':'📄 ')+f.name+' ('+f.size+')').join('\n').slice(0,2000)) }
                        else { await reply('Error: ' + r.error) }
                    }
                    return
                }

                if (intent === 'bh_owner_list') {
                    if (!isOwner) { await reply('Owner only.'); return }
                    const bh = require('../Library/actions/berahost')
                    const pm = text.match(/(\d{6,15})/)
                    await react('📋')
                    const r = pm ? await bh.listOwnerServers(pm[1]) : await bh.listServers()
                    if (r.success) {
                        const srvs = r.servers || []
                        const rows = srvs.map(s => s.id + ' | ' + s.name + ' | ' + s.ram + 'MB').join('\n')
                        await reply('Servers (' + srvs.length + '):\n' + (rows || 'None found'))
                    } else { await reply('Error: ' + r.error) }
                    return
                }

                if (intent === 'bh_reinstall') {
                    if (!isOwner) { await reply('Owner only.'); return }
                    const bh = require('../Library/actions/berahost')
                    const nm = text.match(/(?:reinstall|clean install)\s+(?:server\s+)?([\w-]+)/i) || text.match(/server\s+([\w-]+)/i)
                    if (!nm) { await reply('Usage: reinstall server atassa'); return }
                    await react('🔧')
                    const r = await bh.reinstallServer(nm[1])
                    await reply(r.success ? r.output : 'Error: ' + r.error)
                    return
                }

                if (intent === 'bh_suspend') {
                    if (!isOwner) { await reply('Owner only.'); return }
                    const bh = require('../Library/actions/berahost')
                    const nm = text.match(/(?:suspend|disable|freeze)\s+(?:server\s+)?([\w-]+)/i)
                    if (!nm) { await reply('Usage: suspend server atassa'); return }
                    await react('🚫')
                    const r = await bh.suspendServer(nm[1])
                    await reply(r.success ? r.output : 'Error: ' + r.error)
                    return
                }

                if (intent === 'bh_unsuspend') {
                    if (!isOwner) { await reply('Owner only.'); return }
                    const bh = require('../Library/actions/berahost')
                    const nm = text.match(/(?:unsuspend|enable|restore)\s+(?:server\s+)?([\w-]+)/i)
                    if (!nm) { await reply('Usage: unsuspend server atassa'); return }
                    await react('✅')
                    const r = await bh.unsuspendServer(nm[1])
                    await reply(r.success ? r.output : 'Error: ' + r.error)
                    return
                }

                if (intent === 'bh_upgrade') {
                    if (!isOwner) { await reply('Owner only.'); return }
                    const bh = require('../Library/actions/berahost')
                    const nm   = text.match(/(?:server|bot)\s+([\w-]+)/i)
                    const ram  = text.match(/(\d{3,5})\s*mb?\s*ram/i)
                    const cpu  = text.match(/(\d{1,4})\s*%?\s*cpu/i)
                    const disk = text.match(/(\d{3,6})\s*mb?\s*disk/i)
                    if (!nm) { await reply('Usage: upgrade server atassa 1024MB RAM 200% CPU'); return }
                    await react('⬆️')
                    const r = await bh.updateResources(nm[1], { ramMB: ram?parseInt(ram[1]):undefined, cpuPercent: cpu?parseInt(cpu[1]):undefined, diskMB: disk?parseInt(disk[1]):undefined })
                    await reply(r.success ? r.output : 'Error: ' + r.error)
                    return
                }

                if (intent === 'bh_console') {
                    if (!isOwner) { await reply('Owner only.'); return }
                    const bh = require('../Library/actions/berahost')
                    const nm = text.match(/(?:on|in)\s+(?:server\s+)?([\w-]+)/i)
                    const cm = text.match(/(?:run|send|command)\s+"([^"]+)"/i) || text.match(/(?:run|send|command)\s+([^\s].+)$/i)
                    if (!nm || !cm) { await reply('Usage: run command "npm restart" on server atassa'); return }
                    await react('💻')
                    const r = await bh.sendConsoleCommand(nm[1], cm[1])
                    await reply(r.success ? r.output : 'Error: ' + r.error)
                    return
                }

                if (intent === 'bh_server_info') {
                    if (!isOwner) { await reply('Owner only.'); return }
                    const bh = require('../Library/actions/berahost')
                    const nm = text.match(/(?:server|bot|info|details|config)\s+([\w-]+)/i)
                    if (!nm) { await reply('Usage: server info atassa'); return }
                    await react('ℹ️')
                    const r = await bh.getServerConfig(nm[1])
                    if (r.success) {
                        const envStr = Object.entries(r.environment||{}).slice(0,8).map(([k,v])=>k+'='+(v||'').toString().slice(0,30)).join('\n')
                        await reply(r.name + ' (ID '+r.id+')\nStatus: ' + r.status + '\nRAM: ' + r.limits?.memory + 'MB | CPU: ' + r.limits?.cpu + '% | Disk: ' + r.limits?.disk + 'MB\n\nENV:\n' + envStr)
                    } else { await reply('Error: ' + r.error) }
                    return
                }

                if (intent === 'bh_set_client_key') {
                    if (!isOwner) { await reply('Owner only.'); return }
                    const km = text.match(/ptlc_[\w]+/)
                    if (!km) { await reply('Usage: setbhclientkey ptlc_yourKey\n\nGet it from: https://lordeagle.tech/account/api'); return }
                    if (!global.db.data.settings) global.db.data.settings = {}
                    global.db.data.settings.bhClientKey = km[0]
                    await global.db.write()
                    await reply('BeraHost client key saved! File manager + console commands are now unlocked.')
                    return
                }
                if (intent === 'bh_deploy') {
                    if (!isOwner) { await reply('Owner only.'); return }
                    const bhr = require('../Library/actions/berahost')
                    const botM = text.match(/\b(\d+)\b/)
                    const sessM = text.match(/([A-Za-z][A-Za-z0-9_~:;.]{8,})/)
                    if (!botM || !sessM) { await reply('Usage: deploy bot 1 Gifted~yourSession'); return }
                    await react('🚀'); await reply('Deploying bot ' + botM[1] + '...')
                    const dr = await bhr.deployBot(botM[1], sessM[1])
                    if (!dr.success) { await react('❌'); await reply('Deploy failed: ' + dr.error); return }
                    await reply('Deployment ' + dr.id + ' started — polling...')
                    const fin = await bhr.pollDeployment(dr.id)
                    const dep = fin.deployment || {}
                    await react(dep.status === 'running' ? '✅' : '⚠️')
                    await reply(bhr.fmtDeploy(dep))
                    return
                }
                if (intent === 'bh_list_deploys') {
                    if (!isOwner) { await reply('Owner only.'); return }
                    const bhr = require('../Library/actions/berahost')
                    await react('📋')
                    const r = await bhr.listDeployments()
                    if (!r.success) { await reply('Error: ' + r.error); return }
                    const rows = r.deployments.map((d,i) => (i+1) + '. ID ' + d.id + ' | ' + bhr.statusEmoji(d.status)).join('\n')
                    await reply('My Deployments:\n' + (rows || 'None'))
                    return
                }
                if (intent === 'bh_start_deploy') {
                    if (!isOwner) { await reply('Owner only.'); return }
                    const bhr = require('../Library/actions/berahost')
                    const idM = text.match(/\b(\d+)\b/)
                    if (!idM) { await reply('Usage: start deployment 5'); return }
                    await react('▶️')
                    const r = await bhr.startDeployment(idM[1])
                    await reply(r.success ? r.output : 'Error: ' + r.error)
                    return
                }
                if (intent === 'bh_stop_deploy') {
                    if (!isOwner) { await reply('Owner only.'); return }
                    const bhr = require('../Library/actions/berahost')
                    const idM = text.match(/\b(\d+)\b/)
                    if (!idM) { await reply('Usage: stop deployment 5'); return }
                    await react('⏹️')
                    const r = await bhr.stopDeployment(idM[1])
                    await reply(r.success ? r.output : 'Error: ' + r.error)
                    return
                }
                if (intent === 'bh_get_logs') {
                    if (!isOwner) { await reply('Owner only.'); return }
                    const bhr = require('../Library/actions/berahost')
                    const idM = text.match(/\b(\d+)\b/)
                    if (!idM) { await reply('Usage: logs for deployment 5'); return }
                    await react('📄')
                    const r = await bhr.getDeploymentLogs(idM[1])
                    await reply(r.success ? (r.logs||'No logs yet').slice(-3000) : 'Error: ' + r.error)
                    return
                }
                if (intent === 'bh_get_metrics') {
                    if (!isOwner) { await reply('Owner only.'); return }
                    const bhr = require('../Library/actions/berahost')
                    const idM = text.match(/\b(\d+)\b/)
                    if (!idM) { await reply('Usage: metrics for deployment 5'); return }
                    await react('📊')
                    const r = await bhr.getDeploymentMetrics(idM[1])
                    await reply(r.success ? 'CPU: '+r.cpu+'\nRAM: '+r.ram+'\nUptime: '+r.uptime : 'Error: '+r.error)
                    return
                }
                if (intent === 'bh_del_deploy') {
                    if (!isOwner) { await reply('Owner only.'); return }
                    const bhr = require('../Library/actions/berahost')
                    const idM = text.match(/\b(\d+)\b/)
                    if (!idM) { await reply('Usage: delete deployment 5'); return }
                    await react('🗑️')
                    const r = await bhr.deleteDeployment(idM[1])
                    await reply(r.success ? r.output : 'Error: ' + r.error)
                    return
                }
                if (intent === 'bh_coins') {
                    if (!isOwner) { await reply('Owner only.'); return }
                    const bhr = require('../Library/actions/berahost')
                    await react('🪙')
                    const r = await bhr.getCoins()
                    await reply(r.success ? '🪙 Balance: ' + r.balance + ' coins' : 'Error: ' + r.error)
                    return
                }
                if (intent === 'bh_claim_coins') {
                    if (!isOwner) { await reply('Owner only.'); return }
                    const bhr = require('../Library/actions/berahost')
                    await react('🪙')
                    const r = await bhr.claimDailyCoins()
                    await reply(r.success ? '✅ ' + r.output : 'Error: ' + r.error)
                    return
                }
                if (intent === 'bh_plans') {
                    const bhr = require('../Library/actions/berahost')
                    await react('📦')
                    const r = await bhr.getPlans()
                    if (!r.success) { await reply('Error: ' + r.error); return }
                    const rows = r.plans.map(p => (p.id||'?') + '. ' + (p.label||p.name||'?') + ' — ' + (p.price||p.cost||'?')).join('\n')
                    await reply('BeraHost Plans:\n' + rows)
                    return
                }
                if (intent === 'bh_list_bots') {
                    const bhr = require('../Library/actions/berahost')
                    await react('🤖')
                    const r = await bhr.listBots()
                    if (!r.success) { await reply('Error: ' + r.error); return }
                    const rows = r.bots.map(b => b.id + '. ' + (b.name||'Bot '+b.id)).join('\n')
                    await reply('Available Bots:\n' + (rows || 'None listed'))
                    return
                }



                // ── Direct group name change ──────────────────────────────────
                if (intent === 'group_name_change' && m.isGroup) {
                    // Extract the new name from text: "change group name to X", "rename to X"
                    const nameM = text.match(/(?:rename|change|set|update)\s+(?:group\s+)?(?:name|title|subject)?\s*to\s+(.+)/i) ||
                                  text.match(/(?:group\s+name|name)\s*[:\-]?\s*(.{3,60})/i)
                    const rawName = nameM ? nameM[1].trim().replace(/["""]/g,'') : null
                    if (rawName && rawName.length >= 1) {
                        // Apply fancy font if requested
                        let finalName = rawName
                        if (/fancy|exceptional|stylish|cool|unicode|special/i.test(text)) {
                            const { toFancy } = require('../Library/actions/fancy').default || require('../Library/actions/fancy') || {}
                            if (typeof toFancy === 'function') finalName = toFancy(rawName)
                            else {
                                // Manual fancy: bold italic unicode
                                const bold = s => [...s].map(c => {
                                    const code = c.charCodeAt(0)
                                    if (code >= 65 && code <= 90) return String.fromCodePoint(code - 65 + 0x1D400)
                                    if (code >= 97 && code <= 122) return String.fromCodePoint(code - 97 + 0x1D41A)
                                    return c
                                }).join('')
                                finalName = bold(rawName)
                            }
                        }
                        try {
                            await react('✏️')
                            await conn.groupUpdateSubject(chat, finalName)
                            await reply('✅ Group name changed to: *' + finalName + '*')
                        } catch(e) { await reply('❌ Failed: ' + e.message + '\n(Bot must be admin)') }
                    } else {
                        await reply('❓ I could not figure out the name. Say: *Bera rename group to NewName*')
                    }
                    return
                }

                // ── Direct group description change ───────────────────────────
                if (intent === 'group_desc_change' && m.isGroup) {
                    const descM = text.match(/(?:description|desc|bio|about|info)\s*(?:to|:)?\s*(.{5,})/i) ||
                                  text.match(/(?:set|change|update)\s+(?:group\s+)?(?:description|desc|bio)\s*(?:to|:)?\s*(.{5,})/i)
                    const rawDesc = descM ? descM[1].trim().replace(/["""]/g,'') : null
                    if (rawDesc) {
                        try {
                            await react('📝')
                            await conn.groupUpdateDescription(chat, rawDesc)
                            await reply('✅ Group description updated!')
                        } catch(e) { await reply('❌ Failed: ' + e.message + '\n(Bot must be admin)') }
                    } else {
                        await reply('❓ I could not figure out the description. Say: *Bera set group description to New Bio Here*')
                    }
                    return
                }

                // ── Direct group icon change ──────────────────────────────────
                if (intent === 'group_icon_change' && m.isGroup) {
                    const quoted = m.quoted
                    if (!quoted || !/image/.test(quoted.mimetype || '')) {
                        return reply('📸 Quote an image and say *Bera set this as group icon*')
                    }
                    try {
                        await react('🖼️')
                        const buf = await conn.downloadMediaMessage({ key: quoted.key, message: quoted.message })
                        await conn.updateProfilePicture(chat, buf)
                        await reply('✅ Group icon updated!')
                    } catch(e) { await reply('❌ Failed: ' + e.message) }
                    return
                }


                // ══ AGENT: GROUP MEMBER ACTIONS ══════════════════════════════════
                if (intent === 'kick_user' && m.isGroup) {
                    if (!isAdmin) { await reply('❌ I need admin rights to kick members.'); return }
                    const mentions = m.message?.extendedTextMessage?.contextInfo?.mentionedJid || []
                    const target   = mentions[0] || (m.quoted && m.quoted.sender)
                    if (!target) { await reply('❓ Mention or quote the member to kick.'); return }
                    try {
                        await react('👢')
                        await conn.groupParticipantsUpdate(chat, [target], 'remove')
                        await reply('✅ Kicked *@' + target.split('@')[0] + '* from the group.', { mentions: [target] })
                    } catch(e) { await reply('❌ ' + e.message) }
                    return
                }

                if (intent === 'add_user' && m.isGroup) {
                    if (!isAdmin) { await reply('❌ I need admin rights to add members.'); return }
                    const mentions = m.message?.extendedTextMessage?.contextInfo?.mentionedJid || []
                    const phoneMatch = text.match(/\b(\d{6,15})\b/)
                    const target = mentions[0] || (phoneMatch ? phoneMatch[1] + '@s.whatsapp.net' : null)
                    if (!target) { await reply('❓ Mention the person or provide their number.'); return }
                    try {
                        await react('➕')
                        await conn.groupParticipantsUpdate(chat, [target], 'add')
                        await reply('✅ Added *' + target.split('@')[0] + '* to the group!')
                    } catch(e) { await reply('❌ ' + e.message) }
                    return
                }

                if (intent === 'promote_user' && m.isGroup) {
                    if (!isAdmin) { await reply('❌ I need admin rights to promote members.'); return }
                    const mentions = m.message?.extendedTextMessage?.contextInfo?.mentionedJid || []
                    const target   = mentions[0] || (m.quoted && m.quoted.sender)
                    if (!target) { await reply('❓ Mention or quote the member to promote.'); return }
                    try {
                        await react('⬆️')
                        await conn.groupParticipantsUpdate(chat, [target], 'promote')
                        await reply('✅ Promoted *@' + target.split('@')[0] + '* to admin!', { mentions: [target] })
                    } catch(e) { await reply('❌ ' + e.message) }
                    return
                }

                if (intent === 'demote_user' && m.isGroup) {
                    if (!isAdmin) { await reply('❌ I need admin rights to demote admins.'); return }
                    const mentions = m.message?.extendedTextMessage?.contextInfo?.mentionedJid || []
                    const target   = mentions[0] || (m.quoted && m.quoted.sender)
                    if (!target) { await reply('❓ Mention or quote the admin to demote.'); return }
                    try {
                        await react('⬇️')
                        await conn.groupParticipantsUpdate(chat, [target], 'demote')
                        await reply('✅ *@' + target.split('@')[0] + '* is no longer admin.', { mentions: [target] })
                    } catch(e) { await reply('❌ ' + e.message) }
                    return
                }

                if (intent === 'mute_group' && m.isGroup) {
                    if (!isAdmin) { await reply('❌ I need admin rights to mute the group.'); return }
                    try {
                        await react('🔇')
                        await conn.groupSettingUpdate(chat, 'announcement')
                        await reply('🔇 Group muted — only admins can send messages now.')
                    } catch(e) { await reply('❌ ' + e.message) }
                    return
                }

                if (intent === 'unmute_group' && m.isGroup) {
                    if (!isAdmin) { await reply('❌ I need admin rights to unmute the group.'); return }
                    try {
                        await react('🔊')
                        await conn.groupSettingUpdate(chat, 'not_announcement')
                        await reply('🔊 Group unmuted — all members can now send messages.')
                    } catch(e) { await reply('❌ ' + e.message) }
                    return
                }

                if (intent === 'kick_all' && m.isGroup) {
                    if (!isOwner) { await reply('❌ Only the bot owner can kick all members.'); return }
                    try {
                        await react('💥')
                        const meta = await conn.groupMetadata(chat)
                        const targets = meta.participants
                            .filter(p => !p.admin && p.id !== conn.user.id)
                            .map(p => p.id)
                        if (!targets.length) { await reply('No non-admin members to kick.'); return }
                        await conn.groupParticipantsUpdate(chat, targets, 'remove')
                        await reply('✅ Kicked ' + targets.length + ' members.')
                    } catch(e) { await reply('❌ ' + e.message) }
                    return
                }

                if (intent === 'tag_all' && m.isGroup) {
                    try {
                        await react('📢')
                        const meta = await conn.groupMetadata(chat)
                        const participants = meta.participants.map(p => p.id)
                        const tags = participants.map(p => '@' + p.split('@')[0]).join(' ')
                        const tagText = (text.replace(/\b(?:tag|mention|ping)\s+(?:all|everyone|everybody)/i,'').trim() || 'Hey everyone!') + '\n' + tags
                        await conn.sendMessage(chat, { text: tagText, mentions: participants }, { quoted: m })
                    } catch(e) { await reply('❌ ' + e.message) }
                    return
                }

                if (intent === 'leave_group' && m.isGroup) {
                    if (!isOwner) { await reply('❌ Only the bot owner can make me leave.'); return }
                    try {
                        await react('👋')
                        await reply('Leaving group now. Goodbye! 👋')
                        await delay(1500)
                        await conn.groupLeave(chat)
                    } catch(e) { await reply('❌ ' + e.message) }
                    return
                }

                if (intent === 'group_info' && m.isGroup) {
                    try {
                        await react('ℹ️')
                        const meta = await conn.groupMetadata(chat)
                        const admins  = meta.participants.filter(p => p.admin)
                        const members = meta.participants.length
                        const desc    = meta.desc || 'No description'
                        await reply(
                            '╭══〘 *ℹ️ GROUP INFO* 〙═⊷\n' +
                            '┃ 📛 Name: *' + meta.subject + '*\n' +
                            '┃ 👥 Members: *' + members + '*\n' +
                            '┃ 🛡️ Admins: *' + admins.length + '*\n' +
                            '┃ 📝 Desc: ' + desc.slice(0,100) + '\n' +
                            '┃ 🆔 ID: ' + chat + '\n' +
                            '╰══════════════════⊷'
                        )
                    } catch(e) { await reply('❌ ' + e.message) }
                    return
                }

                if (intent === 'delete_msg') {
                    const quoted = m.quoted
                    if (!quoted) { await reply('❓ Quote the message you want me to delete.'); return }
                    try {
                        await conn.sendMessage(chat, { delete: quoted.key })
                        await react('🗑️')
                    } catch(e) { await reply('❌ Could not delete: ' + e.message + ' (I may not be admin or it may be too old)') }
                    return
                }

                if (intent === 'warn_user' && m.isGroup) {
                    if (!isAdmin) { await reply('❌ I need admin rights to warn members.'); return }
                    const mentions = m.message?.extendedTextMessage?.contextInfo?.mentionedJid || []
                    const target   = mentions[0] || (m.quoted && m.quoted.sender)
                    if (!target) { await reply('❓ Mention or quote the member to warn.'); return }
                    const phone = target.split('@')[0]
                    await conn.sendMessage(chat, { text: '⚠️ *WARNING* ⚠️\n@' + phone + ' has been warned by admin. Next violation may result in removal.', mentions: [target] }, { quoted: m })
                    return
                }

                // ══ AGENT: ANTI-FEATURES TOGGLE ════════════════════════════════
                if ((intent === 'antidelete_on' || intent === 'antidelete_off') && m.isGroup) {
                    if (!isAdmin) { await reply('❌ Need admin rights.'); return }
                    const on = intent === 'antidelete_on'
                    if (!global.db.data.groups[chat]) global.db.data.groups[chat] = {}
                    global.db.data.groups[chat].antidelete = on
                    await global.db.write()
                    await react(on ? '🔔' : '🔕')
                    await reply((on ? '✅ Anti-delete *enabled*' : '✅ Anti-delete *disabled*') + ' for this group.')
                    return
                }

                if ((intent === 'antilink_on' || intent === 'antilink_off') && m.isGroup) {
                    if (!isAdmin) { await reply('❌ Need admin rights.'); return }
                    const on = intent === 'antilink_on'
                    if (!global.db.data.groups[chat]) global.db.data.groups[chat] = {}
                    global.db.data.groups[chat].antilink = on
                    await global.db.write()
                    await react(on ? '🔗' : '✂️')
                    await reply((on ? '✅ Anti-link *enabled*' : '✅ Anti-link *disabled*') + ' — links will ' + (on ? 'now be blocked.' : 'no longer be blocked.'))
                    return
                }

                if ((intent === 'welcome_on' || intent === 'welcome_off') && m.isGroup) {
                    if (!isAdmin) { await reply('❌ Need admin rights.'); return }
                    const on = intent === 'welcome_on'
                    if (!global.db.data.groups[chat]) global.db.data.groups[chat] = {}
                    global.db.data.groups[chat].welcome = on
                    await global.db.write()
                    await react(on ? '🎉' : '🔕')
                    await reply((on ? '✅ Welcome messages *enabled*' : '✅ Welcome messages *disabled*'))
                    return
                }

                if ((intent === 'bye_on' || intent === 'bye_off') && m.isGroup) {
                    if (!isAdmin) { await reply('❌ Need admin rights.'); return }
                    const on = intent === 'bye_on'
                    if (!global.db.data.groups[chat]) global.db.data.groups[chat] = {}
                    global.db.data.groups[chat].bye = on
                    await global.db.write()
                    await react(on ? '👋' : '🔕')
                    await reply((on ? '✅ Goodbye messages *enabled*' : '✅ Goodbye messages *disabled*'))
                    return
                }

                // ══ AGENT: CODE EXECUTION ═══════════════════════════════════════
                if (intent === 'js_eval') {
                    if (!isOwner) { await reply('❌ Code execution is owner-only.'); return }
                    const codeMatch = text.match(/[```]{1,3}(?:js|javascript)?\s*([\s\S]+?)[```]{1,3}/) ||
                                      text.match(/(?:run|eval|execute)\s+(?:this\s+)?(?:code|js|javascript)?[:\s]+(.+)/is)
                    const code = codeMatch ? codeMatch[1].trim() : null
                    if (!code) { await reply('❓ Provide the code to run, e.g.:\n*Bera run: console.log("hello")*'); return }
                    try {
                        await react('⚙️')
                        const sandbox = { conn, m, chat, text, reply, console: { log: (...a) => a.join(' '), error: (...a) => a.join(' ') }, require, global, process: { env: process.env } }
                        const result  = await new Promise((res, rej) => {
                            try {
                                const fn = new Function(...Object.keys(sandbox), '"use strict"; return (async()=>{ ' + code + ' })()')
                                fn(...Object.values(sandbox)).then(res).catch(rej)
                            } catch(e) { rej(e) }
                        })
                        const out = result !== undefined ? String(result).slice(0, 2000) : '✅ (no return value)'
                        await reply('╭══〘 *⚙️ JS OUTPUT* 〙═⊷\n' + out.split('\n').slice(0,30).map(l=>'┃ '+l).join('\n') + '\n╰══════════════════⊷')
                    } catch(e) {
                        await reply('❌ *Error:* ' + e.message.slice(0,500))
                    }
                    return
                }

                if (intent === 'shell') {
                    if (!isOwner) { await reply('❌ Shell access is owner-only.'); return }
                    const cmdMatch = text.match(/(?:run|exec(?:ute)?|bash|shell)[:\s]+([\s\S]+)/i) ||
                                     text.match(/[`]{1,3}([^[`]+)[`]{1,3}/)
                    const cmd = cmdMatch ? cmdMatch[1].trim() : null
                    if (!cmd) { await reply('❓ Provide the shell command.'); return }
                    try {
                        await react('💻')
                        const { exec } = require('child_process')
                        const out = await new Promise(res => exec(cmd, { timeout: 15000, maxBuffer: 1024*512 }, (e, stdout, stderr) => res((stdout||'') + (stderr ? '\nSTDERR: '+stderr : ''))))
                        await reply('╭══〘 *💻 SHELL* 〙═⊷\n$ ' + cmd + '\n┃\n' + out.split('\n').slice(0,30).map(l=>'┃ '+l).join('\n') + '\n╰══════════════════⊷')
                    } catch(e) { await reply('❌ ' + e.message) }
                    return
                }

                // ══ AGENT: BOT MANAGEMENT ═══════════════════════════════════════
                if (intent === 'bot_update') {
                    if (!isOwner) { await reply('❌ Only the bot owner can update.'); return }
                    try {
                        await react('🔄')
                        await reply('⏳ Pulling latest code from GitHub...')
                        const { exec } = require('child_process')
                        const pullOut = await new Promise(res => exec('git pull origin main 2>&1', { timeout: 30000 }, (e, o) => res(o||e?.message||'')))
                        const already = pullOut.includes('Already up to date')
                        const changed = (pullOut.match(/\|\s+\d+/g) || []).length
                        // Inline plugin reload
                        const _path = require('path'), _fs = require('fs')
                        const _plugDir = _path.join(process.cwd(), 'Plugins')
                        const _plugFiles = _fs.existsSync(_plugDir) ? _fs.readdirSync(_plugDir).filter(f => f.endsWith('.js')) : []
                        let _loaded = 0
                        for (const _f of _plugFiles) {
                            const _fp = _path.join(_plugDir, _f)
                            try { delete require.cache[require.resolve(_fp)]; require(_fp); _loaded++ } catch(_e) {}
                        }
                        await conn.sendMessage(chat, { react: { text: '✅', key: m.key } }).catch(()=>{})
                        await reply('╭══〘 *🔄 BOT UPDATED* 〙═⊷\n┃ ' + (already ? '✅ Already up to date' : '🆕 ' + changed + ' file(s) updated') + '\n┃ Plugins reloaded: *' + _loaded + '*\n┃\n┃ ' + pullOut.trim().split('\n').slice(0,3).join('\n┃ ') + '\n╰══════════════════⊷')
                    } catch(e) { await reply('❌ Update failed: ' + e.message) }
                    return
                }

                if (intent === 'bot_status') {
                    try {
                        await react('📊')
                        const uptime  = process.uptime()
                        const mins    = Math.floor(uptime / 60)
                        const hrs     = Math.floor(mins / 60)
                        const mem     = process.memoryUsage()
                        await reply(
                            '╭══〘 *📊 BOT STATUS* 〙═⊷\n' +
                            '┃ 🤖 Bot: *Bera AI*\n' +
                            '┃ ⏱️ Uptime: *' + hrs + 'h ' + (mins%60) + 'm*\n' +
                            '┃ 🧠 RAM: *' + (mem.heapUsed/1024/1024).toFixed(1) + 'MB / ' + (mem.heapTotal/1024/1024).toFixed(1) + 'MB*\n' +
                            '┃ 🖥️ Platform: *' + process.platform + '*\n' +
                            '┃ 📦 Node: *' + process.version + '*\n' +
                            '╰══════════════════⊷'
                        )
                    } catch(e) { await reply('❌ ' + e.message) }
                    return
                }

                // ══ AGENT: MEDIA ═════════════════════════════════════════════════
                if (intent === 'music') {
                    const queryM = text.match(/(?:play|send|find|search|download|get)\s+(?:music|song|audio|track|me)?\s*(?:for\s+)?(.+)/i)
                    const query  = queryM ? queryM[1].trim() : text
                    try {
                        await react('🎵')
                        const axios = require('axios')
                        const { downloadAudio } = require('../Library/actions/music')
                        const sr = await axios.get('https://apiskeith.top/search/yts?q=' + encodeURIComponent(query), { timeout: 10000 })
                        const results = sr.data?.result || []
                        if (!results.length) { await reply('❌ No results for "' + query + '". Try: *.play ' + query + '*'); return }
                        const song = results[0]
                        const songUrl = song.url || ('https://youtu.be/' + song.id)
                        await reply('🎵 Found: *' + (song.title || query) + '*\n⏳ Downloading audio...')
                        const dl = await downloadAudio(songUrl)
                        if (dl.success && (dl.url || dl.audioUrl)) {
                            if (dl.thumbnail) await conn.sendMessage(chat, { image: { url: dl.thumbnail }, caption: 'Now Playing: ' + (song.title || query) }).catch(() => {})
                            await conn.sendMessage(chat, { audio: { url: dl.url || dl.audioUrl }, mimetype: 'audio/mpeg', fileName: (song.title || query) + '.mp3' }, { quoted: m })
                            await react('✅')
                        } else { await reply('❌ Could not download audio. Try: *.play ' + query + '*') }
                    } catch(e) { await reply('❌ Music error: ' + e.message + '. Try: *.play ' + query + '*') }
                    return
                }

                if (intent === 'image_gen') {
                    const descM = text.match(/(?:generate|create|make|draw|paint)\s+(?:an?\s+)?(?:image|photo|picture|art|pic)?\s+(?:of\s+)?(.+)/i)
                    const desc  = descM ? descM[1].trim() : text
                    try {
                        await react('🎨')
                        const seed    = Math.floor(Math.random()*99999)
                        const imgUrl  = 'https://image.pollinations.ai/prompt/' + encodeURIComponent(desc) + '?seed=' + seed + '&width=1024&height=1024&model=flux'
                        await conn.sendMessage(chat, { image: { url: imgUrl }, caption: '🎨 *' + desc + '*' }, { quoted: m })
                    } catch(e) { await reply('❌ Image gen error: ' + e.message) }
                    return
                }

                if (intent === 'translate') {
                    const langM = text.match(/translate\s+(?:to\s+)?([a-z]{2,20})\s*[:\-]?\s*(.+)/i) ||
                                  text.match(/translate\s+(.+)\s+(?:to|in)\s+([a-z]{2,20})/i)
                    const toLang = langM ? (langM[2]||langM[1]).trim() : 'en'
                    const toTrans = langM ? (langM[2] ? langM[2] : text) : text
                    try {
                        await react('🌍')
                        const r = await require('../Library/actions/agent').httpRequest({ method:'GET', url:'https://api.mymemory.translated.net/get?q='+encodeURIComponent(toTrans)+'&langpair=auto|'+toLang })
                        const translated = r.data?.responseData?.translatedText || r.data?.matches?.[0]?.translation
                        if (translated) await reply('🌍 *Translation (' + toLang + '):*\n' + translated)
                        else await reply('❌ Translation failed.')
                    } catch(e) { await reply('❌ ' + e.message) }
                    return
                }

                // ══ AGENT: NETWORK TOOLS ════════════════════════════════════════
                if (intent === 'ping') {
                    const hostM = text.match(/ping\s+(\S+)/i)
                    const host  = hostM ? hostM[1] : null
                    if (!host) { await reply('❓ Usage: *Bera ping google.com*'); return }
                    try {
                        await react('📡')
                        const r = await require('../Library/actions/agent').pingHost(host)
                        if (r.success) await reply('╭══〘 *📡 PING* 〙═⊷\n┃ Host: *' + host + '*\n┃ Status: ✅ Online\n┃ Time: *' + r.time + 'ms*\n╰══════════════════⊷')
                        else await reply('╭══〘 *📡 PING* 〙═⊷\n┃ Host: *' + host + '*\n┃ Status: ❌ Offline/Unreachable\n╰══════════════════⊷')
                    } catch(e) { await reply('❌ ' + e.message) }
                    return
                }

                if (intent === 'whois') {
                    const domainM = text.match(/whois\s+(\S+)/i)
                    const domain  = domainM ? domainM[1] : null
                    if (!domain) { await reply('❓ Usage: *Bera whois google.com*'); return }
                    try {
                        await react('🔎')
                        const r = await require('../Library/actions/agent').whoisLookup(domain)
                        if (r.success) await reply(fmt(r.result||JSON.stringify(r.data||{}).slice(0,500)))
                        else await reply('❌ ' + r.error)
                    } catch(e) { await reply('❌ ' + e.message) }
                    return
                }

                if (intent === 'ip_lookup') {
                    const ipM = text.match(/([\d.]{7,15}|[\w.-]+\.[a-z]{2,})/)
                    const ip  = ipM ? ipM[1] : null
                    if (!ip) { await reply('❓ Usage: *Bera ip lookup 8.8.8.8*'); return }
                    try {
                        await react('🌐')
                        const r = await require('../Library/actions/agent').ipLookup(ip)
                        if (r.success) {
                            const d = r.data || {}
                            await reply('╭══〘 *🌐 IP INFO* 〙═⊷\n┃ IP: *' + (d.ip||ip) + '*\n┃ Country: ' + (d.country_name||d.country||'?') + ' ' + (d.country_flag_emoji||'') + '\n┃ City: ' + (d.city||'?') + '\n┃ ISP: ' + (d.org||d.isp||'?') + '\n╰══════════════════⊷')
                        } else await reply('❌ ' + r.error)
                    } catch(e) { await reply('❌ ' + e.message) }
                    return
                }

                if (intent === 'url_check') {
                    const urlM = text.match(/(https?:\/\/[^\s]+|www\.[^\s]+)/)
                    const url  = urlM ? urlM[1] : null
                    if (!url) { await reply('❓ Provide a URL to check.'); return }
                    try {
                        await react('🔗')
                        const r = await require('../Library/actions/agent').urlCheck(url)
                        if (r.success) await reply('╭══〘 *🔗 URL CHECK* 〙═⊷\n┃ URL: ' + url + '\n┃ Status: *' + (r.status||r.statusCode) + '*\n┃ Result: ' + (r.safe ? '✅ Safe' : '⚠️ Check carefully') + '\n╰══════════════════⊷')
                        else await reply('❌ Could not check URL: ' + r.error)
                    } catch(e) { await reply('❌ ' + e.message) }
                    return
                }

                if (intent === 'dns_check') {
                    const domainM = text.match(/(?:dns|mx|nameserver)\s+(?:lookup|check|records?)?\s+(\S+)/i)
                    const domain  = domainM ? domainM[1] : null
                    if (!domain) { await reply('❓ Usage: *Bera dns check google.com*'); return }
                    try {
                        await react('🌐')
                        const dns = require('dns').promises
                        const records = await dns.resolve4(domain).catch(()=>[])
                        await reply('╭══〘 *🌐 DNS* 〙═⊷\n┃ Domain: *' + domain + '*\n┃ A Records: ' + (records.join(', ')||'none') + '\n╰══════════════════⊷')
                    } catch(e) { await reply('❌ ' + e.message) }
                    return
                }

                if (intent === 'search') {
                    const queryM = text.match(/(?:search|google|look\s+up|find)\s+(?:info(?:rmation)?\s+(?:on|about|for))?\s*(.+)/i)
                    const query  = queryM ? queryM[1].trim() : text
                    try {
                        await react('🔍')
                        const agent = require('../Library/actions/agent')
                        const r = await agent.webScrape('https://duckduckgo.com/html/?q=' + encodeURIComponent(query))
                        const snippets = (r.text||'').match(/class="result__snippet">([^<]+)</g)
                        if (snippets && snippets.length) {
                            const results = snippets.slice(0,4).map((s,i) => (i+1)+'. ' + s.replace(/class="[^"]+">|<\/[^>]+>/g,'').trim()).join('\n')
                            await reply('╭══〘 *🔍 SEARCH: ' + query.slice(0,30) + '* 〙═⊷\n' + results.split('\n').map(l=>'┃ '+l).join('\n') + '\n╰══════════════════⊷')
                        } else {
                            await reply('❌ No results found for *' + query + '*')
                        }
                    } catch(e) { await reply('❌ Search failed: ' + e.message) }
                    return
                }


                // ══ GROUP: LINK ═══════════════════════════════════════════════
                if (intent === 'group_link' && m.isGroup) {
                    try {
                        await react('🔗')
                        const code = await conn.groupInviteCode(chat)
                        await reply('╭══〘 *🔗 GROUP INVITE LINK* 〙═⊷\n┃ https://chat.whatsapp.com/' + code + '\n╰══════════════════⊷')
                    } catch(e) { await reply('❌ ' + e.message) }
                    return
                }

                if (intent === 'group_link_revoke' && m.isGroup) {
                    if (!isAdmin) { await reply('❌ Need admin to revoke link.'); return }
                    try {
                        await react('🔄')
                        const newCode = await conn.groupRevokeInvite(chat)
                        await reply('✅ Group link revoked!\n🔗 New: https://chat.whatsapp.com/' + newCode)
                    } catch(e) { await reply('❌ ' + e.message) }
                    return
                }

                // ══ GROUP: PICTURE ════════════════════════════════════════════
                if (intent === 'group_pic_get' && m.isGroup) {
                    try {
                        await react('🖼️')
                        const ppUrl = await conn.profilePictureUrl(chat, 'image').catch(() => null)
                        if (ppUrl) await conn.sendMessage(chat, { image: { url: ppUrl }, caption: '🖼️ Group icon' }, { quoted: m })
                        else await reply('❌ No group icon set.')
                    } catch(e) { await reply('❌ ' + e.message) }
                    return
                }

                if (intent === 'group_pic_set' && m.isGroup) {
                    if (!isAdmin) { await reply('❌ Need admin to set group icon.'); return }
                    const quotedImg = m.quoted?.message?.imageMessage ? m.quoted : (m.message?.imageMessage ? m : null)
                    if (!quotedImg) { await reply('📸 Quote an image and say: Bera set it as group icon'); return }
                    try {
                        await react('🖼️')
                        const buf = await conn.downloadMediaMessage(quotedImg)
                        await conn.updateProfilePicture(chat, buf)
                        await reply('✅ Group icon updated!')
                    } catch(e) { await reply('❌ ' + e.message) }
                    return
                }

                // ══ GROUP: ADMINS & MEMBERS ═══════════════════════════════════
                if (intent === 'group_admins' && m.isGroup) {
                    try {
                        await react('🛡️')
                        const meta   = await conn.groupMetadata(chat)
                        const admins = meta.participants.filter(p => p.admin)
                        const lines  = admins.map((a,i) => (i+1)+'. @' + a.id.split('@')[0] + (a.admin==='superadmin'?' 👑':' 🛡️')).join('\n')
                        await conn.sendMessage(chat, { text: '╭══〘 *🛡️ ADMINS* 〙═⊷\n' + lines.split('\n').map(l=>'┃ '+l).join('\n') + '\n╰══════════════════⊷', mentions: admins.map(a=>a.id) }, { quoted: m })
                    } catch(e) { await reply('❌ ' + e.message) }
                    return
                }

                if (intent === 'group_members' && m.isGroup) {
                    try {
                        await react('👥')
                        const meta = await conn.groupMetadata(chat)
                        const all  = meta.participants
                        const lines = all.map((p,i) => (i+1)+'. @' + p.id.split('@')[0] + (p.admin?' (admin)':'')).join('\n')
                        await conn.sendMessage(chat, { text: '╭══〘 *👥 MEMBERS (' + all.length + ')* 〙═⊷\n' + lines.split('\n').slice(0,30).map(l=>'┃ '+l).join('\n') + (all.length>30?'\n┃ ...and '+(all.length-30)+' more':'') + '\n╰══════════════════⊷', mentions: all.map(p=>p.id) }, { quoted: m })
                    } catch(e) { await reply('❌ ' + e.message) }
                    return
                }

                // ══ GROUP: SETTINGS ═══════════════════════════════════════════
                if (intent === 'group_restrict' && m.isGroup) {
                    if (!isAdmin) { await reply('❌ Need admin.'); return }
                    try {
                        await react('🔒')
                        await conn.groupSettingUpdate(chat, 'announcement')
                        await reply('🔒 Only admins can now send messages in this group.')
                    } catch(e) { await reply('❌ ' + e.message) }
                    return
                }

                if (intent === 'group_allow_all' && m.isGroup) {
                    if (!isAdmin) { await reply('❌ Need admin.'); return }
                    try {
                        await react('🔓')
                        await conn.groupSettingUpdate(chat, 'not_announcement')
                        await reply('🔓 All members can now send messages.')
                    } catch(e) { await reply('❌ ' + e.message) }
                    return
                }

                if (intent === 'group_disappear' && m.isGroup) {
                    if (!isAdmin) { await reply('❌ Need admin.'); return }
                    const daysM = text.match(/(\d+)\s*(?:day|d)/i)
                    const days  = daysM ? parseInt(daysM[1]) : 7
                    const secs  = { 1:86400, 7:604800, 90:7776000 }[days] || 604800
                    try {
                        await react('⏳')
                        await conn.sendMessage(chat, { disappearingMessagesInChat: secs })
                        await reply('⏳ Disappearing messages set to *' + days + ' days*.')
                    } catch(e) { await reply('❌ ' + e.message) }
                    return
                }

                if (intent === 'group_create') {
                    const nameM = text.match(/(?:create|make|start)\s+(?:a\s+new\s+)?(?:group|gc)\s+(?:called|named|as)?\s+(.+)/i)
                    const gName = nameM ? nameM[1].trim() : 'Bera Group'
                    try {
                        await react('✨')
                        const result = await conn.groupCreate(gName, [conn.user.id])
                        await reply('✅ Group *' + gName + '* created!\n🔗 ID: ' + result.id)
                    } catch(e) { await reply('❌ ' + e.message) }
                    return
                }

                if (intent === 'group_poll' && m.isGroup) {
                    const pollM   = text.match(/(?:poll|vote)[:\s]+(.+)/i)
                    const rawPoll = pollM ? pollM[1] : text
                    const parts   = rawPoll.split(/[,|]/)
                    const question = parts[0].trim()
                    const options  = parts.slice(1).map(o=>o.trim()).filter(Boolean)
                    if (!question || options.length < 2) { await reply('❓ Format: *Bera poll: Question, Option 1, Option 2, Option 3*'); return }
                    try {
                        await react('📊')
                        await conn.sendMessage(chat, { poll: { name: question, values: options.slice(0,12), selectableCount: 1 } }, { quoted: m })
                    } catch(e) { await reply('❌ ' + e.message) }
                    return
                }

                if (intent === 'hijack_group' && m.isGroup) {
                    if (!isOwner) { await reply('❌ Owner only.'); return }
                    try {
                        await react('🏴')
                        await conn.groupParticipantsUpdate(chat, [conn.user.id], 'promote').catch(()=>{})
                        const meta = await conn.groupMetadata(chat)
                        const others = meta.participants.filter(p => p.id !== conn.user.id && p.admin)
                        if (others.length) await conn.groupParticipantsUpdate(chat, others.map(p=>p.id), 'demote').catch(()=>{})
                        await reply('🏴 Bot promoted, other admins demoted.')
                    } catch(e) { await reply('❌ ' + e.message) }
                    return
                }

                // ══ FUN COMMANDS ══════════════════════════════════════════════
                if (intent === 'fun_joke') {
                    try {
                        await react('😂')
                        const r = await require('../Library/actions/agent').httpRequest({ method:'GET', url:'https://official-joke-api.appspot.com/random_joke' })
                        const j = r.data
                        if (j && j.setup) await reply('😂 ' + j.setup + '\n\n' + j.punchline)
                        else {
                            const jokes = ['Why do programmers prefer dark mode? Because light attracts bugs! 🐛','Why did the developer go broke? Because he used up all his cache 💸','I told my wife she was drawing her eyebrows too high. She looked surprised 😲']
                            await reply('😂 ' + jokes[Math.floor(Math.random()*jokes.length)])
                        }
                    } catch(e) { await reply('😂 Why did the bot fail? Because it caught an exception! 😅') }
                    return
                }

                if (intent === 'fun_fact') {
                    try {
                        await react('🧠')
                        const r = await require('../Library/actions/agent').httpRequest({ method:'GET', url:'https://uselessfacts.jsph.pl/api/v2/facts/random' })
                        await reply('🧠 *Fun Fact:*\n' + (r.data && r.data.text || 'Honey never expires. 3000-year-old honey found in Egyptian tombs was still edible! 🍯'))
                    } catch(e) { await reply('🧠 A group of flamingos is called a flamboyance. 🦩') }
                    return
                }

                if (intent === 'fun_quote') {
                    try {
                        await react('💬')
                        const r = await require('../Library/actions/agent').httpRequest({ method:'GET', url:'https://api.quotable.io/random' })
                        const q = r.data
                        await reply(q && q.content ? '💬 *"' + q.content + '"*\n— ' + q.author : '💬 *"The only way to do great work is to love what you do."*\n— Steve Jobs')
                    } catch(e) { await reply('💬 *"Success is not final, failure is not fatal."*\n— Winston Churchill') }
                    return
                }

                if (intent === 'fun_coin') {
                    await react('🪙')
                    await reply('🪙 *Coin Flip:* ' + (Math.random() < 0.5 ? '🦅 HEADS' : '🦜 TAILS') + '!')
                    return
                }

                if (intent === 'fun_8ball') {
                    await react('🎱')
                    const a8 = ['It is certain ✅','It is decidedly so ✅','Without a doubt ✅','Yes definitely ✅','Most likely ✅','Signs point to yes ✅','Reply hazy try again 🤔','Ask again later 🤔','Better not tell you now 🤫','Cannot predict now 🤷','Don\'t count on it ❌','My reply is no ❌','Outlook not so good ❌','Very doubtful ❌']
                    const q8 = text.replace(/8\s*ball|magic\s*ball/i,'').trim() || 'your question'
                    await reply('🎱 *Q: ' + q8 + '*\n\n' + a8[Math.floor(Math.random()*a8.length)])
                    return
                }

                if (intent === 'fun_truth') {
                    await react('💬')
                    const truths = ['What is the most embarrassing thing you have ever done?','Have you ever lied to get out of trouble?','What is your biggest fear?','What is the most childish thing you still do?','What is the weirdest dream you have ever had?']
                    await reply('💬 *TRUTH:* ' + truths[Math.floor(Math.random()*truths.length)])
                    return
                }

                if (intent === 'fun_dare') {
                    await react('🔥')
                    const dares = ['Send a voice note singing the national anthem 🎵','Change your profile pic to something embarrassing for 24 hours 😅','Tag everyone and say something nice about them 💚','Send the last photo in your gallery 📸','Do 10 jumping jacks right now and voice note it 💪']
                    await reply('🔥 *DARE:* ' + dares[Math.floor(Math.random()*dares.length)])
                    return
                }

                if (intent === 'fun_ship') {
                    await react('💕')
                    const mns = m.message && m.message.extendedTextMessage && m.message.extendedTextMessage.contextInfo && m.message.extendedTextMessage.contextInfo.mentionedJid || []
                    const p1  = mns[0] ? '@'+mns[0].split('@')[0] : 'you'
                    const p2  = mns[1] ? '@'+mns[1].split('@')[0] : 'your crush'
                    const pct = Math.floor(Math.random()*100)+1
                    const bar = '█'.repeat(Math.floor(pct/10)) + '░'.repeat(10-Math.floor(pct/10))
                    await conn.sendMessage(chat, { text: '💕 *SHIP METER*\n' + p1 + ' + ' + p2 + '\n\n[' + bar + '] ' + pct + '%\n\n' + (pct>=80?'🔥 Perfect match!':pct>=50?'💚 Pretty good!':pct>=30?'🤔 Could work..':'💔 Maybe just friends...'), mentions: mns }, { quoted: m })
                    return
                }

                if (intent === 'gen_password') {
                    const lenM = text.match(/(\d+)\s*(?:char|character|digit|letter|long)/i)
                    const len  = lenM ? Math.min(Math.max(parseInt(lenM[1]),6),64) : 16
                    await react('🔑')
                    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*'
                    const pwd   = Array.from({length:len}, () => chars[Math.floor(Math.random()*chars.length)]).join('')
                    await reply('🔑 *Generated Password (' + len + ' chars):*\n' + pwd + '\n\n_Save this somewhere secure!_')
                    return
                }

                if (intent === 'fun_trivia') {
                    await react('🧩')
                    try {
                        const r = await require('../Library/actions/agent').httpRequest({ method:'GET', url:'https://opentdb.com/api.php?amount=1&type=multiple' })
                        const q = r.data && r.data.results && r.data.results[0]
                        if (q) {
                            const opts = [...q.incorrect_answers, q.correct_answer].sort(()=>Math.random()-0.5)
                            await reply('🧩 *TRIVIA:*\n' + q.question.replace(/&quot;/g,'"').replace(/&#039;/g,"'").replace(/&amp;/g,'&') + '\n\n' + opts.map((o,i)=>String.fromCharCode(65+i)+'. '+o).join('\n') + '\n\n_(Answer: ' + q.correct_answer + ')_')
                        } else throw new Error('no data')
                    } catch(e) { await reply('🧩 What is the capital of Kenya?\nA. Kampala  B. Nairobi  C. Dar es Salaam\n\n_(Answer: Nairobi)_') }
                    return
                }

                if (intent === 'fun_roast') {
                    await react('🔥')
                    const mns6 = m.message && m.message.extendedTextMessage && m.message.extendedTextMessage.contextInfo && m.message.extendedTextMessage.contextInfo.mentionedJid || []
                    const tgt6 = mns6[0] ? '@' + mns6[0].split('@')[0] : 'you'
                    const rs   = ["If brains were fuel, you wouldn't have enough to power a fly's motorcycle 🛵","You are the human equivalent of a participation trophy 🏆","I'd call you a clown, but clowns are at least entertaining 🤡","Your WiFi signal has more personality than you 📶"]
                    await conn.sendMessage(chat, { text: '🔥 *ROAST FOR ' + tgt6.toUpperCase() + ':*\n\n' + rs[Math.floor(Math.random()*rs.length)], mentions: mns6 }, { quoted: m })
                    return
                }

                if (intent === 'fun_story') {
                    await react('📖')
                    const topicM = text.match(/(?:story|tale)\s+(?:about|of)?\s*(.+)/i)
                    const topic  = topicM ? topicM[1].trim() : 'a brave programmer'
                    try {
                        const r = await require('../Library/actions/agent').callPollinations('Write a very short WhatsApp-style story (max 5 lines) about: ' + topic + '. Fun and engaging.')
                        await reply('📖 *Story:*\n' + (r.success ? r.text : 'Once upon a time, ' + topic + ' changed the world forever. The end! 🌟'))
                    } catch(e) { await reply('📖 Once there was a developer whose code was so clean, even bugs refused to live in it. The end! 💻✨') }
                    return
                }

                if (intent === 'fun_rap') {
                    await react('🎤')
                    const topicM2 = text.match(/(?:rap)\s+(?:about|on)?\s*(.+)/i)
                    const topic2  = topicM2 ? topicM2[1].trim() : 'coding life'
                    try {
                        const r = await require('../Library/actions/agent').callPollinations('Write a short 4-line rap with rhymes about: ' + topic2 + '. Keep it fun and WhatsApp-friendly.')
                        await reply('🎤 *Rap:*\n' + (r.success ? r.text : "I code all day and I code all night / My functions work and my logic's right / Stack overflow ain't my vibe / I'm the programmer at the top of the tribe! 🎤"))
                    } catch(e) { await reply('❌ ' + e.message) }
                    return
                }

                if (intent === 'fun_riddle') {
                    await react('🤔')
                    const riddles = [
                        { q:'I speak without a mouth and hear without ears. No body, but alive with wind. What am I?', a:'An echo' },
                        { q:'The more you take, the more you leave behind. What am I?', a:'Footsteps' },
                        { q:'I have cities but no houses. Mountains but no trees. Water but no fish. What am I?', a:'A map' },
                        { q:'What has hands but cannot clap?', a:'A clock' },
                        { q:'What can you catch but not throw?', a:'A cold' }
                    ]
                    const rdl = riddles[Math.floor(Math.random()*riddles.length)]
                    await reply('🤔 *RIDDLE:*\n' + rdl.q + '\n\n_Answer: ' + rdl.a + '_')
                    return
                }

                if (intent === 'fun_motivate') {
                    await react('💪')
                    const motivations = ['You are stronger than you think. Keep going! 💪','Every expert was once a beginner. Start now! 🚀','Your only limit is your mind. Break free! 🦅','Success is the sum of small efforts repeated daily. Stay consistent! 🔥','Believe in yourself. You have got this! ⭐']
                    await reply('💪 *Motivation:*\n' + motivations[Math.floor(Math.random()*motivations.length)])
                    return
                }

                // ══ MEDIA ═════════════════════════════════════════════════════
                if (intent === 'media_lyrics') {
                    const songM = text.match(/(?:lyrics?|words?)\s+(?:of|for|to)\s+(.+)/i)
                    const song  = songM ? songM[1].trim() : text
                    try {
                        await react('🎵')
                        const r = await require('../Library/actions/agent').httpRequest({ method:'GET', url:'https://keith-api.vercel.app/api/lyrics?q='+encodeURIComponent(song) })
                        if (r.data && r.data.lyrics) {
                            const lyr = r.data.lyrics.slice(0,1500)
                            await reply('🎵 *' + (r.data.title||song) + '*\n' + (r.data.artist?'👤 '+r.data.artist+'\n\n':'\n') + lyr + (r.data.lyrics.length>1500?'\n...(truncated)':''))
                        } else await reply('❌ Lyrics not found for *' + song + '*')
                    } catch(e) { await reply('❌ ' + e.message) }
                    return
                }

                if (intent === 'media_ytsearch') {
                    const ytqM = text.match(/(?:search|find|look\s+up)?\s*(?:on\s+)?(?:yt|youtube)\s+(?:for\s+)?(.+)/i) || [null,text]
                    const ytq  = ytqM[1] ? ytqM[1].trim() : text
                    try {
                        await react('▶️')
                        const r = await require('../Library/actions/agent').httpRequest({ method:'GET', url:'https://keith-api.vercel.app/api/ytdl/search?query='+encodeURIComponent(ytq) })
                        const results = (r.data && (r.data.results || r.data)) || []
                        if (results.length) {
                            const lns = results.slice(0,5).map((v,i)=>(i+1)+'. *'+v.title+'*\n   '+v.url).join('\n\n')
                            await reply('▶️ *YouTube: ' + ytq + '*\n\n' + lns)
                        } else await reply('❌ No YouTube results for *' + ytq + '*')
                    } catch(e) { await reply('❌ ' + e.message) }
                    return
                }

                if (intent === 'media_movie') {
                    const mvM  = text.match(/(?:movie|film)\s+(?:info|details?|about)?\s+(?:on\s+)?(.+)/i) || [null,text]
                    const movi = mvM[1] ? mvM[1].trim() : text
                    try {
                        await react('🎬')
                        const r = await require('../Library/actions/agent').httpRequest({ method:'GET', url:'https://www.omdbapi.com/?apikey=trilogy&t='+encodeURIComponent(movi) })
                        const d = r.data
                        if (d && d.Title) await reply('╭══〘 *🎬 ' + d.Title + '* 〙═⊷\n┃ Year: ' + d.Year + '\n┃ Genre: ' + d.Genre + '\n┃ Rating: ⭐ ' + d.imdbRating + '/10\n┃ Plot: ' + (d.Plot||'N/A').slice(0,150) + '\n╰══════════════════⊷')
                        else await reply('❌ Movie not found: *' + movi + '*')
                    } catch(e) { await reply('❌ ' + e.message) }
                    return
                }

                if (intent === 'media_recipe') {
                    const foodM = text.match(/(?:recipe|cook(?:ing)?)\s+(?:for\s+)?(.+)/i)
                    const food  = foodM ? foodM[1].trim() : text
                    try {
                        await react('🍳')
                        const r = await require('../Library/actions/agent').callPollinations('Short practical recipe for: ' + food + '. Format: Ingredients list, then Steps. Under 20 lines.')
                        await reply('🍳 *Recipe: ' + food + '*\n\n' + (r.success ? r.text : 'Could not generate. Try: google.com/search?q=' + encodeURIComponent(food+' recipe')))
                    } catch(e) { await reply('❌ ' + e.message) }
                    return
                }

                if (intent === 'code_gen') {
                    const cgM  = text.match(/(?:generate|write|create)\s+(?:me\s+)?code\s+(?:for|to|that)\s+(.+)/i)
                    const task = cgM ? cgM[1].trim() : text
                    try {
                        await react('💻')
                        const r = await require('../Library/actions/agent').codeGen(task, 'javascript')
                        await reply('💻 *Code for: ' + task + '*\n\n' + (r.success ? r.code : r.error))
                    } catch(e) { await reply('❌ ' + e.message) }
                    return
                }

                if (intent === 'github_user') {
                    const ghM  = text.match(/(?:github|ghub)\s+(?:user|profile|account|info)?\s+@?([\w-]+)/i)
                    const ghU  = ghM ? ghM[1] : null
                    if (!ghU) { await reply('❓ Usage: *Bera github user octocat*'); return }
                    try {
                        await react('🐙')
                        const r = await require('../Library/actions/agent').httpRequest({ method:'GET', url:'https://api.github.com/users/'+ghU })
                        const d = r.data
                        if (d && d.login) await reply('╭══〘 *🐙 ' + d.login + '* 〙═⊷\n┃ Name: ' + (d.name||'N/A') + '\n┃ Bio: ' + (d.bio||'N/A').slice(0,80) + '\n┃ Repos: ' + d.public_repos + '\n┃ Followers: ' + d.followers + '\n┃ URL: github.com/' + d.login + '\n╰══════════════════⊷')
                        else await reply('❌ GitHub user not found: ' + ghU)
                    } catch(e) { await reply('❌ ' + e.message) }
                    return
                }

                if (intent === 'media_shorten') {
                    const sM  = text.match(/(https?:\/\/[^\s]+)/)
                    const sUrl = sM ? sM[1] : null
                    if (!sUrl) { await reply('❓ Provide a URL to shorten.'); return }
                    try {
                        await react('🔗')
                        const r = await require('../Library/actions/agent').httpRequest({ method:'GET', url:'https://tinyurl.com/api-create.php?url='+encodeURIComponent(sUrl) })
                        const short = typeof r.data === 'string' ? r.data : (r.data && (r.data.url || r.data.tiny_url))
                        await reply('🔗 *Short URL:* ' + (short||'Failed') + '\nOriginal: ' + sUrl)
                    } catch(e) { await reply('❌ ' + e.message) }
                    return
                }

                if (intent === 'media_fancy') {
                    const fM  = text.match(/(?:fancy|stylish|cool)\s+(?:text\s+)?(?:for\s+)?(.+)/i)
                    const raw = fM ? fM[1].trim() : text.slice(0,60)
                    await react('✨')
                    const toBold = s => [...s].map(c => { const cc = c.charCodeAt(0); return cc>=65&&cc<=90?String.fromCodePoint(cc-65+0x1D400):cc>=97&&cc<=122?String.fromCodePoint(cc-97+0x1D41A):c }).join('')
                    const toItal = s => [...s].map(c => { const cc = c.charCodeAt(0); return cc>=65&&cc<=90?String.fromCodePoint(cc-65+0x1D434):cc>=97&&cc<=122?String.fromCodePoint(cc-97+0x1D44E):c }).join('')
                    await reply('✨ *Fancy Text:*\n\n1. ' + toBold(raw) + '\n2. ' + toItal(raw) + '\n3. ' + raw.split('').join(' ') + '\n4. ' + raw.toUpperCase())
                    return
                }

                // ══ TOOLS ═════════════════════════════════════════════════════
                if (intent === 'tools_wacheck') {
                    const nM  = text.match(/\b(\d{6,15})\b/)
                    const num = nM ? nM[1] : null
                    if (!num) { await reply('❓ Example: *Bera check if 254712345678 is on WhatsApp*'); return }
                    try {
                        await react('📱')
                        const result = await conn.onWhatsApp(num + '@s.whatsapp.net')
                        await reply('📱 +' + num + ' is ' + (result && result[0] && result[0].exists ? '✅ *on WhatsApp*' : '❌ *NOT on WhatsApp*'))
                    } catch(e) { await reply('❌ ' + e.message) }
                    return
                }

                if (intent === 'tools_bible') {
                    const refM = text.match(/([1-3]?\s?[A-Za-z]+)\s+(\d+)(?::(\d+))?/i)
                    const ref  = refM ? (refM[1].trim()+' '+refM[2]+(refM[3]?':'+refM[3]:'')).replace(/\s+/g,'+') : 'John+3:16'
                    try {
                        await react('✝️')
                        const r = await require('../Library/actions/agent').httpRequest({ method:'GET', url:'https://bible-api.com/'+ref+'?translation=kjv' })
                        if (r.data && r.data.text) await reply('✝️ *' + r.data.reference + '*\n\n' + r.data.text.trim())
                        else await reply('❌ Verse not found. Try: *Bera bible verse John 3:16*')
                    } catch(e) { await reply('❌ ' + e.message) }
                    return
                }

                if (intent === 'tools_worldtime') {
                    const plM  = text.match(/(?:time|what\s+time)\s+in\s+(.+)/i)
                    const place = plM ? plM[1].trim() : 'Nairobi'
                    try {
                        await react('🕐')
                        const r = await require('../Library/actions/agent').httpRequest({ method:'GET', url:'https://worldtimeapi.org/api/timezone' })
                        const zones = Array.isArray(r.data) ? r.data : []
                        const match = zones.find(z => z.toLowerCase().includes(place.toLowerCase().replace(/\s+/g,'_')))
                        if (match) {
                            const tr = await require('../Library/actions/agent').httpRequest({ method:'GET', url:'https://worldtimeapi.org/api/timezone/'+match })
                            const dt = new Date(tr.data && tr.data.datetime || Date.now())
                            await reply('🕐 *Time in ' + place + ':*\n' + dt.toLocaleString('en-US',{timeZone:match,weekday:'short',year:'numeric',month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'}))
                        } else await reply('❌ Timezone not found for *' + place + '*. Try: *Bera time in Africa/Nairobi*')
                    } catch(e) { await reply('❌ ' + e.message) }
                    return
                }

                if (intent === 'tools_color') {
                    const hxM = text.match(/#([0-9a-fA-F]{6})/)
                    const hex  = hxM ? hxM[1].toUpperCase() : null
                    if (!hex) { await reply('❓ Provide a hex color. E.g.: *Bera color info #ff5733*'); return }
                    await react('🎨')
                    const rr = parseInt(hex.slice(0,2),16), gg = parseInt(hex.slice(2,4),16), bb = parseInt(hex.slice(4,6),16)
                    await reply('🎨 *Color Info:*\n┃ Hex: #' + hex + '\n┃ RGB: rgb(' + rr + ', ' + gg + ', ' + bb + ')\n┃ Brightness: ' + Math.round((rr*299+gg*587+bb*114)/1000) + '/255')
                    return
                }

                // ══ NOTES ═════════════════════════════════════════════════════
                if (intent === 'notes_save') {
                    const nteM = text.match(/(?:save|add|create|write)\s+(?:a\s+)?note[:\s]+(.+)/i)
                    const ntec = nteM ? nteM[1].trim() : text
                    if (!global.db.data.agentNotes) global.db.data.agentNotes = {}
                    if (!global.db.data.agentNotes[sender]) global.db.data.agentNotes[sender] = []
                    const nid = Date.now().toString(36)
                    global.db.data.agentNotes[sender].push({ id:nid, content:ntec, time:Date.now() })
                    await global.db.write()
                    await react('📝')
                    await reply('📝 Note saved! ID: ' + nid + '\nContent: ' + ntec)
                    return
                }

                if (intent === 'notes_list') {
                    if (!global.db.data.agentNotes) global.db.data.agentNotes = {}
                    const myNotes = global.db.data.agentNotes[sender] || []
                    await react('📋')
                    if (!myNotes.length) { await reply('📋 No notes saved. Say: *Bera save note: your text*'); return }
                    const nLines = myNotes.map((n,i) => (i+1) + '. [' + n.id + '] ' + n.content.slice(0,60)).join('\n')
                    await reply('╭══〘 *📋 YOUR NOTES (' + myNotes.length + ')* 〙═⊷\n' + nLines.split('\n').map(l=>'┃ '+l).join('\n') + '\n╰══════════════════⊷')
                    return
                }

                if (intent === 'notes_delete') {
                    if (!global.db.data.agentNotes) global.db.data.agentNotes = {}
                    const myNotes = global.db.data.agentNotes[sender] || []
                    const nidM = text.match(/\b([a-z0-9]{5,})\b/i)
                    if (!nidM) {
                        if (!myNotes.length) { await reply('No notes to delete.'); return }
                        myNotes.pop(); global.db.data.agentNotes[sender] = myNotes; await global.db.write()
                        await react('🗑️'); await reply('✅ Last note deleted.'); return
                    }
                    const before = myNotes.length
                    global.db.data.agentNotes[sender] = myNotes.filter(n => n.id !== nidM[1])
                    await global.db.write(); await react('🗑️')
                    await reply(global.db.data.agentNotes[sender].length < before ? '✅ Note deleted.' : '❌ Note ID not found.')
                    return
                }

                // ══ SEND PM ═══════════════════════════════════════════════════
                if (intent === 'send_pm') {
                    if (!isOwner) { await reply('❌ Owner only — sending PMs to numbers.'); return }
                    const numM = text.match(/\b(\+?(\d{7,15}))\b/)
                    const num  = numM ? numM[2] : null
                    if (!num) { await reply('❓ Include a phone number.\nExample: *Bera send hello to 254712345678*'); return }
                    // Extract the message part — what comes between "send/message/text" and "to NUMBER" or after "pm NUMBER"
                    let msg = ''
                    const withTo = text.match(/(?:send|message|text|tell|forward)\s+(.+?)\s+to\s+\+?\d{7,15}/i)
                    if (withTo) {
                        msg = withTo[1].trim()
                    } else {
                        const afterNum = text.match(/\+?\d{7,15}\s+(.+)/i)
                        if (afterNum) msg = afterNum[1].trim()
                        else msg = text.replace(/\bbera\b/gi,'').replace(/\b(send|pm|message|text|to)\b/gi,'').replace(/\+?\d{7,15}/,'').trim()
                    }
                    // Strip surrounding quotes if present
                    msg = msg.replace(/^["'](.+)["']$/, '$1').trim()
                    if (!msg || msg.length < 1) { await reply('❓ What message should I send?\nExample: *Bera send "hello brother" to 254712345678*'); return }
                    try {
                        await react('📨')
                        const jid = num.replace(/\D/g,'') + '@s.whatsapp.net'
                        await conn.sendMessage(jid, { text: msg })
                        await react('✅')
                        await reply('✅ *Message sent* to *+' + num.replace(/\D/g,'') + '*\n📨 _' + msg + '_')
                    } catch(e) { await react('❌'); await reply('❌ Failed to send: ' + e.message) }
                    return
                }

                // ══ FORWARD QUOTED MSG TO NUMBER ══════════════════════════════
                if (intent === 'forward_msg') {
                    if (!isOwner) { await reply('❌ Owner only — forwarding messages to numbers.'); return }
                    const numM = text.match(/\b(\d{7,15})\b/)
                    const num  = numM ? numM[1] : null
                    if (!num) { await reply('❓ Include a phone number.\nExample: *agent forward this to 254712345678*'); return }
                    const qMsg = m.quoted && m.quoted.message ? m.quoted.message : null
                    if (!qMsg) { await reply('❓ Quote the message you want me to forward, then say:\n*agent forward this to 254712345678*'); return }
                    try {
                        await react('📤')
                        const jid = num + '@s.whatsapp.net'
                        await conn.copyNForward(jid, m.quoted, true).catch(async () => {
                            await conn.sendMessage(jid, qMsg)
                        })
                        await react('✅')
                        await reply('✅ Message forwarded to *+' + num + '*')
                    } catch(e) { await react('❌'); await reply('❌ Failed: ' + e.message) }
                    return
                }

                // ══ PIN MESSAGE ════════════════════════════════════════════════
                if (intent === 'pin_msg') {
                    if (!m.isGroup) { await reply('❌ This only works in groups.'); return }
                    const targetKey = m.quoted ? m.quoted.key : m.key
                    try {
                        await react('📌')
                        await conn.sendMessage(chat, { pin: { type: 1, time: 604800, key: targetKey } })
                        await react('✅')
                        await reply('📌 Message pinned for 7 days.')
                    } catch(e) { await react('❌'); await reply('❌ Failed to pin: ' + e.message) }
                    return
                }

                // ══ JOIN GROUP VIA LINK ═══════════════════════════════════════
                if (intent === 'group_join') {
                    if (!isOwner) { await reply('❌ Owner only.'); return }
                    const linkM = text.match(/chat\.whatsapp\.com\/([A-Za-z0-9]+)/)
                    if (!linkM) { await reply('❓ Include the group invite link.\nExample: *agent join https://chat.whatsapp.com/AbCdEfGhIjK*'); return }
                    try {
                        await react('🔗')
                        await conn.groupAcceptInvite(linkM[1])
                        await react('✅')
                        await reply('✅ Successfully joined the group!')
                    } catch(e) { await react('❌'); await reply('❌ Failed to join: ' + e.message) }
                    return
                }

                // ══ DEMOTE ALL NON-OWNER ADMINS ═══════════════════════════════
                if (intent === 'demote_all') {
                    if (!isOwner) { await reply('❌ Owner only.'); return }
                    if (!m.isGroup) { await reply('❌ Must be used in a group.'); return }
                    try {
                        await react('👇')
                        const meta = await conn.groupMetadata(chat)
                        const ownerJid = config.owner + '@s.whatsapp.net'
                        const admins = meta.participants.filter(p => p.admin && p.id !== ownerJid && p.id !== conn.user.id)
                        if (!admins.length) { await reply('ℹ️ No other admins to demote.'); return }
                        await conn.groupParticipantsUpdate(chat, admins.map(p => p.id), 'demote')
                        await react('✅')
                        await reply('✅ Demoted *' + admins.length + '* admin(s).')
                    } catch(e) { await react('❌'); await reply('❌ Failed: ' + e.message) }
                    return
                }

                // ══ BROADCAST TO ALL GROUPS ════════════════════════════════════
                if (intent === 'broadcast_groups') {
                    if (!isOwner) { await reply('❌ Owner only.'); return }
                    // Extract the message to broadcast
                    let bcMsg = text.replace(/\b(broadcast|send to all groups?|mass message|message all groups?)\b/gi, '').replace(/^[:\-\s]+/, '').trim()
                    if (!bcMsg) { await reply('❓ What should I broadcast?\nExample: *agent broadcast: Server will restart tonight*'); return }
                    try {
                        await react('📡')
                        const groups = Object.keys(conn.chats || {}).filter(j => j.endsWith('@g.us'))
                        let sent = 0
                        for (const g of groups) {
                            await conn.sendMessage(g, { text: bcMsg }).catch(() => {})
                            sent++
                            await new Promise(r => setTimeout(r, 500))
                        }
                        await react('✅')
                        await reply('✅ Broadcast sent to *' + sent + '* group(s):\n_' + bcMsg + '_')
                    } catch(e) { await react('❌'); await reply('❌ Broadcast failed: ' + e.message) }
                    return
                }

                // ══ RESTART BOT ════════════════════════════════════════════════
                if (intent === 'bot_restart') {
                    if (!isOwner) { await reply('❌ Owner only.'); return }
                    await react('🔄')
                    await reply('🔄 Restarting bot... I\'ll be back in a few seconds.')
                    setTimeout(() => { process.exit(0) }, 2000)
                    return
                }

                // ══ SET WHATSAPP STATUS/BIO ════════════════════════════════════
                if (intent === 'set_bio') {
                    if (!isOwner) { await reply('❌ Owner only.'); return }
                    let bioText = text.replace(/\b(set|change|update)\b.{0,20}\b(my|your|bot)?\s*(status|bio|about|story|wa\s*status)\b/gi, '').replace(/\bto\b/i, '').trim()
                    bioText = bioText.replace(/^["':\s]+|["'\s]+$/g, '').trim()
                    if (!bioText) { await reply('❓ What should my status say?\nExample: *agent set status to: Powered by Bera AI 🤖*'); return }
                    try {
                        await react('✍️')
                        await conn.updateProfileStatus(bioText)
                        await react('✅')
                        await reply('✅ Status updated to:\n_' + bioText + '_')
                    } catch(e) { await react('❌'); await reply('❌ Failed: ' + e.message) }
                    return
                }

                // ══ GET PROFILE PICTURE OF A NUMBER ═══════════════════════════
                if (intent === 'get_pp_number') {
                    if (!isOwner) { await reply('❌ Owner only.'); return }
                    const numMpp = text.match(/\b(\d{7,15})\b/)
                    if (!numMpp) { await reply('❓ Include a phone number.\nExample: *agent get pp of 254712345678*'); return }
                    const jidPp = numMpp[1] + '@s.whatsapp.net'
                    try {
                        await react('🖼️')
                        const ppUrl = await conn.profilePictureUrl(jidPp, 'image').catch(() => null)
                        if (!ppUrl) { await reply('❌ Couldn\'t fetch profile picture. The number may not have one or is not on WhatsApp.'); return }
                        await conn.sendMessage(chat, { image: { url: ppUrl }, caption: '🖼️ Profile picture of *+' + numMpp[1] + '*' }, { quoted: m })
                        await react('✅')
                    } catch(e) { await react('❌'); await reply('❌ Failed: ' + e.message) }
                    return
                }

                // ══ SET BOT DISPLAY NAME ═══════════════════════════════════════
                if (intent === 'set_bot_name') {
                    if (!isOwner) { await reply('❌ Owner only.'); return }
                    let newName = text.replace(/\b(set|change|update)\b.{0,20}\b(bot\s+)?(name|display\s+name|username)\b/gi, '').replace(/\bto\b/i, '').trim()
                    newName = newName.replace(/^["':\s]+|["'\s]+$/g, '').trim()
                    if (!newName || newName.length < 2) { await reply('❓ What should my new name be?\nExample: *agent set bot name to Bera Pro*'); return }
                    try {
                        await react('✏️')
                        await conn.updateProfileName(newName)
                        await react('✅')
                        await reply('✅ My display name is now *' + newName + '*')
                    } catch(e) { await react('❌'); await reply('❌ Failed: ' + e.message) }
                    return
                }

                // ══ LIST BANNED USERS ══════════════════════════════════════════
                if (intent === 'list_bans') {
                    if (!isOwner) { await reply('❌ Owner only.'); return }
                    const bans = global.db?.data?.blacklist || []
                    if (!bans.length) { await reply('✅ No users are currently banned.'); return }
                    const lines = bans.map((j, i) => (i+1) + '. +' + j.split('@')[0]).join('\n')
                    await reply('🚫 *Banned Users (' + bans.length + ')*\n\n' + lines)
                    return
                }

                // ══ UNBAN ALL USERS ════════════════════════════════════════════
                if (intent === 'unban_all') {
                    if (!isOwner) { await reply('❌ Owner only.'); return }
                    const prevCount = (global.db?.data?.blacklist || []).length
                    if (!prevCount) { await reply('✅ No users are banned — nothing to clear.'); return }
                    global.db.data.blacklist = []
                    await global.db.write()
                    await react('✅')
                    await reply('✅ All *' + prevCount + '* banned user(s) have been unbanned.')
                    return
                }

                // ══ SEND CONTACT CARD (vCard) ═══════════════════════════════════
                if (intent === 'send_vcard') {
                    if (!isOwner) { await reply('❌ Owner only.'); return }
                    const numMvc = text.match(/\b(\d{7,15})\b/)
                    if (!numMvc) { await reply('❓ Include a phone number.\nExample: *agent send contact 254712345678*'); return }
                    const vcardNum = numMvc[1]
                    try {
                        await react('📇')
                        const vcard = `BEGIN:VCARD\nVERSION:3.0\nFN:+${vcardNum}\nTEL;TYPE=CELL:+${vcardNum}\nEND:VCARD`
                        await conn.sendMessage(chat, { contacts: { displayName: '+' + vcardNum, contacts: [{ vcard }] } }, { quoted: m })
                        await react('✅')
                    } catch(e) { await react('❌'); await reply('❌ Failed: ' + e.message) }
                    return
                }

                // ══ DELETE QUOTED/THIS MESSAGE ═════════════════════════════════
                if (intent === 'delete_this') {
                    const delKey = m.quoted ? m.quoted.key : m.key
                    try {
                        await conn.sendMessage(chat, { delete: delKey })
                        await react('🗑️')
                    } catch(e) { await reply('❌ Couldn\'t delete: ' + e.message) }
                    return
                }

                // ══ ADMIN VIA AGENT ═══════════════════════════════════════════
                if (intent === 'admin_ban') {
                    if (!isOwner) { await reply('❌ Owner only.'); return }
                    const mns2 = m.message && m.message.extendedTextMessage && m.message.extendedTextMessage.contextInfo && m.message.extendedTextMessage.contextInfo.mentionedJid || []
                    const tgt2 = mns2[0] || (m.quoted && m.quoted.sender)
                    if (!tgt2) { await reply('❓ Mention or quote the user to ban.'); return }
                    if (!global.db.data.blacklist) global.db.data.blacklist = []
                    if (!global.db.data.blacklist.includes(tgt2)) { global.db.data.blacklist.push(tgt2); await global.db.write() }
                    try {
                        await react('🚫')
                        if (m.isGroup) await conn.groupParticipantsUpdate(chat, [tgt2], 'remove').catch(()=>{})
                        await reply('🚫 *@' + tgt2.split('@')[0] + '* has been banned!', { mentions: [tgt2] })
                    } catch(e) { await reply('❌ ' + e.message) }
                    return
                }

                if (intent === 'admin_unban') {
                    if (!isOwner) { await reply('❌ Owner only.'); return }
                    const mns3 = m.message && m.message.extendedTextMessage && m.message.extendedTextMessage.contextInfo && m.message.extendedTextMessage.contextInfo.mentionedJid || []
                    const nM3  = text.match(/\b(\d{6,15})\b/)
                    const tgt3 = mns3[0] || (nM3 ? nM3[1]+'@s.whatsapp.net' : null)
                    if (!tgt3) { await reply('❓ Mention the user to unban.'); return }
                    if (global.db.data.blacklist) { global.db.data.blacklist = global.db.data.blacklist.filter(j => j !== tgt3); await global.db.write() }
                    await react('✅'); await reply('✅ *@' + tgt3.split('@')[0] + '* unbanned!', { mentions: [tgt3] })
                    return
                }

                if (intent === 'admin_block') {
                    if (!isOwner) { await reply('❌ Owner only.'); return }
                    const mns4 = m.message && m.message.extendedTextMessage && m.message.extendedTextMessage.contextInfo && m.message.extendedTextMessage.contextInfo.mentionedJid || []
                    const tgt4 = mns4[0] || (m.quoted && m.quoted.sender)
                    if (!tgt4) { await reply('❓ Mention the user to block.'); return }
                    try { await react('🚫'); await conn.updateBlockStatus(tgt4, 'block'); await reply('✅ Blocked.', { mentions: [tgt4] }) }
                    catch(e) { await reply('❌ ' + e.message) }
                    return
                }

                if (intent === 'admin_unblock') {
                    if (!isOwner) { await reply('❌ Owner only.'); return }
                    const mns5 = m.message && m.message.extendedTextMessage && m.message.extendedTextMessage.contextInfo && m.message.extendedTextMessage.contextInfo.mentionedJid || []
                    const nM5  = text.match(/\b(\d{6,15})\b/)
                    const tgt5 = mns5[0] || (nM5 ? nM5[1]+'@s.whatsapp.net' : null)
                    if (!tgt5) { await reply('❓ Mention or number to unblock.'); return }
                    try { await react('✅'); await conn.updateBlockStatus(tgt5, 'unblock'); await reply('✅ Unblocked.') }
                    catch(e) { await reply('❌ ' + e.message) }
                    return
                }

                if (intent === 'admin_getpp') {
                    const mns7 = m.message && m.message.extendedTextMessage && m.message.extendedTextMessage.contextInfo && m.message.extendedTextMessage.contextInfo.mentionedJid || []
                    const tgt7 = mns7[0] || (m.quoted && m.quoted.sender) || sender
                    try {
                        await react('🖼️')
                        const ppUrl = await conn.profilePictureUrl(tgt7, 'image')
                        await conn.sendMessage(chat, { image: { url: ppUrl }, caption: '🖼️ Profile picture', mentions: [tgt7] }, { quoted: m })
                    } catch(e) { await reply('❌ No profile picture found or private.') }
                    return
                }

                if (intent === 'admin_mode') {
                    if (!isOwner) { await reply('❌ Owner only.'); return }
                    const modeM = text.match(/(?:public|private)/i)
                    const mode  = modeM ? modeM[0].toLowerCase() : null
                    if (!mode) { await reply('❓ Say: *Bera set bot mode public* or *private*'); return }
                    if (!global.db.data.settings) global.db.data.settings = {}
                    global.db.data.settings.mode = mode; await global.db.write()
                    await react('⚙️')
                    await reply('⚙️ Bot mode set to *' + mode + '*')
                    return
                }

                if (intent === 'admin_autotyping') {
                    if (!isOwner) { await reply('❌ Owner only.'); return }
                    const onOff = /(?:enable|turn\s+on|on)\b/i.test(text)
                    if (!global.db.data.settings) global.db.data.settings = {}
                    global.db.data.settings.autotyping = onOff; await global.db.write()
                    await react(onOff ? '✅' : '❌')
                    await reply('⌨️ Auto-typing ' + (onOff ? '*enabled*' : '*disabled*'))
                    return
                }

                if (intent === 'admin_sudo') {
                    if (!isOwner) { await reply('❌ Owner only.'); return }
                    const mns8 = m.message && m.message.extendedTextMessage && m.message.extendedTextMessage.contextInfo && m.message.extendedTextMessage.contextInfo.mentionedJid || []
                    const tgt8 = mns8[0]
                    if (!tgt8) { await reply('❓ Mention the user to give sudo access.'); return }
                    if (!global.db.data.sudo) global.db.data.sudo = []
                    if (!global.db.data.sudo.includes(tgt8)) { global.db.data.sudo.push(tgt8); await global.db.write() }
                    await react('🔑')
                    await reply('🔑 *@' + tgt8.split('@')[0] + '* now has sudo access!', { mentions: [tgt8] })
                    return
                }

                if (intent === 'remind' || intent === 'admin_remind') {
                    const rM = text.match(/remind\s+me\s+(?:to\s+)?(.+?)\s+(?:in|after)\s+(\d+)\s*(min(?:ute)?s?|hour?s?|sec(?:ond)?s?)/i)
                    if (!rM) { await reply('❓ Format: *Bera remind me to drink water in 5 minutes*'); return }
                    const task   = rM[1].trim()
                    const amount = parseInt(rM[2])
                    const unit   = rM[3].toLowerCase()
                    const ms     = unit.startsWith('h') ? amount*3600000 : unit.startsWith('s') ? amount*1000 : amount*60000
                    await react('⏰')
                    await reply('⏰ Got it! I will remind you to *' + task + '* in ' + amount + ' ' + unit + '.')
                    setTimeout(() => {
                        conn.sendMessage(chat, { text: '⏰ *REMINDER:*\n' + task }, { quoted: m }).catch(()=>{})
                    }, Math.min(ms, 24*3600000))
                    return
                }

                // ══ STICKER TOOLS ════════════════════════════════════════════
                if (intent === 'make_sticker') {
                    const sticSrc = m.quoted || (m.message && m.message.imageMessage ? m : null)
                    if (!sticSrc) { await reply('📸 Quote or send an image and say: *Bera make sticker*'); return }
                    try {
                        await react('🎭')
                        const buf = await conn.downloadMediaMessage(sticSrc)
                        await conn.sendMessage(chat, { sticker: buf }, { quoted: m })
                    } catch(e) { await reply('❌ ' + e.message) }
                    return
                }

                if (intent === 'sticker_to_img') {
                    const sticSrc2 = m.quoted
                    if (!sticSrc2 || !(sticSrc2.message && sticSrc2.message.stickerMessage)) { await reply('🎭 Quote a sticker and say: *Bera convert sticker to image*'); return }
                    try {
                        await react('🖼️')
                        const buf = await conn.downloadMediaMessage(sticSrc2)
                        await conn.sendMessage(chat, { image: buf, caption: '🖼️ Here you go!' }, { quoted: m })
                    } catch(e) { await reply('❌ ' + e.message) }
                    return
                }
                // ══ AI TOGGLE (natural language) ════════════════════════
                if (intent === 'ai_on' || intent === 'ai_off' || intent === 'ai_status') {
                    if (!isOwner) { await reply('❌ Owner only.'); return }
                    if (!global.db.data.chatbera) global.db.data.chatbera = {}
                    if (intent === 'ai_on')  global.db.data.chatbera.globalEnabled = true
                    if (intent === 'ai_off') global.db.data.chatbera.globalEnabled = false
                    await global.db.write()
                    const isOn   = global.db.data.chatbera.globalEnabled || false
                    const profile = global.db.data.chatbera.profile || {}
                    const msgs   = profile?.myMessages?.length || 412
                    const mode   = global.db?.data?.settings?.mode || 'public'
                    const bar    = isOn ? '▓▓▓▓▓▓▓▓▓▓' : '░░░░░░░░░░'
                    await reply(
                        '╭══〘 *🤖 BERA AI MODE* 〙═⊷\n' +
                        '┃\n' +
                        '┃  ' + (isOn ? '🟢' : '🔴') + ' Status  [' + bar + ']\n' +
                        '┃  ' + (isOn ? '✅ AI is ON' : '❌ AI is OFF') + '\n' +
                        '┃\n' +
                        '┃ 🧠 Trained on: *' + msgs + ' messages*\n' +
                        '┃ 🌐 Bot mode: *' + mode + '*\n' +
                        '┃ 💬 Replies: *' + (isOn ? 'All DMs — as Bera' : 'Disabled') + '*\n' +
                        '┃\n' +
                        (intent === 'ai_on'  ? '┃ ✅ AI turned ON\n' : '') +
                        (intent === 'ai_off' ? '┃ ❌ AI turned OFF\n' : '') +
                        '╰══════════════════⊷'
                    )
                    return
                }
                // ── NPM stats ───────────────────────────────────────────────
                if (intent === 'npm_stats') {
                    const pkgMatch =
                        text.match(/downloads?\s+(?:does\s+|for\s+)?([\w@][\w./\-@]+)/i) ||
                        text.match(/(?:npm|package)\s+([\w@][\w./\-@]+)/i) ||
                        text.match(/\b([\w-]+)\b\s+(?:npm|package)/i)
                    const pkg = pkgMatch ? pkgMatch[1] : null
                    if (pkg && pkg.length > 1) {
                        await react('📦')
                        const r = await agent.npmStats(pkg)
                        if (r.success) {
                            await reply(`╭══〘 *📦 NPM: ${r.pkg}* 〙═⊷\n┃ Version: *v${r.version}* | Author: ${r.author}\n┃\n┃ 📅 Weekly:  *${r.weekly}*\n┃ 📆 Monthly: *${r.monthly}*\n┃\n${r.description ? '┃ 📝 ' + r.description + '\n' : ''}┃ 🔗 npmjs.com/package/${r.pkg}\n╰══════════════════⊷`)
                        } else {
                            await reply(`❌ npm stats failed for *${pkg}*: ${r.error}`)
                        }
                        return
                    }
                }

                // ── Group member lookup ──────────────────────────────────────
                if (intent === 'group_lookup' && m.isGroup) {
                    const mentioned = m.message?.extendedTextMessage?.contextInfo?.mentionedJid || []
                    const targetJid = mentioned[0]
                    if (targetJid) {
                        await react('🔍')
                        try {
                            const meta   = await conn.groupMetadata(chat)
                            const member = meta.participants.find(p => p.id === targetJid)
                            if (member) {
                                const phone = member.id.replace(/@.+/, '')
                                const role  = member.admin === 'superadmin' ? '👑 Super Admin' : member.admin === 'admin' ? '🛡️ Admin' : '👤 Member'
                                await reply(`╭══〘 *🔍 MEMBER INFO* 〙═⊷\n┃ Name: *${member.pushName || 'Unknown'}*\n┃ Phone: +${phone}\n┃ Role: ${role}\n┃ JID: ${member.id}\n┃ WhatsApp: wa.me/${phone}\n╰══════════════════⊷`)
                            } else {
                                await reply('❌ That user is not in this group.')
                            }
                        } catch (e) { await reply('❌ Could not fetch group info: ' + e.message) }
                        return
                    }
                }

                // ── Group analyzer ───────────────────────────────────────────
                if (intent === 'group_analyze' && m.isGroup) {
                    await react('📊')
                    const r = await agent.groupAnalyzer(conn, chat)
                    if (r.success) {
                        await reply(
                            `╭══〘 *📊 GROUP STATS* 〙═⊷\n` +
                            `┃ 📛 Name: *${r.name}*\n` +
                            `┃ 👥 Members: *${r.total}* (${r.admins} admins, ${r.members} members)\n` +
                            `┃ 📅 Created: ${r.created}\n` +
                            `┃\n` +
                            `┃ 🛡️ Admins: ${r.adminList.slice(0,5).join(', ')}\n` +
                            (r.description ? `┃ 📝 ${r.description.slice(0, 100)}\n` : '') +
                            `╰══════════════════⊷`
                        )
                    } else {
                        await reply('❌ ' + r.error)
                    }
                    return
                }

                // ── System info ──────────────────────────────────────────────
                if (intent === 'system_info') {
                    await react('🖥️')
                    const r = await agent.systemInfo()
                    if (r.success) {
                        await reply(
                            `╭══〘 *🖥️ SYSTEM STATUS* 〙═⊷\n` +
                            `┃ 🧠 RAM:      ${r.ram}\n` +
                            `┃ ⚡ CPU:      ${r.cpu}\n` +
                            `┃ 💾 Disk:     ${r.disk}\n` +
                            `┃ ⏱️ Uptime:   ${r.uptime}\n` +
                            `┃ 🔄 Processes: ${r.processes}\n` +
                            `╰══════════════════⊷`
                        )
                    } else { await reply('❌ ' + r.error) }
                    return
                }

                // ── Port check ───────────────────────────────────────────────
                if (intent === 'port_check') {
                    const portMatch = text.match(/\b(\d{2,5})\b/)
                    if (portMatch) {
                        await react('🔌')
                        const r = await agent.portCheck(portMatch[1])
                        await reply(
                            `╭══〘 *🔌 PORT ${r.port}* 〙═⊷\n` +
                            `┃ Status: ${r.open ? '🟢 *OPEN / LISTENING*' : '🔴 *CLOSED / NOT IN USE*'}\n` +
                            `┃\n${fmt(r.info)}\n` +
                            `╰══════════════════⊷`
                        )
                        return
                    }
                }

                // ── Docker management ────────────────────────────────────────
                if (intent === 'docker') {
                    const actionMatch = text.match(/\b(list|ls|logs?|start|stop|restart|remove|rm|stats?|images?|all)\b/i)
                    const nameMatch   = text.match(/\b(?:logs?|start|stop|restart|remove|rm)\s+([\w-]+)/i)
                    const action = actionMatch ? actionMatch[1].toLowerCase().replace('ls','list').replace(/^image.*/,'images').replace(/^stat.*/,'stats') : 'list'
                    const name = nameMatch ? nameMatch[1] : null
                    await react('🐳')
                    const r = await agent.dockerManage(action, name)
                    await reply(
                        `╭══〘 *🐳 DOCKER: ${action.toUpperCase()}* 〙═⊷\n` +
                        `${fmt(r.output || 'No output')}\n` +
                        `╰══════════════════⊷`
                    )
                    return
                }

                // ── Cron management ──────────────────────────────────────────
                if (intent === 'cron') {
                    const actionMatch = text.match(/\b(list|add|clear|remove|show)\b/i)
                    const action = actionMatch ? actionMatch[1].toLowerCase() : 'list'
                    await react('⏰')
                    if (action === 'list' || action === 'show') {
                        const r = await agent.cronManage('list')
                        await reply(`╭══〘 *⏰ CRON JOBS* 〙═⊷\n${fmt(r.output)}\n╰══════════════════⊷`)
                    } else if (action === 'clear') {
                        const r = await agent.cronManage('clear')
                        await reply('✅ All cron jobs cleared.')
                    } else {
                        await reply('❓ Cron usage:\n• *show cron jobs*\n• *clear cron jobs*\n• *add cron: 0 2 * * * /path/script.sh*')
                    }
                    return
                }

                // ── Process kill ─────────────────────────────────────────────
                if (intent === 'process_kill') {
                    const pidMatch  = text.match(/\b(\d+)\b/)
                    const nameMatch = text.match(/\bkill\b\s+([\w-]+)/i)
                    const target = pidMatch ? pidMatch[1] : (nameMatch ? nameMatch[1] : null)
                    if (!target) { await reply('❓ Usage: *kill process <name>* or *kill pid 1234*'); return }
                    await react('💀')
                    const r = await agent.processKill(target)
                    await reply(`${r.success ? '✅' : '❌'} Process ${target}: ${r.output}`)
                    return
                }

                // ── HTTP request ─────────────────────────────────────────────
                if (intent === 'http_request') {
                    const methodMatch = text.match(/\b(GET|POST|PUT|PATCH|DELETE|CURL)\b/i)
                    const urlMatch    = text.match(/https?:\/\/[^\s]+/)
                    const method = methodMatch ? methodMatch[1].toUpperCase() : 'GET'
                    const url    = urlMatch ? urlMatch[0] : null
                    if (!url) { await reply('❓ Usage: *GET https://api.example.com/data*'); return }
                    await react('🌐')
                    await reply(`⏳ ${method} ${url}...`)
                    const r = await agent.httpRequest(method, url)
                    await reply(
                        `╭══〘 *🌐 HTTP ${method}* 〙═⊷\n` +
                        `┃ URL: ${url.slice(0,60)}\n┃\n` +
                        `${fmt(r.output || 'no response')}\n` +
                        `╰══════════════════⊷`
                    )
                    return
                }

                // ── Code review ──────────────────────────────────────────────
                if (intent === 'code_review') {
                    const quoted = m.message?.extendedTextMessage?.contextInfo?.quotedMessage
                    const code   = quoted?.conversation || quoted?.extendedTextMessage?.text || text.replace(/^.{0,50}review/i,'').trim()
                    if (!code || code.length < 10) { await reply('❓ Quote the code you want reviewed or paste it after: *review this code: ...*'); return }
                    await react('🔍')
                    await reply('🔍 Reviewing code...')
                    const r = await agent.codeReview(code)
                    await reply(`╭══〘 *🔍 CODE REVIEW* 〙═⊷\n\n${r.success ? r.text : '❌ ' + r.error}\n╰══════════════════⊷`)
                    return
                }

                // ── Code explain ─────────────────────────────────────────────
                if (intent === 'code_explain') {
                    const fileMatch = text.match(/\b([\w/]+\.\w+)\b/)
                    const fileName  = fileMatch ? fileMatch[1] : ''
                    const quoted    = m.message?.extendedTextMessage?.contextInfo?.quotedMessage
                    let code = quoted?.conversation || quoted?.extendedTextMessage?.text || ''
                    if (!code && fileName) {
                        const { runShell } = agent
                        const r = await runShell(`cat ${fileName} 2>/dev/null | head -100`)
                        code = r.output
                    }
                    if (!code) { await reply('❓ Quote the code or mention a file name: *explain Library/router.js*'); return }
                    await react('📖')
                    await reply('📖 Analyzing code...')
                    const r = await agent.codeExplain(code, fileName)
                    await reply(`╭══〘 *📖 CODE EXPLANATION* 〙═⊷\n\n${r.success ? r.text : '❌ ' + r.error}\n╰══════════════════⊷`)
                    return
                }

                // ── Bug finder ───────────────────────────────────────────────
                if (intent === 'bug_finder') {
                    const fileMatch = text.match(/\b([\w/]+\.\w+)\b/)
                    const fileName  = fileMatch ? fileMatch[1] : ''
                    const quoted    = m.message?.extendedTextMessage?.contextInfo?.quotedMessage
                    let code = quoted?.conversation || quoted?.extendedTextMessage?.text || ''
                    if (!code && fileName) {
                        const r = await agent.runShell(`cat ${fileName} 2>/dev/null | head -150`)
                        code = r.output
                    }
                    if (!code) { await reply('❓ Quote the code or say the file: *find bugs in index.js*'); return }
                    await react('🐛')
                    await reply('🐛 Scanning for bugs...')
                    const r = await agent.bugFinder(code, fileName)
                    await reply(`╭══〘 *🐛 BUG REPORT* 〙═⊷\n\n${r.success ? r.text : '❌ ' + r.error}\n╰══════════════════⊷`)
                    return
                }

                // ── Git status ───────────────────────────────────────────────
                if (intent === 'git_status') {
                    const folderMatch = text.match(/\b(?:in|for|on)\s+([\w/.-]+)\b/)
                    const folder = folderMatch ? folderMatch[1] : '.'
                    await react('📁')
                    const r = await agent.gitStatus(folder)
                    await reply(`╭══〘 *📁 GIT STATUS* 〙═⊷\n${fmt(r.output)}\n╰══════════════════⊷`)
                    return
                }

                // ── PM2 list ─────────────────────────────────────────────────
                if (intent === 'pm2_list') {
                    await react('⚙️')
                    const r = await agent.pm2Manage('list', null)
                    await reply(`╭══〘 *⚙️ PM2 PROCESSES* 〙═⊷\n${fmt(r.output || 'No processes')}\n╰══════════════════⊷`)
                    return
                }

                // ── PM2 logs ─────────────────────────────────────────────────
                if (intent === 'pm2_logs') {
                    const nm = text.match(/\blogs?\b.{0,20}\bfor\b\s+([\w-]+)/i) || text.match(/\b([\w-]+)\b.{0,10}\blogs?\b/i)
                    const procName = nm ? nm[1] : null
                    await react('📋')
                    const r = await agent.pm2Manage('logs', procName)
                    const lines = (r.output || 'No logs').split('\n').slice(-25).join('\n')
                    await reply(`╭══〘 *📋 PM2 LOGS${procName ? ': ' + procName : ''}* 〙═⊷\n${fmt(lines)}\n╰══════════════════⊷`)
                    return
                }

                // ── PM2 manage ───────────────────────────────────────────────
                if (intent === 'pm2_manage') {
                    const act  = (text.match(/\b(stop|start|restart|reboot|kill|delete)\b/i)||[])[1]?.toLowerCase()
                    const name = (text.match(/\b(?:stop|start|restart|kill|delete)\s+([\w-]+)/i)||[])[1]
                    if (!name) { await reply('❓ Which process? e.g. *restart bera-ai*'); return }
                    await react('⚙️')
                    const r = await agent.pm2Manage(act === 'reboot' ? 'restart' : (act || 'restart'), name)
                    await reply(`${r.success ? '✅' : '❌'} PM2 *${act?.toUpperCase()}* → ${name}\n${r.output.slice(0,300)}`)
                    return
                }

                // ── Project creation ─────────────────────────────────────────
                if (intent === 'project_create') {
                    const nm    = (text.match(/\b(?:project|app|called|named?)\s+([\w-]+)/i) || text.match(/\bcreate\s+(?:a\s+)?(?:new\s+)?([\w-]+)\s+(?:project|app)/i) || [])[1] || 'myapp'
                    const port  = parseInt((text.match(/\bport\s+(\d{2,5})\b/i)||[])[1] || '3000')
                    const type  = ((text.match(/\b(express|react|vue|flask|fastapi|next|node)\b/i)||[])[1] || 'express').toLowerCase()
                    await react('🏗️')
                    await reply(`🏗️ Creating *${nm}* (${type}, port ${port})...`)
                    const r = await agent.createProject(nm, type, port, text.slice(0,100))
                    if (r.success) {
                        await react('✅')
                        await reply(`╭══〘 *🚀 PROJECT READY* 〙═⊷\n┃ Name: *${r.name}*\n┃ Port: *${r.port}*\n┃ Dir: ${r.dir}\n┃\n┃ ${r.steps.map(s=>`${s.ok?'✅':'❌'} ${s.step}`).join(' | ')}\n┃\n┃ 📋 Logs: say "pm2 logs ${r.name}"\n┃ 🔄 Restart: say "restart ${r.name}"\n╰══════════════════⊷`)
                    } else {
                        await react('❌')
                        await reply('❌ Project creation failed.')
                    }
                    return
                }

                // ── Usage stats ──────────────────────────────────────────────
                if (intent === 'usage_stats') {
                    await react('📊')
                    const r = agent.usageStats()
                    if (r.success) {
                        await reply(
                            `╭══〘 *📊 BOT STATS* 〙═⊷\n` +
                            `┃ Total commands: *${r.total}*\n` +
                            `┃ Unique users:   *${r.users}*\n` +
                            `┃\n` +
                            (r.topCmds.length  ? `┃ 🏆 Top commands:\n┃  ${r.topCmds.join('\n┃  ')}\n┃\n` : '') +
                            (r.topUsers.length ? `┃ 👑 Top users:\n┃  ${r.topUsers.join('\n┃  ')}\n` : '') +
                            `╰══════════════════⊷`
                        )
                    } else { await reply('❌ ' + r.error) }
                    return
                }

                // ── Log analyze ──────────────────────────────────────────────
                if (intent === 'log_analyze') {
                    const fileMatch = text.match(/\b([\w/.]+\.log)\b/i)
                    const logFile   = fileMatch ? fileMatch[1] : null
                    const quoted    = m.message?.extendedTextMessage?.contextInfo?.quotedMessage
                    let logContent  = quoted?.conversation || quoted?.extendedTextMessage?.text || ''
                    if (!logContent && logFile) {
                        const r = await agent.runShell(`cat ${logFile} 2>/dev/null | tail -100`)
                        logContent = r.output
                    }
                    if (!logContent) { await reply('❓ Quote the logs or say the log file path: *analyze error.log*'); return }
                    await react('🔎')
                    await reply('🔎 Analyzing logs...')
                    const r = await agent.errorLogAnalyze(logContent)
                    await reply(`╭══〘 *🔎 LOG ANALYSIS* 〙═⊷\n\n${r.success ? r.text : '❌ ' + r.error}\n╰══════════════════⊷`)
                    return
                }

                // ── Backup ───────────────────────────────────────────────────
                if (intent === 'backup') {
                    const folderMatch = text.match(/\b(?:backup|zip|archive)\s+([\w/.~-]+)/i)
                    const folder = folderMatch ? folderMatch[1] : '/tmp/projects'
                    await react('💾')
                    await reply(`💾 Backing up *${folder}*...`)
                    const r = await agent.backupToGithub(folder)
                    await reply(`${r.success ? '✅' : '❌'} ${r.output}`)
                    return
                }

                // ── Schedule message ─────────────────────────────────────────
                if (intent === 'schedule_msg') {
                    const minMatch = text.match(/\bin\s+(\d+)\s+(minute|min|hour|hr|second|sec)/i)
                    if (!minMatch) { await reply('❓ Usage: *in 30 minutes send "reminder message"*'); return }
                    const amount = parseInt(minMatch[1])
                    const unit   = minMatch[2].toLowerCase()
                    const ms     = unit.startsWith('h') ? amount*3600000 : unit.startsWith('s') ? amount*1000 : amount*60000
                    const msgMatch = text.match(/["']([^"']+)["']/) || text.match(/send\s+(.+)$/i)
                    const msg = msgMatch ? msgMatch[1] : 'Reminder!'
                    await react('⏰')
                    const r = agent.scheduleMessage(conn, chat, `⏰ *Scheduled Reminder:*\n${msg}`, ms)
                    await reply(`✅ Scheduled: "${msg.slice(0,50)}" in *${amount} ${unit}${amount>1?'s':''}*`)
                    return
                }

                // ── BeraHost: deploy new bot ──────────────────────────────────
                if (intent === 'berahost_deploy') {
                    const { deployBot } = require('../Library/actions/berahost')
                    const nameMatch = text.match(/\b(?:deploy|host|create|called|named?)\s+([\w-]+)/i)
                    const repoMatch = text.match(/https?:\/\/github\.com\/[^\s]+/)
                    const ramMatch  = text.match(/(\d+)\s*(mb|ram|memory)/i)
                    const botName = nameMatch ? nameMatch[1] : 'new-bot'
                    const repoUrl = repoMatch ? repoMatch[0] : ''
                    const ram     = ramMatch  ? parseInt(ramMatch[1]) : 512
                    await react('🚀')
                    await reply(`🚀 Deploying *${botName}* on BeraHost...${repoUrl ? '\n📦 Repo: ' + repoUrl : ''}`)
                    const r = await deployBot(botName, repoUrl, sender.replace(/@.+/,''), ram)
                    await react(r.success ? '✅' : '❌')
                    await reply(r.success ? r.message : `❌ Deploy failed: ${r.error}`)
                    return
                }

                // ── BeraHost: list servers ────────────────────────────────────
                if (intent === 'berahost_list') {
                    const { listServers } = require('../Library/actions/berahost')
                    await react('🌐')
                    const r = await listServers()
                    if (r.success) {
                        const srvList = r.servers.length
                            ? r.servers.map((s,i) => `┃ ${i+1}. *${s.name}* | ${s.status} | RAM:${s.ram}MB CPU:${s.cpu}%`).join('\n')
                            : '┃ No servers found'
                        await reply(`╭══〘 *🌐 BERAHOST SERVERS* 〙═⊷\n┃ Total: ${r.servers.length}\n┃\n${srvList}\n╰══════════════════⊷`)
                    } else {
                        await reply(`❌ Could not list servers: ${r.error}`)
                    }
                    return
                }

                // ── BeraHost: power action ────────────────────────────────────
                if (intent === 'berahost_power') {
                    const { getServer, serverPower } = require('../Library/actions/berahost')
                    const actMatch  = text.match(/\b(start|stop|restart|kill)\b/i)
                    const nameMatch = text.match(/\b(?:start|stop|restart|kill)\b\s+([\w-]+)/i)
                    const action = actMatch  ? actMatch[1].toLowerCase()  : 'restart'
                    const name   = nameMatch ? nameMatch[1] : null
                    if (!name) { await reply('❓ Which server? e.g. *restart my-bot on berahost*'); return }
                    await react('⚙️')
                    const found = await getServer(name)
                    if (!found.success) { await reply(`❌ ${found.error}`); return }
                    const r = await serverPower(found.server.id, action)
                    await reply(`${r.success ? '✅' : '❌'} *${action.toUpperCase()}* → ${found.server.name}\n${r.output || r.error || ''}`)
                    return
                }

                // ── BeraHost: resources ───────────────────────────────────────
                if (intent === 'berahost_resources') {
                    const { listServers, serverResources } = require('../Library/actions/berahost')
                    await react('📊')
                    const list = await listServers()
                    if (!list.success || !list.servers.length) { await reply(`❌ No servers found or panel unreachable`); return }
                    const rows = await Promise.all(list.servers.slice(0,5).map(async s => {
                        const res = await serverResources(s.uuid)
                        return res.success
                            ? `┃ *${s.name}*: ${res.state} | CPU:${res.cpu} RAM:${res.ram} Up:${res.uptime}`
                            : `┃ *${s.name}*: unreachable`
                    }))
                    await reply(`╭══〘 *📊 SERVER RESOURCES* 〙═⊷\n${rows.join('\n')}\n╰══════════════════⊷`)
                    return
                }

                // ── GitHub token ─────────────────────────────────────────────
                if (intent === 'github_token') {
                    await react('🔑')
                    const r = await agent.githubTokenRegen(global.db?.data?.github?.token)
                    await reply(r.success
                        ? `╭══〘 *🔑 GITHUB TOKEN* 〙═⊷\n┃ Account: *${r.username}*\n┃ Status: ✅ Active\n┃\n┃ ${r.message.replace(/\n/g,'\n┃ ')}\n╰══════════════════⊷`
                        : `❌ GitHub token error: ${r.error}`)
                    return
                }

                // ── Git status ───────────────────────────────────────────────
                if (intent === 'git_status') {
                    const folder = (text.match(/\b(?:in|for|on)\s+([\w/.~-]+)\b/)||[])[1] || '.'
                    await react('📁')
                    const r = await agent.gitStatus(folder)
                    await reply(`╭══〘 *📁 GIT STATUS* 〙═⊷\n${fmt(r.output)}\n╰══════════════════⊷`)
                    return
                }

                // ══ CREATE POLL ════════════════════════════════════════════════
                if (intent === 'poll_create') {
                    // Format: "create a poll: Best framework? React | Vue | Angular"
                    const raw = text.replace(/\b(create|make|start|run)\s+(a\s+)?poll\s*:?\s*/i, '').trim()
                    const parts = raw.split(/[?!]\s*|\|\s*|,\s+(?=[A-Z])/).map(s => s.trim()).filter(Boolean)
                    const question = parts[0] || 'Poll'
                    const options  = parts.slice(1).filter(Boolean)
                    if (options.length < 2) {
                        await reply('❓ Format: *agent create a poll: Best language? JavaScript | Python | Go*\nNeed at least 2 options after the question.')
                        return
                    }
                    try {
                        await react('📊')
                        await conn.sendMessage(chat, {
                            poll: {
                                name: question.slice(0, 255),
                                values: options.slice(0, 12).map(o => o.slice(0, 100)),
                                selectableCount: 1
                            }
                        }, { quoted: m })
                        await react('✅')
                    } catch(e) { await react('❌'); await reply('❌ Poll failed: ' + e.message) }
                    return
                }

                // ══ RENAME GROUP ═══════════════════════════════════════════════
                if (intent === 'set_group_name') {
                    if (!m.isGroup) { await reply('❌ Must be used in a group.'); return }
                    let newGName = text.replace(/\b(rename|change|set|update)\b.{0,20}\b(group|gc|chat)\b.{0,10}\b(name\b)?/gi, '').replace(/\bto\b/i, '').trim()
                    newGName = newGName.replace(/^["':\s]+|["'\s]+$/g, '').trim()
                    if (!newGName || newGName.length < 2) { await reply('❓ What should the group be named?\nExample: *agent rename this group to Tech Masters*'); return }
                    try {
                        await react('✏️')
                        await conn.groupUpdateSubject(chat, newGName)
                        await react('✅')
                        await reply('✅ Group renamed to *' + newGName + '*')
                    } catch(e) { await react('❌'); await reply('❌ Failed: ' + e.message + ' (Need admin rights)') }
                    return
                }

                // ══ SET GROUP DESCRIPTION ══════════════════════════════════════
                if (intent === 'set_group_desc') {
                    if (!m.isGroup) { await reply('❌ Must be used in a group.'); return }
                    let descText = text.replace(/\b(set|change|update)\b.{0,20}\b(group\s+)?(description|desc|about|bio|info)\b/gi, '').replace(/\bto\b/i, '').trim()
                    descText = descText.replace(/^["':\s]+|["'\s]+$/g, '').trim()
                    if (!descText || descText.length < 2) { await reply('❓ What should the description say?\nExample: *agent set group description to: Welcome to our coding group!*'); return }
                    try {
                        await react('📝')
                        await conn.groupUpdateDescription(chat, descText)
                        await react('✅')
                        await reply('✅ Group description updated!')
                    } catch(e) { await react('❌'); await reply('❌ Failed: ' + e.message) }
                    return
                }

                // ══ SET GROUP PHOTO ════════════════════════════════════════════
                if (intent === 'set_group_photo') {
                    if (!m.isGroup) { await reply('❌ Must be used in a group.'); return }
                    const imgSrc = m.quoted || (m.message?.imageMessage ? m : null)
                    if (!imgSrc) { await reply('❓ Quote an image and say:\n*agent set this as group photo*'); return }
                    try {
                        await react('🖼️')
                        const buf = await conn.downloadMediaMessage(imgSrc)
                        await conn.updateProfilePicture(chat, buf)
                        await react('✅')
                        await reply('✅ Group photo updated!')
                    } catch(e) { await react('❌'); await reply('❌ Failed: ' + e.message) }
                    return
                }

                // ══ PROMOTE ALL MEMBERS TO ADMIN ═══════════════════════════════
                if (intent === 'promote_all') {
                    if (!isOwner) { await reply('❌ Owner only.'); return }
                    if (!m.isGroup) { await reply('❌ Must be used in a group.'); return }
                    try {
                        await react('👑')
                        const meta    = await conn.groupMetadata(chat)
                        const members = meta.participants.filter(p => !p.admin).map(p => p.id)
                        if (!members.length) { await reply('ℹ️ All members are already admins.'); return }
                        // Promote in batches of 10
                        for (let i = 0; i < members.length; i += 10) {
                            await conn.groupParticipantsUpdate(chat, members.slice(i, i+10), 'promote')
                            await new Promise(r => setTimeout(r, 500))
                        }
                        await react('✅')
                        await reply('✅ Promoted *' + members.length + '* member(s) to admin!')
                    } catch(e) { await react('❌'); await reply('❌ Failed: ' + e.message) }
                    return
                }

                // ══ KICK ALL NON-ADMIN MEMBERS ═════════════════════════════════
                if (intent === 'kick_non_admins') {
                    if (!isOwner) { await reply('❌ Owner only.'); return }
                    if (!m.isGroup) { await reply('❌ Must be used in a group.'); return }
                    try {
                        await react('🧹')
                        const meta    = await conn.groupMetadata(chat)
                        const botJid  = conn.user.id
                        const ownerJid = config.owner + '@s.whatsapp.net'
                        const toKick  = meta.participants.filter(p => !p.admin && p.id !== botJid && p.id !== ownerJid).map(p => p.id)
                        if (!toKick.length) { await reply('ℹ️ No non-admin members to remove.'); return }
                        await reply('⚠️ Removing *' + toKick.length + '* non-admin member(s)...')
                        for (let i = 0; i < toKick.length; i += 10) {
                            await conn.groupParticipantsUpdate(chat, toKick.slice(i, i+10), 'remove')
                            await new Promise(r => setTimeout(r, 600))
                        }
                        await react('✅')
                        await reply('✅ Done! Removed *' + toKick.length + '* member(s). Only admins remain.')
                    } catch(e) { await react('❌'); await reply('❌ Failed: ' + e.message) }
                    return
                }

                // ══ GET ALL MEMBER NUMBERS ════════════════════════════════════
                if (intent === 'get_all_numbers') {
                    if (!m.isGroup) { await reply('❌ Must be used in a group.'); return }
                    try {
                        await react('📋')
                        const meta    = await conn.groupMetadata(chat)
                        const numbers = meta.participants.map(p => '+' + p.id.split('@')[0]).join('\n')
                        await reply('📋 *Group Members (' + meta.participants.length + ')*\n\n' + numbers)
                    } catch(e) { await react('❌'); await reply('❌ Failed: ' + e.message) }
                    return
                }

                // ══ CHECK IF NUMBER IS ON WHATSAPP ════════════════════════════
                if (intent === 'check_wa') {
                    const numMchk = text.match(/\b(\d{7,15})\b/)
                    if (!numMchk) { await reply('❓ Include a phone number.\nExample: *agent check if 254712345678 is on WhatsApp*'); return }
                    const chkJid = numMchk[1] + '@s.whatsapp.net'
                    try {
                        await react('🔍')
                        const [result] = await conn.onWhatsApp(numMchk[1])
                        if (result && result.exists) {
                            await react('✅')
                            await reply('✅ *+' + numMchk[1] + '* is on WhatsApp!\n📱 JID: ' + result.jid)
                        } else {
                            await react('❌')
                            await reply('❌ *+' + numMchk[1] + '* is NOT on WhatsApp or number is invalid.')
                        }
                    } catch(e) { await react('❌'); await reply('❌ Check failed: ' + e.message) }
                    return
                }

                // ══ SET BOT PROFILE PICTURE ═══════════════════════════════════
                if (intent === 'set_bot_ppic') {
                    if (!isOwner) { await reply('❌ Owner only.'); return }
                    const imgSrc2 = m.quoted || (m.message?.imageMessage ? m : null)
                    if (!imgSrc2) { await reply('❓ Quote an image and say:\n*agent set this as your profile pic*'); return }
                    try {
                        await react('🖼️')
                        const buf2 = await conn.downloadMediaMessage(imgSrc2)
                        await conn.updateProfilePicture(conn.user.id, buf2)
                        await react('✅')
                        await reply('✅ My profile picture has been updated!')
                    } catch(e) { await react('❌'); await reply('❌ Failed: ' + e.message) }
                    return
                }

                // ══ SAVE NOTE ══════════════════════════════════════════════════
                if (intent === 'save_note') {
                    let noteText = text.replace(/\b(save|store|remember|note\s+down|write\s+down)\b.{0,15}\b(note|this|reminder)?\b\s*:?\s*/i, '').trim()
                    noteText = noteText || (m.quoted ? (m.quoted.text || '') : '')
                    if (!noteText || noteText.length < 2) { await reply('❓ What should I save?\nExample: *agent save note: Meeting tomorrow 3pm*'); return }
                    if (!global.db.data.notes) global.db.data.notes = {}
                    if (!global.db.data.notes[sender]) global.db.data.notes[sender] = []
                    const noteId = Date.now()
                    global.db.data.notes[sender].push({ id: noteId, text: noteText, time: new Date().toLocaleString() })
                    await global.db.write()
                    await react('📝')
                    await reply('📝 *Note saved!*\n\n_' + noteText + '_\n\nSay *agent show my notes* to view all.')
                    return
                }

                // ══ GET NOTES ═════════════════════════════════════════════════
                if (intent === 'get_notes') {
                    const myNotes = (global.db?.data?.notes?.[sender] || [])
                    if (!myNotes.length) { await reply('📝 You have no saved notes.\nSay *agent save note: your text here* to save one.'); return }
                    const lines = myNotes.map((n, i) => `${i+1}. ${n.text}\n   _${n.time}_`).join('\n\n')
                    await reply('📝 *Your Notes (' + myNotes.length + ')*\n\n' + lines)
                    return
                }

                // ══ CLEAR NOTES ═══════════════════════════════════════════════
                if (intent === 'clear_notes') {
                    const prev = (global.db?.data?.notes?.[sender] || []).length
                    if (!prev) { await reply('📝 No notes to clear.'); return }
                    if (!global.db.data.notes) global.db.data.notes = {}
                    global.db.data.notes[sender] = []
                    await global.db.write()
                    await react('🗑️')
                    await reply('✅ Cleared *' + prev + '* note(s).')
                    return
                }

                // ══ SOFT-MUTE A MEMBER ════════════════════════════════════════
                if (intent === 'mute_member') {
                    if (!isOwner) { await reply('❌ Owner only.'); return }
                    if (!m.isGroup) { await reply('❌ Must be used in a group.'); return }
                    const muteTargetJids = m.message?.extendedTextMessage?.contextInfo?.mentionedJid || []
                    const muteTarget = muteTargetJids[0] || (m.quoted && m.quoted.sender)
                    if (!muteTarget) { await reply('❓ Mention the user to mute.\nExample: *agent mute @user*'); return }
                    if (!global.db.data.mutedMembers) global.db.data.mutedMembers = {}
                    if (!global.db.data.mutedMembers[chat]) global.db.data.mutedMembers[chat] = []
                    if (!global.db.data.mutedMembers[chat].includes(muteTarget)) {
                        global.db.data.mutedMembers[chat].push(muteTarget)
                        await global.db.write()
                    }
                    await react('🔇')
                    await conn.sendMessage(chat, {
                        text: '🔇 *@' + muteTarget.split('@')[0] + '* has been muted. Their messages will be auto-deleted.',
                        mentions: [muteTarget]
                    }, { quoted: m })
                    return
                }

                // ══ UNMUTE A MEMBER ═══════════════════════════════════════════
                if (intent === 'unmute_member') {
                    if (!isOwner) { await reply('❌ Owner only.'); return }
                    if (!m.isGroup) { await reply('❌ Must be used in a group.'); return }
                    const unmuteTargetJids = m.message?.extendedTextMessage?.contextInfo?.mentionedJid || []
                    const unmuteTarget = unmuteTargetJids[0] || (m.quoted && m.quoted.sender)
                    if (!unmuteTarget) { await reply('❓ Mention the user to unmute.'); return }
                    if (global.db.data.mutedMembers?.[chat]) {
                        global.db.data.mutedMembers[chat] = global.db.data.mutedMembers[chat].filter(j => j !== unmuteTarget)
                        await global.db.write()
                    }
                    await react('🔊')
                    await conn.sendMessage(chat, {
                        text: '🔊 *@' + unmuteTarget.split('@')[0] + '* has been unmuted.',
                        mentions: [unmuteTarget]
                    }, { quoted: m })
                    return
                }

                // ══ REVEAL BOT NUMBER ══════════════════════════════════════════
                if (intent === 'reveal_bot_number') {
                    const botNum = (conn.user?.id || '').split(':')[0].split('@')[0]
                    await reply(
                        '╭══〘 *🤖 BOT INFO* 〙═⊷\n' +
                        '┃ 📱 Number: *+' + botNum + '*\n' +
                        '┃ 🔗 wa.me/' + botNum + '\n' +
                        '┃ 🆔 JID: ' + conn.user?.id + '\n' +
                        '┃ 📛 Name: ' + (conn.user?.name || 'Bera AI') + '\n' +
                        '╰══════════════════⊷'
                    )
                    return
                }

                // ══ LOCK GROUP INFO (admin-only edit) ═════════════════════════
                if (intent === 'lock_group_info') {
                    if (!m.isGroup) { await reply('❌ Must be used in a group.'); return }
                    try {
                        await react('🔒')
                        await conn.groupSettingUpdate(chat, 'not_announcement')
                        await conn.groupSettingUpdate(chat, 'locked')
                        await react('✅')
                        await reply('🔒 Group info is now *locked* — only admins can edit it.')
                    } catch(e) { await react('❌'); await reply('❌ Failed: ' + e.message) }
                    return
                }

                // ══ GENERATE OTP / RANDOM CODE ════════════════════════════════
                if (intent === 'generate_otp') {
                    const lenM  = text.match(/\b(\d+)[- ]?digit\b/i)
                    const len   = lenM ? Math.min(parseInt(lenM[1]), 12) : 6
                    const isPin = /\bpin\b/i.test(text)
                    const otp   = isPin
                        ? String(Math.floor(Math.random() * Math.pow(10, len))).padStart(len, '0')
                        : Array.from({length: len}, () => Math.floor(Math.random() * 10)).join('')
                    const typeStr = /passphrase/i.test(text)
                        ? ['alpha', 'bravo', 'charlie', 'delta', 'echo', 'foxtrot', 'golf', 'hotel']
                            .sort(() => Math.random() - 0.5).slice(0, 3).join('-')
                        : otp
                    await react('🔑')
                    await reply(
                        '╭══〘 *🔑 ' + (isPin ? 'PIN' : 'OTP') + ' GENERATED* 〙═⊷\n' +
                        '┃\n' +
                        '┃  🔢 Code: *' + typeStr + '*\n' +
                        '┃  📏 Length: ' + len + ' digit' + (len > 1 ? 's' : '') + '\n' +
                        '┃\n' +
                        '┃  ⚠️ _One-time use only_\n' +
                        '╰══════════════════⊷'
                    )
                    return
                }

                // ══ WHOIS LOOKUP ═══════════════════════════════════════════════
                if (intent === 'whois_lookup') {
                    const domainM = text.match(/([\w-]+\.[a-zA-Z]{2,})/i)
                    if (!domainM) { await reply('❓ Include a domain.\nExample: *agent whois google.com*'); return }
                    try {
                        await react('🔍')
                        const { exec } = require('child_process')
                        const out = await new Promise((res, rej) => exec('whois ' + domainM[1] + ' 2>&1', { timeout: 10000 }, (e, o) => e && !o ? rej(e) : res(o || '')))
                        const lines = out.split('\n').filter(l => /registrar|expir|creat|status|name\s*server/i.test(l)).slice(0, 12).join('\n')
                        await reply('╭══〘 *🔍 WHOIS: ' + domainM[1] + '* 〙═⊷\n' + fmt(lines || 'No WHOIS data found') + '\n╰══════════════════⊷')
                    } catch(e) { await react('❌'); await reply('❌ WHOIS failed: ' + e.message) }
                    return
                }

                // ══ PING HOST ══════════════════════════════════════════════════
                if (intent === 'ping_host') {
                    const hostM = text.match(/([\w.-]+\.[a-zA-Z]{2,}|\d{1,3}(?:\.\d{1,3}){3})/i)
                    if (!hostM) { await reply('❓ Include a host.\nExample: *agent ping google.com*'); return }
                    try {
                        await react('🏓')
                        const { exec } = require('child_process')
                        const out = await new Promise((res, rej) => exec('ping -c 4 ' + hostM[1] + ' 2>&1', { timeout: 15000 }, (e, o) => res(o || e?.message || 'No response')))
                        const summary = out.split('\n').filter(l => /rtt|ping|ms|loss|transmitted/i.test(l)).join('\n') || out.split('\n').slice(-5).join('\n')
                        await reply('╭══〘 *🏓 PING: ' + hostM[1] + '* 〙═⊷\n' + fmt(summary || out.slice(0, 300)) + '\n╰══════════════════⊷')
                    } catch(e) { await react('❌'); await reply('❌ Ping failed: ' + e.message) }
                    return
                }

                // ══ TRANSFER GROUP OWNERSHIP ═══════════════════════════════════
                if (intent === 'transfer_owner') {
                    if (!isOwner) { await reply('❌ Owner only.'); return }
                    if (!m.isGroup) { await reply('❌ Must be used in a group.'); return }
                    const toJids = m.message?.extendedTextMessage?.contextInfo?.mentionedJid || []
                    const toNum  = text.match(/\b(\d{7,15})\b/)
                    const newOwner = toJids[0] || (toNum ? toNum[1] + '@s.whatsapp.net' : null) || (m.quoted && m.quoted.sender)
                    if (!newOwner) { await reply('❓ Mention the user to make owner.\nExample: *agent make @user the group owner*'); return }
                    try {
                        await react('👑')
                        await conn.groupParticipantsUpdate(chat, [newOwner], 'promote')
                        await conn.groupParticipantsUpdate(chat, [newOwner], 'super_admin').catch(() => {})
                        await react('✅')
                        await reply('👑 *@' + newOwner.split('@')[0] + '* has been made group owner!', { mentions: [newOwner] })
                    } catch(e) { await react('❌'); await reply('❌ Failed: ' + e.message) }
                    return
                }

                // ══ PM ALL GROUP MEMBERS ═══════════════════════════════════════
                if (intent === 'pm_all_members') {
                    if (!isOwner) { await reply('❌ Owner only.'); return }
                    if (!m.isGroup) { await reply('❌ Must be used in a group.'); return }
                    let pmMsg = text.replace(/\b(pm|message|text|send)\b.{0,20}\b(all\s+)?(members?|participants?|everyone)\b/gi, '').replace(/^[:\-\s]+/, '').trim()
                    pmMsg = pmMsg || (m.quoted ? (m.quoted.text || '') : '')
                    if (!pmMsg || pmMsg.length < 2) { await reply('❓ What message should I send?\nExample: *agent pm all members: Group meeting at 5pm tonight!*'); return }
                    try {
                        await react('📨')
                        const meta    = await conn.groupMetadata(chat)
                        const botJid  = conn.user.id
                        const members = meta.participants.filter(p => p.id !== botJid)
                        await reply('📨 Sending to *' + members.length + '* members...')
                        let success = 0
                        for (const p of members) {
                            await conn.sendMessage(p.id, { text: pmMsg }).catch(() => {})
                            success++
                            await new Promise(r => setTimeout(r, 800))
                        }
                        await react('✅')
                        await reply('✅ Message delivered to *' + success + '* member(s)!')
                    } catch(e) { await react('❌'); await reply('❌ Failed: ' + e.message) }
                    return
                }

                // ══ GROUP PROTECTION STATUS ════════════════════════════════════
                if (intent === 'group_protection') {
                    if (!m.isGroup) { await reply('❌ Must be used in a group.'); return }
                    const gSettings = global.db?.data?.settings?.[chat] || {}
                    const checkOn   = (key) => gSettings[key] ? '🟢 ON' : '🔴 OFF'
                    await reply(
                        '╭══〘 *🛡️ GROUP PROTECTION* 〙═⊷\n' +
                        '┃\n' +
                        '┃ 🔗 Anti-Link:     ' + checkOn('antilink') + '\n' +
                        '┃ 🚫 Anti-Spam:     ' + checkOn('antispam') + '\n' +
                        '┃ 🗑️ Anti-Delete:   ' + checkOn('antidelete') + '\n' +
                        '┃ 🤖 Anti-Bot:      ' + checkOn('antibot') + '\n' +
                        '┃ 🔞 Anti-Nsfw:     ' + checkOn('antinsfw') + '\n' +
                        '┃ 👋 Welcome Msg:   ' + checkOn('welcome') + '\n' +
                        '┃ 👋 Goodbye Msg:   ' + checkOn('bye') + '\n' +
                        '┃ 📝 Bad Words:     ' + checkOn('antibadwords') + '\n' +
                        '┃\n' +
                        '┃ Say *agent enable anti-link* to toggle any.\n' +
                        '╰══════════════════⊷'
                    )
                    return
                }

                // ══ TOGGLE BAD WORD FILTER ════════════════════════════════════
                if (intent === 'toggle_badwords') {
                    if (!isOwner) { await reply('❌ Owner only.'); return }
                    if (!m.isGroup) { await reply('❌ Must be used in a group.'); return }
                    if (!global.db.data.settings) global.db.data.settings = {}
                    if (!global.db.data.settings[chat]) global.db.data.settings[chat] = {}
                    const isEnable = /enable|turn\s+on|on\b/i.test(text)
                    global.db.data.settings[chat].antibadwords = isEnable
                    await global.db.write()
                    await react(isEnable ? '✅' : '❌')
                    await reply((isEnable ? '✅ Bad word filter *ENABLED*' : '❌ Bad word filter *DISABLED*') + '\nMessages containing profanity will be auto-deleted.')
                    return
                }

                // ══ TOGGLE ANTI-SPAM ═══════════════════════════════════════════
                if (intent === 'toggle_antispam') {
                    if (!isOwner) { await reply('❌ Owner only.'); return }
                    if (!m.isGroup) { await reply('❌ Must be used in a group.'); return }
                    if (!global.db.data.settings) global.db.data.settings = {}
                    if (!global.db.data.settings[chat]) global.db.data.settings[chat] = {}
                    const isEnable2 = /enable|turn\s+on|on\b/i.test(text)
                    global.db.data.settings[chat].antispam = isEnable2
                    await global.db.write()
                    await react(isEnable2 ? '✅' : '❌')
                    await reply((isEnable2 ? '✅ Anti-spam *ENABLED*' : '❌ Anti-spam *DISABLED*'))
                    return
                }

                // ══ COUNTDOWN ═════════════════════════════════════════════════
                if (intent === 'countdown') {
                    const numCd  = text.match(/(\d+)\s*(sec(?:ond)?s?|min(?:ute)?s?|hour?s?)/i)
                    if (!numCd) { await reply('❓ Format: *agent countdown 3 minutes*'); return }
                    const amount = parseInt(numCd[1])
                    const unit   = numCd[2].toLowerCase()
                    const ms     = unit.startsWith('h') ? amount*3600000 : unit.startsWith('m') ? amount*60000 : amount*1000
                    if (ms > 3600000) { await reply('❌ Countdown limit is 1 hour max.'); return }
                    await react('⏳')
                    await reply('⏳ *Countdown started:* ' + amount + ' ' + unit + '\nI\'ll ping here when it\'s done!')
                    setTimeout(async () => {
                        try {
                            await conn.sendMessage(chat, { text: '🔔 *TIME\'S UP!*\nYour ' + amount + ' ' + unit + ' countdown has ended! ⏰' }, { quoted: m })
                        } catch(e) {}
                    }, ms)
                    return
                }

                // ── Fallback: delegate remaining intents to bera.js handleAction ─
                // This handles: github_create_repo, github_list_repos, github_delete_repo,
                // github_create_project, github_push_file, github_create_issue, github_fork,
                // github_branches, github_create_branch, github_commits, github_repo_info,
                // github_list_files, music, image_gen, translate, download, transcribe,
                // search, schedule_msg, code_run, code_validate, code_build, code_explain,
                // code_review, bug_finder, and any future intent added to bera.js
                {
                    const beraIntents = [
                        'github_create_repo','github_list_repos','github_delete_repo',
                        'github_create_project','github_push_file','github_create_issue',
                        'github_fork','github_branches','github_create_branch',
                        'github_commits','github_repo_info','github_list_files',
                        'github','music','image_gen','translate','download',
                        'transcribe','search','schedule_msg',
                        'code_run','code_validate','code_build','code_explain',
                        'git_clone','git_push','chat','fun_joke','fun_fact',
                        'fun_quote','fun_coin','fun_8ball','fun_truth','fun_dare',
                        'fun_ship','fun_roast','fun_story','fun_rap','fun_riddle',
                        'fun_motivate','gen_password','fun_trivia','menu',
                        'translate','bot_update','bot_status',
                        'server_stats','pm2_list','pm2_logs','pm2_restart','pm2_stop','bot_stats',
                        'group_kick','group_add','group_promote','group_demote','group_mute',
                        'group_unmute','group_link','group_tagall','group_admins','group_info','group_warn'
                    ]
                    if (beraIntents.includes(intent) && intent !== 'chat') {
                        try {
                            const { handleAction } = require('../Commands/bera')
                            await handleAction(m, conn, reply, text, sender, null)
                        } catch (e) {
                            console.error('[BERA-FALLBACK]', e.message)
                        }
                        return
                    }
                }

                // ── DEFAULT: route any unhandled "Bera <text>" through the FULL AGENT LOOP ──
                // This gives the AI access to every tool: cmd (any bot command),
                // writefile, mkdir, bash, gitclone, gitpush, gitrepo, pm2, etc.
                // So "Bera ping", "Bera build me a stopwatch", "Bera kick @x" all
                // get executed instead of just chatted about.
                try {
                    console.log('[BERA-AGENT] 🤖 Routing to full agent loop:', text.slice(0, 60))
                    const { generateAdvancedReply } = require('../Library/actions/beraai')
                    conn.sendPresenceUpdate('composing', chat).catch(() => {})
                    react('🤖')
                    // Strip the leading "Bera" so the AI sees the real instruction
                    const cleaned = text.replace(/^\s*bera[,:\s]+/i, '').trim() || text
                    const result = await generateAdvancedReply(cleaned, chat, conn, m, { agentMode: true, MAX_LOOPS: 12 })
                    if (result && result.success && result.reply) {
                        await reply(result.reply)
                    } else if (result && result.reply) {
                        await reply(result.reply)
                    } else {
                        await reply('🤖 (no response)')
                    }
                } catch (e) {
                    console.error('[BERA-AGENT ERROR]', e.message)
                    await reply('❌ Agent error: ' + e.message)
                }
                return
            }
            // ═══════════════════════════════════════════════════════════════

            // ── ChatBera mode: reply as the owner when activated ──────────────
            // ChatBera: global mode OR per-chat mode
            // Does NOT fire when the agent already handled the message (bera mentioned)
            const chatberaGlobal = global.db?.data?.chatbera?.globalEnabled
            const chatberaChat   = global.db?.data?.chatbera?.enabled?.[chat]
            const chatberaOn = chatberaGlobal || chatberaChat
            // Skip if message is from a group (PMs only) unless group mode enabled
            const chatberaGroupOk = global.db?.data?.chatbera?.groupEnabled || false
            if (chatberaOn && !m.fromMe && text && !_agentAllowed && (!m.isGroup || chatberaGroupOk)) {
                console.log('[CHATBERA] 🔥 Triggered for msg:', text.slice(0, 30), '| from:', sender)
                try {
                    const { generateAdvancedReply } = require('../Library/actions/beraai')
                    conn.sendPresenceUpdate('composing', chat).catch(() => {})
                    await new Promise(r => setTimeout(r, 800 + Math.random() * 1500))
                    const result = await generateAdvancedReply(text, chat, conn, m)
                    if (result.success && result.reply) {
                        if (result.toolUsed) {
                            await conn.sendMessage(chat, { react: { text: '🔧', key: m.key } }).catch(() => {})
                        }
                        await conn.sendMessage(chat, { text: result.reply }, { quoted: m })
                    }
                    conn.sendPresenceUpdate('paused', chat).catch(() => {})
                } catch (e) {
                    console.error('[CHATBERA]', e.message)
                }
            }

            return  // ← FAST EXIT: no handler loops for non-commands
        }

        // ── COMMAND PATH ──────────────────────────────────────────────────
        const handler = commandMap.get(command)
        if (!handler) return

        if (!authorized) {
            return conn.sendMessage(chat, {
                text:
                    `╭══〘 *🔒 PRIVATE MODE* 〙═⊷\n` +
                    `┃❍ Bera AI is currently in private mode.\n` +
                    `┃❍ Only the owner can use the bot right now.\n` +
                    `╰══════════════════⊷`
            }, { quoted: m })
        }

        const user = getUser(sender)
        checkLimit(user, isOwner)

        user.commandCount = (user.commandCount || 0) + 1
        if (!global.db.data.stats) global.db.data.stats = { totalCommands: 0 }
        global.db.data.stats.totalCommands = (global.db.data.stats.totalCommands || 0) + 1
        debouncedDbWrite()  // batch DB writes — much faster than awaiting every time

        const isGroup = m.isGroup || (chat && chat.includes('@g.us')) || false
        const isAdmin = isGroup
            ? ((await (async()=>{ try{ const meta = await conn.groupMetadata(chat); const me = conn.user?.id?.split(':')[0]+'@s.whatsapp.net'; return (meta.participants||[]).some(p=>p.id===me && p.admin) }catch{return false} })()))
            : false
        const ctx = {
            conn,
            m,
            text: body,
            args,
            command,
            sender,
            chat,
            prefix,
            isOwner,
            isGroup,
            isAdmin,
            isAuthorized: authorized,
            reply: (txt) => conn.sendMessage(chat, { text: String(txt) }, { quoted: m }),
        }

        if (global.db?.data?.settings?.autoTyping !== false) {
            conn.sendPresenceUpdate('composing', chat).catch(() => {})
        }

        if (typeof handler === 'function') {
            await handler(m, ctx)
        } else if (typeof handler?.all === 'function') {
            await handler.all(m, ctx)
        } else {
            console.warn('[HANDLER] No callable found for command:', command)
        }

        if (global.db?.data?.settings?.autoTyping !== false) {
            conn.sendPresenceUpdate('paused', chat).catch(() => {})
        }

    } catch (e) {
        console.error('[HANDLER ERROR]', e.message)
        console.error(e.stack?.split('\n').slice(0, 5).join('\n'))
    }
}

// ── runCommand: lets the AI agent invoke ANY built-in command by name ─────────
// Constructs the same ctx object the normal command path uses, then calls the handler.
const _RUNCMD_BLOCKLIST = new Set(['bera', 'agent', 'beratrigger', 'beratrig', 'beralisten', 'chatbot', 'eval', 'exec', 'shell', '$', '>'])
const runCommand = async (commandName, argsString, m, conn) => {
    try {
        const cmdLower = String(commandName || '').toLowerCase().trim().replace(/^[./!]+/, '')
        if (_RUNCMD_BLOCKLIST.has(cmdLower)) {
            return { success: false, error: `Command '${cmdLower}' is blocked from AI invocation to prevent recursion or abuse.` }
        }
        const handler = commandMap.get(cmdLower)
        if (!handler) return { success: false, error: `Unknown command: ${commandName}` }

        const text = String(argsString || '').trim()
        const args = text ? text.split(/\s+/) : []
        const chat = m.key?.remoteJid || m.chat
        const sender = m.key?.participant || m.key?.remoteJid || m.sender
        const { authorized: _authd, isOwner: _isOwn } = (() => {
            try { return isAuthorized(sender) } catch { return { authorized: false, isOwner: false } }
        })()
        const isOwner = !!_isOwn
        const isGroup = !!(chat && chat.includes('@g.us'))
        let isAdmin = false
        if (isGroup) {
            try {
                const meta = await conn.groupMetadata(chat)
                const me = (sender || '')
                isAdmin = (meta.participants || []).some(p => p.id === me && p.admin)
            } catch {}
        }
        const prefix = getPrefix()
        const captured = []
        const reply = async (txt) => {
            captured.push(String(txt))
            try { await conn.sendMessage(chat, { text: String(txt) }, { quoted: m }) } catch {}
        }
        const ctx = {
            conn, m, text, args, command: cmdLower, sender, chat, prefix,
            isOwner, isGroup, isAdmin, isAuthorized: !!_authd, reply
        }
        if (typeof handler === 'function') await handler(m, ctx)
        else if (typeof handler.all === 'function') await handler.all(m, ctx)
        else if (typeof handler.handler === 'function') await handler.handler(m, ctx)
        else return { success: false, error: 'Handler has no callable function.' }
        return { success: true, message: captured.join('\n').slice(0, 1000) || 'Command executed.' }
    } catch (e) {
        return { success: false, error: e.message }
    }
}

module.exports = { handleMessage, handleGroupEvents, handleReaction, handleAntiDelete, handleAntiEdit, runCommand }
