'use strict'

const config = require('../Config')
const { findMedia, extractViewOnceText, isViewOnceMessage, downloadMediaContent, downloadViewOnceFirst, buildResendPayload } = require('../Library/lib/baileys-media')
const rawStore = require('../Library/lib/view-once-store')
// Phase 4 (spec §25): view-once recovery is disabled by default. Only an
// explicit owner opt-in (BERA_ALLOW_VIEWONCE_RECOVERY=1 or the
// allowViewOnceRecovery setting) enables it; otherwise the command answers
// with the standard unsupported response and recovers nothing. The owner
// opted in on 2026-11-25 and the bot runs with the env flag set.
//
// Download strategy (2026-11-25): WhatsApp strips the media URL/directPath
// from quoted view-once copies, and official Baileys throws on that before
// it can re-upload — so recovery goes through downloadViewOnceFirst, which
// tries the xspacesocket fork's downloadViewOnceMessage (re-requests the
// media from the sender's device when only a mediaKey is present) before
// the official download paths.
const { isViewOnceRecoveryAllowed, VIEWONCE_RECOVERY } = require('../Library/lib/recovery-gate')

if (typeof global.antivvEnabled === 'undefined') global.antivvEnabled = true

function ownerJid() {
    const number = String(config.owner || config.ownerNumber || '').replace(/\D/g, '')
    return number ? `${number}@s.whatsapp.net` : null
}

function rawFromQuoted(ctx, message) {
    const quoted = message.quoted
    const id = quoted?.key?.id || quoted?.id
    const chats = [ctx.jid, quoted?.key?.remoteJid, message.key?.remoteJid].filter(Boolean)
    for (const chat of [...new Set(chats)]) {
        const raw = id && rawStore.get(chat, id)
        if (raw) return raw
    }
    return (quoted?.message ? { key: quoted.key, message: quoted.message } : null)
}

function senderOf(quoted, ctx) {
    return quoted?.sender || quoted?.key?.participant || ctx.from || ctx.sender || ''
}

async function groupLabel(sock, jid, isGroup) {
    if (!isGroup) return 'private chat'
    try { return (await sock.groupMetadata(jid))?.subject || 'group chat' } catch { return 'group chat' }
}

function infoText({ sender, group, originalCaption = '' }) {
    const digits = String(sender || '').split('@')[0].split(':')[0]
    const mention = digits ? `@${digits}` : 'unknown sender'
    return `🔐 *View-once saved*\n> From: ${mention}\n> Chat: ${group}${originalCaption ? `\n> Caption: ${originalCaption.slice(0, 500)}` : ''}`
}

async function recover(sock, message, ctx) {
    const quoted = message.quoted
    const raw = rawFromQuoted(ctx, message)

    // Arrival cache first: media captured the moment it arrived (antiviewonce)
    // needs no download and no re-upload gamble.
    const quotedId = quoted?.key?.id || quoted?.id
    const chat = ctx.jid || message.key?.remoteJid
    if (quotedId && chat) {
        try {
            const cached = require('../Library/lib/view-once-cache').get(chat, quotedId)
            if (cached?.buffer?.length) {
                const meta = cached.meta || {}
                const media = { kind: meta.kind, field: meta.field, content: { mimetype: meta.mimetype, caption: meta.caption || '', fileName: meta.fileName, ptt: meta.ptt, gifPlayback: meta.gifPlayback } }
                return { quoted, raw, media, buffer: cached.buffer }
            }
        } catch {}
    }

    const media = findMedia(raw?.message) || findMedia(quoted?.message) || findMedia(message.message)
    if (!media) {
        // Media-less view-once (e.g. an interactive text card): reveal its text.
        const text = extractViewOnceText(raw?.message) || extractViewOnceText(quoted?.message)
        if (text) return { quoted, raw, media: null, buffer: null, textOnly: text }
        throw new Error('Reply to a view-once image, video, audio, sticker, or document.')
    }

    // Candidates in order: the stored original (full media fields, captured
    // when the message arrived) first, then the quoted copy itself (stripped
    // by WhatsApp — recoverable only via the fork's reupload-first path).
    const candidates = []
    if (raw) candidates.push(raw)
    if (quoted?.message && raw?.message !== quoted.message) candidates.push({ key: quoted.key, message: quoted.message })

    let buffer = null
    let lastError = null
    for (const candidate of candidates) {
        try { buffer = await downloadViewOnceFirst(candidate, media, sock) } catch (e) { lastError = e }
        if (buffer?.length) break
    }
    if (!buffer?.length) {
        try { buffer = await downloadMediaContent(media) } catch (e) { lastError = e }
    }
    if (!buffer?.length) throw lastError || new Error('Could not download that view-once media.')
    return { quoted, raw, media, buffer }
}

