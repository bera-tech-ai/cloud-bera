'use strict'

const config = require('../Config')
const { findMedia, downloadMediaContent, downloadRawMedia, buildResendPayload } = require('../Library/lib/baileys-media')
const rawStore = require('../Library/lib/view-once-store')

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
    const media = findMedia(raw?.message) || findMedia(quoted?.message) || findMedia(message.message)
    if (!media) throw new Error('Reply to a view-once image, video, audio, sticker, or document.')

    let buffer
    if (raw) {
        try { buffer = await downloadRawMedia(raw, media, sock) } catch {}
    }
    if (!buffer?.length) buffer = await downloadMediaContent(media)
    return { quoted, raw, media, buffer }
}

module.exports = {
    commands: ['vv', 'viewonce', 'open', 'openphoto', 'openvideo', 'vvphoto', 'vvsave', 'savevv', 'vvdm'],
    description: 'Recover view-once image, video, audio, sticker, or document media',
    permission: 'owner',
    group: true,
    private: true,

    run: async (sock, message, args, ctx) => {
        const command = String(ctx.command || 'vv').toLowerCase()
        const chat = ctx.jid || message.key?.remoteJid
        const quoted = message.quoted
        if (!quoted) return ctx.reply('❌ Reply to the view-once media with .vv or .vvsave.')

        try {
            const recovery = await recover(sock, message, ctx)
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
