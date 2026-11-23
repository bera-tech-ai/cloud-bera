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

const execute = async (conn, owner, action) => {
    try {
        if (!action || !['send', 'story', 'groupstory'].includes(action.type)) throw new Error('Unknown WhatsApp action.')
        if (action.type === 'send') {
            const target = await checkNumber(conn, action.number)
            if (target.exists === false) throw new Error(`+${target.number} is not registered on WhatsApp.`)
            await conn.sendMessage(target.jid, { text: action.text })
            const result = { ok: true, jid: target.jid, number: target.number }
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
    checkNumber,
    stage,
    consume,
    cancel,
    execute,
    getAudit,
    _pending: pending,
}