module.exports = {
    commands: ['vv', 'viewonce', 'open', 'openphoto', 'openvideo', 'vvphoto', 'vvsave', 'savevv', 'vvdm'],
    description: 'Open view-once media (owner opt-in via BERA_ALLOW_VIEWONCE_RECOVERY=1; fork reupload-first download)',
    permission: 'owner',
    group: true,
    private: true,

    run: async (sock, message, args, ctx) => {
        const command = String(ctx.command || 'vv').toLowerCase()
        const chat = ctx.jid || message.key?.remoteJid
        let quoted = message.quoted
        // Phase 4 (spec §25): no arbitrary view-once recovery. When the gate
        // is off, say so in the standard format and stop — do not download
        // or re-send anything.
        if (!isViewOnceRecoveryAllowed()) return ctx.reply(VIEWONCE_RECOVERY().card)
        // No quote? Fall back to the most recent view-once in this chat —
        // that is how the command is naturally used ("just .vvdm").
        if (!quoted) {
            try {
                const latest = rawStore.latestForChat(chat, raw => isViewOnceMessage(raw?.message))
                if (latest) {
                    message = { ...message, quoted: { key: latest.key, message: latest.message, sender: latest.key?.participant || latest.key?.remoteJid } }
                    quoted = message.quoted
                }
            } catch {}
        }
        if (!message.quoted) return ctx.reply('❌ Reply to the view-once media with .vv or .vvsave — or send .vvdm after a view-once arrives in this chat.')

        try {
            const recovery = await recover(sock, message, ctx)
            if (recovery.textOnly) {
                const reveal = `👁️ *View-once text revealed:*\n\n${recovery.textOnly}`
                if (['vvsave', 'savevv', 'vvdm'].includes(command)) {
                    const destination = ownerJid()
                    if (!destination) throw new Error('OWNER_NUMBER is not configured.')
                    await sock.sendMessage(destination, { text: reveal })
                    await sock.sendMessage(chat, { react: { text: '✅', key: message.key } }).catch(() => {})
                    return ctx.reply('✅ View-once text saved to the owner DM.')
                }
                await sock.sendMessage(chat, { text: reveal }, { quoted: message })
                await sock.sendMessage(chat, { react: { text: '✅', key: message.key } }).catch(() => {})
                return
            }
            const { media } = recovery
            const caption = media.content?.caption || ''

            if (['vvsave', 'savevv', 'vvdm'].includes(command)) {
                const destination = ownerJid()
                if (!destination) throw new Error('OWNER_NUMBER is not configured.')
                const sender = senderOf(quoted, ctx)
                const group = await groupLabel(sock, chat, Boolean(ctx.isGroup))
                const savedInfo = infoText({ sender, group, originalCaption: caption })
                const payload = buildResendPayload(media, recovery.buffer, media.kind === 'sticker' || media.kind === 'audio' ? '' : savedInfo)
                if (media.kind === 'sticker' || media.kind === 'audio') {
                    await sock.sendMessage(destination, payload)
                    await sock.sendMessage(destination, { text: savedInfo, mentions: sender ? [sender] : [] })
                } else {
                    payload.mentions = sender ? [sender] : []
                    await sock.sendMessage(destination, payload)
                }
                await sock.sendMessage(chat, { react: { text: '✅', key: message.key } }).catch(() => {})
                return ctx.reply('✅ View-once media saved to the owner DM.')
            }

            const payload = buildResendPayload(media, recovery.buffer, caption)
            await sock.sendMessage(chat, payload, { quoted: message })
            await sock.sendMessage(chat, { react: { text: '✅', key: message.key } }).catch(() => {})
        } catch (error) {
            const text = `❌ View-once recovery failed: ${String(error?.message || error).slice(0, 300)}`
            if (['vvsave', 'savevv', 'vvdm'].includes(command) && mediaKindFromMessage(quoted?.message) === 'sticker') {
                const destination = ownerJid()
                if (destination) await sock.sendMessage(destination, { text }).catch(() => {})
                return
            }
            await sock.sendMessage(chat, { react: { text: '❌', key: message.key } }).catch(() => {})
            return ctx.reply(text)
        }
    },
}

function mediaKindFromMessage(message) {
    const media = findMedia(message)
    return media?.kind || null
}
