'use strict'

const { downloadContentFromMessage, jidNormalizedUser } = require('@whiskeysockets/baileys')
const { normalizeJid } = require('./identity')

const VIEW_ONCE_TYPES = new Set([
    'viewOnceMessage',
    'viewOnceMessageV2',
    'viewOnceMessageV2Extension'
])
const MESSAGE_WRAPPER_TYPES = new Set([
    ...VIEW_ONCE_TYPES,
    'ephemeralMessage',
    'documentWithCaptionMessage',
    'editedMessage',
    'keepInChatMessage'
])
const MEDIA_TYPES = [
    ['imageMessage', 'image'],
    ['videoMessage', 'video'],
    ['audioMessage', 'audio']
]
const MAX_BYTES = Math.max(1024 * 1024, Number(process.env.VIEW_ONCE_MAX_BYTES) || 25 * 1024 * 1024)
const DOWNLOAD_TIMEOUT_MS = Math.max(5000, Number(process.env.VIEW_ONCE_TIMEOUT_MS) || 45000)
const delivered = new Map()

const pruneDelivered = () => {
    const cutoff = Date.now() - 10 * 60 * 1000
    for (const [key, timestamp] of delivered) {
        if (timestamp < cutoff) delivered.delete(key)
    }
    while (delivered.size > 1000) delivered.delete(delivered.keys().next().value)
}

const claim = (key) => {
    if (!key) return false
    pruneDelivered()
    if (delivered.has(key)) return false
    delivered.set(key, Date.now())
    return true
}

const unwrap = (message, depth = 0) => {
    if (!message || typeof message !== 'object' || depth > 5) return null
    for (const wrapperType of MESSAGE_WRAPPER_TYPES) {
        if (message[wrapperType]) {
            return unwrap(message[wrapperType].message || message[wrapperType], depth + 1)
        }
    }
    if (message.message && typeof message.message === 'object') {
        return unwrap(message.message, depth + 1)
    }
    return message
}

const extractMedia = (message) => {
    const inner = unwrap(message)
    if (!inner) return null
    for (const [key, type] of MEDIA_TYPES) {
        if (inner[key]) {
            return {
                message: inner[key],
                key,
                type,
                caption: inner[key].caption || '',
                mimetype: inner[key].mimetype || '',
                ptt: inner[key].ptt === true
            }
        }
    }
    return null
}

const isViewOnceMessage = (message) => {
    if (!message || typeof message !== 'object') return false
    if (Object.keys(message).some((key) => VIEW_ONCE_TYPES.has(key))) return true
    if (message.viewOnce === true) return true
    return Object.values(message).some((value) =>
        value && typeof value === 'object' && isViewOnceMessage(value)
    )
}

const withTimeout = (promise, timeoutMs) => new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('view-once download timed out')), timeoutMs)
    promise.then(resolve, reject).finally(() => clearTimeout(timer))
})

const downloadMedia = async (media) => {
    if (!media?.message || !media.type) return null
    const read = (async () => {
        const stream = await downloadContentFromMessage(media.message, media.type)
        const chunks = []
        let total = 0
        for await (const chunk of stream) {
            total += chunk.length
            if (total > MAX_BYTES) throw new Error('view-once media exceeds the configured size limit')
            chunks.push(chunk)
        }
        return Buffer.concat(chunks, total)
    })()
    return withTimeout(read, DOWNLOAD_TIMEOUT_MS)
}

const resolveDestination = (conn, sourceChat) => {
    const configured = process.env.VIEW_ONCE_DESTINATION?.trim()
    const botJid = normalizeJid(conn?.user?.id || '')
    const source = normalizeJid(sourceChat)
    const candidates = [configured, botJid]

    for (const candidate of candidates) {
        const destination = normalizeJid(candidate)
        if (!destination || !destination.endsWith('@s.whatsapp.net')) continue

        // Never send revealed media back to the source chat, including DMs.
        if (source && destination === source) continue
        return destination
    }

    return null
}

const sendMedia = async (conn, destination, media, buffer) => {
    if (!conn || !destination || !media || !Buffer.isBuffer(buffer)) return false
    const content = media.type === 'image'
        ? { image: buffer, caption: media.caption, mimetype: media.mimetype || 'image/jpeg' }
        : media.type === 'video'
            ? { video: buffer, caption: media.caption, mimetype: media.mimetype || 'video/mp4' }
            : { audio: buffer, mimetype: media.mimetype || 'audio/ogg; codecs=opus', ptt: media.ptt }
    await conn.sendMessage(destination, content)
    return true
}

module.exports = {
    VIEW_ONCE_TYPES,
    MAX_BYTES,
    isViewOnceMessage,
    extractMedia,
    downloadMedia,
    resolveDestination,
    sendMedia,
    claim
}