'use strict'

const isHttpUrl = (value) => {
    if (typeof value !== 'string' || !/^https?:\/\//i.test(value)) return false
    try {
        const url = new URL(value)
        return url.protocol === 'http:' || url.protocol === 'https:'
    } catch {
        return false
    }
}

/** Send audio through a Baileys-compatible connection using only a URL string or Buffer. */
const sendAudioMessage = async (conn, chat, source, options = {}) => {
    if (!conn || typeof conn.sendMessage !== 'function') throw new TypeError('WhatsApp connection is not ready.')
    if (typeof chat !== 'string' || !chat) throw new TypeError('A WhatsApp chat JID is required.')
    const audio = Buffer.isBuffer(source)
        ? source
        : isHttpUrl(source)
            ? { url: source }
            : null
    if (!audio) throw new TypeError('Audio source must be a Buffer or an HTTP(S) URL string.')

    const content = {
        audio,
        mimetype: options.mimetype || 'audio/mpeg',
        ptt: options.ptt === true,
        ...(options.fileName ? { fileName: options.fileName } : {}),
        ...(options.contextInfo ? { contextInfo: options.contextInfo } : {})
    }
    const sendOptions = options.quoted ? { quoted: options.quoted } : undefined
    return conn.sendMessage(chat, content, sendOptions)
}

module.exports = { sendAudioMessage, isHttpUrl }
