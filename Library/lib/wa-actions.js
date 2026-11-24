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

const CLOSE_FRIENDS_UNSUPPORTED = 'Close-friends / restricted status is unsupported: WhatsApp does not expose a close-friends audience for status posts through the installed Baileys runtime. Post to your normal status or a group status instead, or retry without a restricted audience.'

const mChat = (action) => action?.chat || action?.jid || ''

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
    if (!jid) {
        // Pronouns / referents (spec §3): "him/her/them", "that person",
        // "the person who replied". Ambiguity never resolves silently.
        try {
            const referents = require('./referents')
            const chat = m?.chat || m?.key?.remoteJid
            const resolved = referents.resolvePerson(chat, lower, m)
            if (resolved?.ambiguous) throw new Error(referents.clarificationReply(resolved.candidates))
            if (resolved?.jid) jid = resolved.jid
        } catch (error) {
            if (error?.message?.includes('Which person did you mean')) throw error
            // Referent lookup is best-effort; fall through to the generic error.
        }
    }
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
        if (!action || !['send', 'sendMedia', 'forward', 'story', 'groupstory', 'react', 'pin', 'unpin', 'edit', 'delete', 'poll'].includes(action.type)) throw new Error('Unknown WhatsApp action.')
        if (action.type === 'send') {
            const target = action.jid ? { jid: action.jid, number: action.number || action.jid.split('@')[0], exists: true } : await checkNumber(conn, action.number)
            if (target.exists === false) throw new Error(`+${target.number} is not registered on WhatsApp.`)
            const sent = await conn.sendMessage(target.jid, { text: action.text })
            if (!sent) throw new Error('Baileys did not accept the message.')
            const result = { ok: true, jid: target.jid, number: target.number }
            record(owner, action, result)
            return result
        }

        if (action.type === 'sendMedia') {
            if (!action.jid || !action.url || !['image', 'video', 'audio', 'document', 'sticker'].includes(action.mediaType)) throw new Error('Invalid media action.')
            const sent = await conn.sendMessage(action.jid, { [action.mediaType]: { url: action.url }, ...(action.caption ? { caption: action.caption } : {}) })
            if (!sent) throw new Error('Baileys did not accept the media message.')
            const result = { ok: true, jid: action.jid }
            record(owner, action, result)
            return result
        }

        if (action.type === 'forward' && !Array.isArray(action.destinations)) {
            if (!action.jid || !action.message) throw new Error('A recipient and quoted message are required.')
            const sent = typeof conn.copyNForward === 'function'
                ? await conn.copyNForward(action.jid, action.message, true)
                : await conn.sendMessage(action.jid, action.message)
            if (!sent) throw new Error('Baileys did not accept the forwarded message.')
            const result = { ok: true, jid: action.jid }
            record(owner, action, result)
            return result
        }

        if (action.type === 'react') {
            if (!action.key) throw new Error('A message key is required to react to a message.')
            // Empty text removes the reaction (spec §7).
            const sent = await conn.sendMessage(action.chat || action.jid || mChat(action), { react: { text: String(action.emoji ?? action.text ?? ''), key: action.key } })
            if (!sent) throw new Error('Baileys did not accept the reaction request.')
            const result = { ok: true, key: action.key, emoji: String(action.emoji ?? action.text ?? '') }
            record(owner, action, result)
            return result
        }

        if (action.type === 'pin' || action.type === 'unpin') {
            if (!action.key) throw new Error('A message key is required to pin or unpin a message.')
            const isUnpin = action.type === 'unpin'
            const sent = await conn.sendMessage(action.chat, {
                pin: action.key,
                type: isUnpin ? 0 : 1,
                time: isUnpin ? 0 : (Number.isInteger(action.time) ? action.time : 604800),
            })
            if (!sent) throw new Error(`Baileys did not accept the ${isUnpin ? 'unpin' : 'pin'} request.`)
            const result = { ok: true, key: action.key }
            record(owner, action, result)
            return result
        }

        if (action.type === 'edit') {
            if (!action.key || typeof action.text !== 'string' || !action.text.trim()) throw new Error('A message key and replacement text are required to edit a message.')
            // Bot-authored only (spec §9). key.fromMe is authoritative; fall
            // back to comparing the key participant against the bot identity.
            const botIds = [conn?.user?.id, conn?.user?.lid].filter(Boolean).map(String)
            const participant = action.key.participant || action.key.participantAlt || action.key.remoteJid
            const isBotAuthored = Boolean(action.key.fromMe) ||
                (participant && botIds.some(id => String(participant).split(':')[0].toLowerCase() === id.split(':')[0].toLowerCase()))
            if (!isBotAuthored) throw new Error('I can edit only a message sent by this bot. Quote a bot message and provide the replacement text. Messages from other people cannot be edited, and old or unavailable messages may no longer be editable.')
            const sent = await conn.sendMessage(action.chat, { text: action.text, edit: action.key })
            if (!sent) throw new Error('Baileys did not accept the edit request.')
            const result = { ok: true, key: action.key }
            record(owner, action, result)
            return result
        }

        if (action.type === 'delete') {
            if (!action.key) throw new Error('A message key is required to delete a message.')
            const sent = await conn.sendMessage(action.chat, { delete: action.key })
            if (!sent) throw new Error('Baileys did not accept the delete request.')
            const result = { ok: true, key: action.key }
            record(owner, action, result)
            return result
        }

        if (action.type === 'poll') {
            const question = String(action.question || action.name || '').trim()
            const options = Array.isArray(action.options) ? action.options.map(o => String(o).trim()).filter(Boolean)
                : Array.isArray(action.values) ? action.values.map(o => String(o).trim()).filter(Boolean) : []
            if (!question) throw new Error('A poll needs a question.')
            if (options.length < 2 || options.length > 12) throw new Error('A poll needs 2–12 options.')
            if (!action.chat) throw new Error('A poll needs a destination chat.')
            // Native poll, poll creation v3 encoding in the installed Baileys
            // runtime (spec §11/§24). Acceptance is checked, never assumed.
            const sent = await conn.sendMessage(action.chat, {
                poll: { name: question.slice(0, 300), values: options.slice(0, 12).map(o => o.slice(0, 100)), selectableCount: Number.isInteger(action.selectableCount) ? action.selectableCount : 1 },
            })
            if (!sent) throw new Error('Baileys did not accept the poll.')
            const result = { ok: true, jid: action.chat, question }
            record(owner, action, result)
            return result
        }

        if (action.type === 'forward' && Array.isArray(action.destinations) && action.destinations.length) {
            // Multi-destination forward (spec §12): each destination is
            // forwarded in turn; a failure stops the run and is reported
            // with the destinations already reached.
            const done = []
            for (const dest of action.destinations) {
                const jid = typeof dest === 'string' ? dest : dest.jid
                if (!jid || !action.message) throw new Error('A recipient and quoted message are required.')
                const sent = typeof conn.copyNForward === 'function'
                    ? await conn.copyNForward(jid, action.message, true)
                    : await conn.sendMessage(jid, action.message)
                if (!sent) throw new Error(`Baileys did not accept the forwarded message to ${jid}.`)
                done.push(jid)
            }
            const result = { ok: true, jid: done[0], destinations: done }
            record(owner, action, result)
            return result
        }

        // Close-friends / restricted status is explicitly unsupported (§6/§25).
        if ((action.type === 'story' || action.type === 'groupstory') &&
            ['close_friends', 'closefriends', 'close-friends', 'restricted'].includes(String(action.audience || '').toLowerCase())) {
            throw new Error(CLOSE_FRIENDS_UNSUPPORTED)
        }

        const text = String(action.text || '').trim()
        if (action.type === 'story' && action.mediaType && action.url) {
            if (!['image', 'video'].includes(action.mediaType)) throw new Error('Status media must be an image or a video.')
            const sent = await conn.sendMessage('status@broadcast', { [action.mediaType]: { url: action.url }, ...(action.caption ? { caption: action.caption } : {}) })
            if (!sent) throw new Error('Baileys did not accept the media story.')
            const result = { ok: true, jid: 'status@broadcast' }
            record(owner, action, result)
            return result
        }
        if (action.type === 'groupstory' && (action.mediaType || action.media)) {
            const { sendGroupStatus } = require('../actions/gcstatus')
            const content = action.media
                ? { [action.mediaType || 'image']: action.media, caption: action.caption || action.text || '' }
                : null
            if (!content) throw new Error('Group media status needs a downloaded media buffer. Quote the media and try again, or post it as text.')
            const sent = await sendGroupStatus(conn, action.groupJid, content)
            if (!sent) throw new Error('Baileys did not accept the group story.')
            const result = { ok: true, jid: action.groupJid }
            record(owner, action, result)
            return result
        }
        if (!text) throw new Error('Story text cannot be empty.')
        if (action.type === 'groupstory') {
            const { sendGroupStatus } = require('../actions/gcstatus')
            const sent = await sendGroupStatus(conn, action.groupJid, { text: text.slice(0, 700) })
            if (!sent) throw new Error('Baileys did not accept the group story.')
            const result = { ok: true, jid: action.groupJid }
            record(owner, action, result)
            return result
        }
        const sent = await conn.sendMessage('status@broadcast', {
            text: text.slice(0, 700),
            backgroundColor: action.backgroundColor || '#1DA462',
            font: Number.isInteger(action.font) ? action.font : 1,
        })
        if (!sent) throw new Error('Baileys did not accept the story.')
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
    CLOSE_FRIENDS_UNSUPPORTED,
    PENDING_TTL_MS,
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
