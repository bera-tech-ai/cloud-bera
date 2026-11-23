'use strict'

const crypto = require('crypto')

const pending = new Map()
const audit = []
const MAX_PENDING = 50
const MAX_AUDIT = 100
const PENDING_TTL_MS = 2 * 60 * 1000

const normalizeNumber = (value) => {
    const digits = String(value || '').replace(/[^0-9]/g, '')
    if (digits.length < 7 || digits.length > 15) throw new Error('Use an international phone number with 7–15 digits.')
    return digits
}

const makeToken = () => crypto.randomBytes(4).toString('hex').toUpperCase()

const prune = () => {
    const now = Date.now()
    for (const [token, item] of pending) {
        if (item.expiresAt <= now) pending.delete(token)
    }
    while (pending.size > MAX_PENDING) pending.delete(pending.keys().next().value)
}

const stage = (owner, action) => {
    prune()
    const token = makeToken()
    pending.set(token, {
        owner: String(owner || ''),
        action,
        createdAt: Date.now(),
        expiresAt: Date.now() + PENDING_TTL_MS,
    })
    return token
}

const cancel = (owner, token) => {
    const item = pending.get(String(token || '').toUpperCase())
    if (!item || item.owner !== String(owner || '')) return false
    pending.delete(String(token || '').toUpperCase())
    return true
}

const consume = (owner, token) => {
    prune()
    const normalized = String(token || '').toUpperCase()
    const item = pending.get(normalized)
    if (!item || item.owner !== String(owner || '')) return null
    pending.delete(normalized)
    return item.action
}

const record = (owner, action, result) => {
    audit.push({
        at: new Date().toISOString(),
        owner: String(owner || ''),
        type: action?.type,
        target: action?.number || action?.jid || 'status@broadcast',
        ok: !!result?.ok,
        error: result?.ok ? undefined : String(result?.error || 'unknown'),
    })
    while (audit.length > MAX_AUDIT) audit.shift()
}

const checkNumber = async (conn, number) => {
    const normalized = normalizeNumber(number)
    const fallback = `${normalized}@s.whatsapp.net`
    if (typeof conn?.onWhatsApp !== 'function') return { exists: null, jid: fallback, number: normalized }
    const result = await conn.onWhatsApp(fallback)
    const first = Array.isArray(result) ? result[0] : result
    return {
        exists: first?.exists === true,
        jid: first?.jid || fallback,
        number: normalized,
    }
}

const normalizeJid = (value) => {
    const raw = String(value || '').trim()
    if (!raw) return null
    if (raw.includes('@')) return raw.replace(/^\+/, '')
    return `${normalizeNumber(raw)}@s.whatsapp.net`
}

const resolveTarget = async (conn, m, spec, options = {}) => {
    const value = String(spec || '').trim()
    const lower = value.toLowerCase()
    const quoted = m?.quoted?.sender || m?.quoted?.key?.participant || m?.quoted?.key?.participantAlt
    const mentioned = m?.mentionedJid?.[0] || m?.message?.extendedTextMessage?.contextInfo?.mentionedJid?.[0]
    let jid = value.includes('@') ? normalizeJid(value) : null
    if (!jid && ['reply', 'quoted', 'replied', 'this user', 'replied user'].includes(lower)) jid = quoted
    if (!jid && ['tag', 'tagged', 'mention', 'mentioned', 'tagged user'].includes(lower)) jid = mentioned
    if (!jid && ['this pm', 'this chat', 'current pm', 'private chat'].includes(lower)) {
        if (m?.isGroup || !m?.chat || m.chat.endsWith('@g.us')) throw new Error('The current chat is a group, not a private chat.')
        jid = m.chat
    }
    if (!jid && ['me', 'myself', 'owner'].includes(lower)) jid = m?.sender
    if (!jid && /^\+?[0-9]{7,15}$/.test(value)) jid = normalizeJid(value)
    if (!jid) throw new Error('No valid WhatsApp recipient was found. Use a number, reply, tag, or current private chat.')
    if (jid.endsWith('@g.us') || jid.endsWith('@newsletter')) {
        if (!options.allowSpecial) throw new Error('This action requires a private WhatsApp recipient.')
        return { jid, number: jid.split('@')[0] }
    }
    const number = jid.split('@')[0].split(':')[0]
    if (typeof conn?.onWhatsApp === 'function' && !jid.endsWith('@lid')) {
        const checked = await checkNumber(conn, number)
        if (checked.exists === false) throw new Error(`+${number} is not registered on WhatsApp.`)
        return { jid: checked.jid || jid, number: checked.number || number }
    }
    return { jid, number }
}

const execute = async (conn, owner, action) => {
    try {
        if (!action || !['send', 'sendMedia', 'forward', 'story', 'groupstory'].includes(action.type)) throw new Error('Unknown WhatsApp action.')
        if (action.type === 'send') {
            const target = action.jid ? { jid: action.jid, number: action.number || action.jid.split('@')[0], exists: true } : await checkNumber(conn, action.number)
            if (target.exists === false) throw new Error(`+${target.number} is not registered on WhatsApp.`)
            await conn.sendMessage(target.jid, { text: action.text })
            const result = { ok: true, jid: target.jid, number: target.number }
            record(owner, action, result)
            return result
        }

        if (action.type === 'sendMedia') {
            if (!action.jid || !action.url || !['image', 'video', 'audio', 'document', 'sticker'].includes(action.mediaType)) throw new Error('Invalid media action.')
            await conn.sendMessage(action.jid, { [action.mediaType]: { url: action.url }, ...(action.caption ? { caption: action.caption } : {}) })
            const result = { ok: true, jid: action.jid }
            record(owner, action, result)
            return result
        }

        if (action.type === 'forward') {
            if (!action.jid || !action.message) throw new Error('A recipient and quoted message are required.')
            if (typeof conn.copyNForward === 'function') await conn.copyNForward(action.jid, action.message, true)
            else await conn.sendMessage(action.jid, action.message)
            const result = { ok: true, jid: action.jid }
            record(owner, action, result)
            return result
        }

        const text = String(action.text || '').trim()
        if (!text) throw new Error('Story text cannot be empty.')
        if (action.type === 'groupstory') {
            const { sendGroupStatus } = require('../actions/gcstatus')
            await sendGroupStatus(conn, action.groupJid, { text: text.slice(0, 700) })
            const result = { ok: true, jid: action.groupJid }
            record(owner, action, result)
            return result
        }
        await conn.sendMessage('status@broadcast', {
            text: text.slice(0, 700),
            backgroundColor: action.backgroundColor || '#1DA462',
            font: Number.isInteger(action.font) ? action.font : 1,
        })
        const result = { ok: true, jid: 'status@broadcast' }
        record(owner, action, result)
        return result
    } catch (error) {
        const result = { ok: false, error: error.message }
        record(owner, action, result)
        return result
    }
}

const getAudit = (owner) => audit.filter(item => item.owner === String(owner || '')).slice(-20)

module.exports = {
    normalizeNumber,
    normalizeJid,
    checkNumber,
    resolveTarget,
    stage,
    consume,
    cancel,
    execute,
    getAudit,
    _pending: pending,
}
