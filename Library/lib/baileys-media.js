'use strict'

const { downloadContentFromMessage, downloadMediaMessage } = require('@whiskeysockets/baileys')

const MEDIA_TYPES = {
    imageMessage: { kind: 'image', field: 'image' },
    videoMessage: { kind: 'video', field: 'video' },
    audioMessage: { kind: 'audio', field: 'audio' },
    stickerMessage: { kind: 'sticker', field: 'sticker' },
    documentMessage: { kind: 'document', field: 'document' },
}

const VIEW_ONCE_WRAPPERS = new Set([
    'ephemeralMessage',
    'viewOnceMessage',
    'viewOnceMessageV2',
    'viewOnceMessageV2Extension',
    'documentWithCaptionMessage',
])

function unwrapMessage(message) {
    let current = message
    const seen = new Set()
    let guard = 0
    while (current && typeof current === 'object' && guard++ < 8) {
        const key = Object.keys(current).find(name => VIEW_ONCE_WRAPPERS.has(name))
        if (!key || !current[key] || seen.has(current)) break
        seen.add(current)
        current = current[key].message || current[key]
    }
    return current || null
}

function findMedia(message) {
    const content = unwrapMessage(message)
    if (!content) return null
    for (const [type, meta] of Object.entries(MEDIA_TYPES)) {
        if (content[type]) return { type, content: content[type], ...meta }
    }
    if (content.lottieStickerMessage) return { type: 'lottieStickerMessage', content: content.lottieStickerMessage, kind: 'sticker', field: 'sticker' }
    return null
}

async function downloadRawMedia(raw, media, sock) {
    if (!raw?.message || !media) throw new Error('No original raw message is available')
    if (typeof downloadMediaMessage === 'function') {
        const candidates = [raw]
        const unwrapped = unwrapMessage(raw.message)
        if (unwrapped && unwrapped !== raw.message) candidates.push({ ...raw, message: unwrapped })
        for (const candidate of candidates) {
            try {
                return await downloadMediaMessage(candidate, 'buffer', {}, {
                    reuploadRequest: async message => {
                        if (typeof sock?.updateMediaMessage !== 'function') throw new Error('Media re-upload is unavailable')
                        return sock.updateMediaMessage(message)
                    },
                })
            } catch {}
        }
    }
    return downloadMediaContent(media)
}

async function downloadMediaContent(media) {
    if (!media?.content || !media.kind) throw new Error('No downloadable media content found')
    const stream = await downloadContentFromMessage(media.content, media.kind)
    const chunks = []
    for await (const chunk of stream) chunks.push(Buffer.from(chunk))
    return Buffer.concat(chunks)
}

function buildResendPayload(media, buffer, caption = '') {
    if (!media) throw new Error('Unsupported media type')
    const source = media.content || {}
    if (media.kind === 'audio') {
        return { audio: buffer, mimetype: source.mimetype || 'audio/ogg; codecs=opus', ptt: !!source.ptt }
    }
    if (media.kind === 'sticker') return { sticker: buffer }
    if (media.kind === 'document') {
        return {
            document: buffer,
            mimetype: source.mimetype || 'application/octet-stream',
            fileName: source.fileName || 'view-once-file',
            caption,
        }
    }
    return {
        [media.field]: buffer,
        mimetype: source.mimetype,
        caption,
        gifPlayback: media.kind === 'video' && !!source.gifPlayback,
    }
}

module.exports = { MEDIA_TYPES, VIEW_ONCE_WRAPPERS, unwrapMessage, findMedia, downloadMediaContent, downloadRawMedia, buildResendPayload }
