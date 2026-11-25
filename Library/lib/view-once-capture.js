'use strict'

// Anti-viewonce arrival capture. When a chat has antiviewonce switched on
// (and the owner's view-once opt-in gate is open), view-once media is
// downloaded the moment it arrives — the only moment it reliably carries
// a download address — cached for .vv, and re-sent into the chat as a
// normal message, as the .antiviewonce command promises. Fire-and-forget:
// never throws into the message handler.
const { isViewOnceMessage, findMedia, downloadViewOnceFirst, buildResendPayload } = require('./baileys-media')
const cache = require('./view-once-cache')

function antiviewonceOn(chat) {
    try {
        const settings = global.db?.data?.settings || {}
        const key = String(chat || '').endsWith('@g.us') ? `antiviewonce_${chat}` : 'antiviewonce'
        return settings[key] === true
    } catch { return false }
}

function captureOnArrival(conn, raw) {
    ;(async () => {
        try {
            if (!conn || !raw?.message || raw.key?.fromMe) return
            const chat = raw.key?.remoteJid
            if (!chat || !antiviewonceOn(chat)) return
            const { isViewOnceRecoveryAllowed } = require('./recovery-gate')
            if (!isViewOnceRecoveryAllowed()) return
            if (!isViewOnceMessage(raw.message)) return
            const media = findMedia(raw.message)
            if (!media) return // text/interactive view-once: nothing to download; .vv reveals its text
            const buffer = await downloadViewOnceFirst(raw, media, conn)
            if (!buffer?.length) return
            cache.put(chat, raw.key.id, buffer, {
                kind: media.kind,
                field: media.field,
                mimetype: media.content?.mimetype,
                caption: media.content?.caption || '',
                fileName: media.content?.fileName,
                ptt: !!media.content?.ptt,
                gifPlayback: !!media.content?.gifPlayback,
                sender: raw.key.participant || chat,
            })
            const payload = buildResendPayload(media, buffer, media.content?.caption || '')
            await conn.sendMessage(chat, payload)
        } catch { /* arrival capture must never break message handling */ }
    })()
}

module.exports = { captureOnArrival, antiviewonceOn }
