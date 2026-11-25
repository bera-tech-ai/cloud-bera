'use strict'

const path = require('node:path')
const { pathToFileURL } = require('node:url')
const { downloadContentFromMessage, downloadMediaMessage } = require('@whiskeysockets/baileys')

// Optional view-once-only fork (xspacesocket), installed separately under
// fork-deps/ so the bot's own dependency tree stays on official Baileys.
// Loaded lazily; resolves to null when not installed.
let viewOnceForkPromise = null
function loadViewOnceFork() {
    if (!viewOnceForkPromise) {
        const entry = path.join(__dirname, '..', '..', 'fork-deps', 'node_modules', 'xspacesocket', 'lib', 'index.js')
        viewOnceForkPromise = import(pathToFileURL(entry).href).catch(() => null)
    }
    return viewOnceForkPromise
}

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

function isViewOnceMessage(message) {
    let current = message
    let guard = 0
    while (current && typeof current === 'object' && guard++ < 8) {
        if (current.viewOnceMessage || current.viewOnceMessageV2 || current.viewOnceMessageV2Extension) return true
        for (const type of ['imageMessage', 'videoMessage', 'audioMessage']) {
            if (current[type]?.viewOnce) return true
        }
        const next = current.ephemeralMessage?.message || current.documentWithCaptionMessage?.message || null
        if (!next || next === current) break
        current = next
    }
    return false
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
    const reuploadRequest = async message => {
        if (typeof sock?.updateMediaMessage !== 'function') throw new Error('Media re-upload is unavailable')
        return sock.updateMediaMessage(message)
    }
    const candidates = [raw]
    const unwrapped = unwrapMessage(raw.message)
    if (unwrapped && unwrapped !== raw.message) candidates.push({ ...raw, message: unwrapped })
    if (typeof downloadMediaMessage === 'function') {
        for (const candidate of candidates) {
            try {
                return await downloadMediaMessage(candidate, 'buffer', {}, { reuploadRequest })
            } catch {}
        }
    }
    // Scoped fallback (owner request, 2026-11-25): the xspacesocket fork's
    // downloadViewOnceMessage re-requests media that has a key but no
    // URL/directPath BEFORE downloading — official Baileys throws first,
    // which is exactly how view-once recovery failed live ("No valid media
    // URL or directPath present in message"). The fork is an optional,
    // separately installed dependency (fork-deps/); the connection and
    // everything else stay on official Baileys. Absent or failing, fall
    // through to the plain content download.
    try {
        const fork = await loadViewOnceFork()
        if (fork?.downloadViewOnceMessage) {
            const logger = { info() {}, warn() {}, error() {}, debug() {}, trace() {}, child() { return this } }
            for (const candidate of candidates) {
                try {
                    return await fork.downloadViewOnceMessage(candidate, 'buffer', {}, { reuploadRequest, logger })
                } catch {}
            }
        }
    } catch {}
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

module.exports = { MEDIA_TYPES, VIEW_ONCE_WRAPPERS, unwrapMessage, findMedia, downloadMediaContent, downloadRawMedia, buildResendPayload, isViewOnceMessage, loadViewOnceFork }
