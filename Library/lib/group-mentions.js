'use strict'

const normalizeJid = value => String(value || '').replace(/:\d+@/, '@')

const addRequesterMention = (message, value, extra = {}, field = 'text') => {
    const body = String(value ?? '')
    const chat = message?.chat || message?.key?.remoteJid || ''
    const isGroup = message?.isGroup === true || String(chat).endsWith('@g.us')
    const requester = normalizeJid(message?.sender || message?.key?.participant || '')
    const existing = Array.isArray(extra.mentions) ? extra.mentions : []
    const payload = { ...extra, [field]: body }

    if (!isGroup || !requester.includes('@') || requester.endsWith('@g.us')) {
        if (existing.length) payload.mentions = [...new Set(existing.map(normalizeJid))]
        else delete payload.mentions
        return payload
    }

    const visibleTag = `@${requester.split('@')[0]}`
    payload[field] = body.includes(visibleTag) ? body : `${visibleTag} ${body}`.trim()
    payload.mentions = [...new Set([...existing.map(normalizeJid), requester])]
    return payload
}

const sendGroupReply = (conn, message, text, extra = {}) => {
    const chat = message?.chat || message?.key?.remoteJid
    if (!chat || !conn?.sendMessage) return Promise.resolve(null)
    const payload = addRequesterMention(message, text, extra, 'text')
    return conn.sendMessage(chat, payload, { quoted: message })
}

module.exports = { addRequesterMention, sendGroupReply }
