'use strict'

const crypto = require('crypto')

// Pending confirmation tokens. The in-memory Map is a cache in front of the
// database: the DB (global.db.data.pendingConfirmations, persisted by
// Database/index.js through the same lowdb JSON + Postgres snapshot path as
// db.reminders) is the source of truth, so staged tokens survive a restart.
// When no DB is attached (unit tests, early boot) the Map works standalone
// and persistence is a no-op.
const pending = new Map()
const audit = []
const MAX_PENDING = 50
const MAX_AUDIT = 100
const PENDING_TTL_MS = 2 * 60 * 1000
const PERSIST_KEY = 'pendingConfirmations'

const normalizeNumber = (value) => {
    const digits = String(value || '').replace(/[^0-9]/g, '')
    if (digits.length < 7 || digits.length > 15) throw new Error('Use an international phone number with 7–15 digits.')
    return digits
}

const makeToken = () => crypto.randomBytes(4).toString('hex').toUpperCase()

// --- Persistence -----------------------------------------------------------
const dbData = () => {
    try { return global.db?.data || null } catch { return null }
}

// JSON-safe clone of a staged action. Returns null when the action cannot be
// serialized (for example a forward whose quoted Baileys payload holds
// non-plain values). Such a token stays valid in memory for this process but
// is not written to the DB, so it does not survive a restart; it is never
// silently rewritten into a different action.
const serializeAction = (action) => {
    try { return JSON.parse(JSON.stringify(action)) } catch { return null }
}

const persistPending = () => {
    const data = dbData()
    if (!data) return
    try {
        const entries = []
        for (const [token, item] of pending) {
            const action = serializeAction(item.action)
            if (!action) continue
            entries.push({ token, owner: item.owner, action, createdAt: item.createdAt, expiresAt: item.expiresAt })
        }
        data[PERSIST_KEY] = entries
        // Mirrors the reminders pattern: mutate global.db.data, then write.
        // The real write() flushes lowdb JSON synchronously and queues the
        // Postgres snapshot; a failure must never break staging/consuming.
        if (typeof global.db.write === 'function') Promise.resolve(global.db.write()).catch(() => {})
    } catch {}
}

// Load tokens staged before a restart from the DB into the in-memory cache.
// Expired or malformed entries are pruned (and the pruned list is written
// back), so a token can never come back to life after its TTL. Returns the
// number of tokens restored. Called once at boot, after initDb().
const loadPendingFromDb = () => {
    const data = dbData()
    if (!data) return 0
    const stored = Array.isArray(data[PERSIST_KEY]) ? data[PERSIST_KEY] : []
    const now = Date.now()
    pending.clear()
    let loaded = 0
    for (const entry of stored) {
        if (!entry || typeof entry.token !== 'string' || typeof entry.owner !== 'string'
            || !entry.action || typeof entry.action.type !== 'string'
            || typeof entry.expiresAt !== 'number') continue
        if (entry.expiresAt <= now) continue
        pending.set(String(entry.token).toUpperCase(), {
            owner: entry.owner,
            action: entry.action,
            createdAt: typeof entry.createdAt === 'number' ? entry.createdAt : now,
            expiresAt: entry.expiresAt,
        })
        loaded++
    }
    while (pending.size > MAX_PENDING) pending.delete(pending.keys().next().value)
    persistPending()
    return loaded
}

const prune = () => {
    const now = Date.now()
    for (const [token, item] of pending) {
        if (item.expiresAt <= now) pending.delete(token)
    }
    while (pending.size > MAX_PENDING) pending.delete(pending.keys().next().value)
}

// --- Staging / consuming ---------------------------------------------------
const stage = (owner, action) => {
    // Never silently expand a recipient list after confirmation: an action
    // carrying several destinations must go through stageMany(), which mints
    // one token per destination.
    if (action && Array.isArray(action.destinations) && action.destinations.length > 1) {
        throw new Error('This action has multiple destinations. Use stageMany() so each destination gets its own confirmation token.')
    }
    prune()
    const token = makeToken()
    const now = Date.now()
    pending.set(token, {
        owner: String(owner || ''),
        action,
        createdAt: now,
        expiresAt: now + PENDING_TTL_MS,
    })
    persistPending()
    return token
}

// Stage one token per destination/action. Returns one { token, action,
// expiresAt } entry per action, so each destination is confirmed (or
// cancelled) separately and the recipient list cannot grow afterwards.
const stageMany = (owner, actions) => {
    if (!Array.isArray(actions) || !actions.length) throw new Error('stageMany requires a non-empty list of actions.')
    prune()
    const now = Date.now()
    const staged = actions.map(action => {
        const token = makeToken()
        pending.set(token, {
            owner: String(owner || ''),
            action,
            createdAt: now,
            expiresAt: now + PENDING_TTL_MS,
        })
        return { token, action, expiresAt: now + PENDING_TTL_MS }
    })
    persistPending()
    return staged
}

const cancel = (owner, token) => {
    const normalized = String(token || '').toUpperCase()
    const item = pending.get(normalized)
    if (!item || item.owner !== String(owner || '')) return false
    pending.delete(normalized)
    persistPending()
    return true
}

const consume = (owner, token) => {
    prune()
    const normalized = String(token || '').toUpperCase()
    const item = pending.get(normalized)
    if (!item || item.owner !== String(owner || '')) return null
    pending.delete(normalized)
    persistPending()
    return item.action
}

// Read-only view of a staged token (for preview cards and confirm replies).
// Returns null for unknown, expired, or already-used tokens.
const getPending = (token) => {
    prune()
    const normalized = String(token || '').toUpperCase()
    const item = pending.get(normalized)
    if (!item) return null
    return { token: normalized, owner: item.owner, action: item.action, createdAt: item.createdAt, expiresAt: item.expiresAt }
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

// --- Preview cards ---------------------------------------------------------
// Every staged preview must show the expiry time (Africa/Nairobi) and how to
// cancel. These formatters are the single source of truth for preview text:
// .wact, the Handler agent send/forward intents and the generic-agent
// stageWhatsAppAction path all build previews through them.
const formatNairobiTime = (ms) => {
    try {
        return new Intl.DateTimeFormat('en-GB', {
            timeZone: 'Africa/Nairobi', dateStyle: 'medium', timeStyle: 'short',
        }).format(new Date(ms))
    } catch { return new Date(ms).toISOString() }
}

const actionLabel = (type) => ({
    send: 'Send message',
    sendMedia: 'Send media',
    forward: 'Forward message',
    story: 'Post text story',
    groupstory: 'Post group story',
}[type] || String(type || 'WhatsApp action'))

const destinationOf = (action) => {
    if (Array.isArray(action.destinations) && action.destinations.length) {
        return action.destinations.map(d => (typeof d === 'string' ? d : d.jid || d.number || String(d))).join(', ')
    }
    if (action.number) return `+${String(action.number).replace(/^\+/, '')}`
    if (action.jid) return action.jid
    if (action.groupJid) return action.groupJid
    if (action.type === 'story') return 'status@broadcast (my WhatsApp status)'
    return '—'
}

const messageOf = (action) => {
    if (action.type === 'sendMedia') {
        const parts = [`${action.mediaType || 'media'}${action.url ? `: ${action.url}` : ''}`]
        if (action.caption) parts.push(`Caption: ${action.caption}`)
        return parts.join('\n')
    }
    if (action.type === 'forward') return '(the quoted message)'
    if (typeof action.text === 'string' && action.text.trim()) return action.text
    return '(no message text)'
}

const formatPreview = (action, token) => {
    const info = getPending(token)
    const expiresAt = info?.expiresAt || (Date.now() + PENDING_TTL_MS)
    return [
        '⚠️ *Confirmation preview — nothing was sent yet*',
        '',
        `Action: ${actionLabel(action?.type)}`,
        `To: ${destinationOf(action || {})}`,
        `Message: _${messageOf(action || {})}_`,
        '',
        `Expires: ${formatNairobiTime(expiresAt)} (Africa/Nairobi) — tokens live for 2 minutes.`,
        `Confirm: Reply with *.wact confirm ${token}*`,
        `Cancel: Reply with *.wact cancel ${token}* — cancelling discards the action and the token can never be used.`,
    ].join('\n')
}

// One token per destination: each block names its own destination and token,
// so no destination is confirmed implicitly by another's token.
const formatPreviewMany = (staged) => {
    if (!Array.isArray(staged) || !staged.length) throw new Error('formatPreviewMany requires staged tokens.')
    const expiresAt = staged[0].expiresAt
    const blocks = staged.map(({ action, token }) => [
        `Action: ${actionLabel(action?.type)}`,
        `To: ${destinationOf(action || {})}`,
        `Message: _${messageOf(action || {})}_`,
        `Confirm: Reply with *.wact confirm ${token}*`,
        `Cancel: Reply with *.wact cancel ${token}*`,
    ].join('\n'))
    return [
        '⚠️ *Confirmation preview — nothing was sent yet*',
        '',
        `${staged.length} destinations — one token per destination. Each destination must be confirmed separately.`,
        '',
        blocks.join('\n\n'),
        '',
        `Expires: ${formatNairobiTime(expiresAt)} (Africa/Nairobi) — tokens live for 2 minutes.`,
    ].join('\n')
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

// Internal executor: runs a WhatsApp action that has ALREADY been confirmed
// (staged, then consumed via consume()/executeConfirmed()). External sends
// must never call execute() directly — they go through stage() + consume(),
// so every high-impact/external send has a preview, a single-use token, an
// owner check and a 2-minute TTL before anything reaches Baileys.
const execute = async (conn, owner, action) => {
    try {
        if (!action || !['send', 'sendMedia', 'forward', 'story', 'groupstory'].includes(action.type)) throw new Error('Unknown WhatsApp action.')
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

        if (action.type === 'forward') {
            if (!action.jid || !action.message) throw new Error('A recipient and quoted message are required.')
            const sent = typeof conn.copyNForward === 'function'
                ? await conn.copyNForward(action.jid, action.message, true)
                : await conn.sendMessage(action.jid, action.message)
            if (!sent) throw new Error('Baileys did not accept the forwarded message.')
            const result = { ok: true, jid: action.jid }
            record(owner, action, result)
            return result
        }

        const text = String(action.text || '').trim()
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

// The confirmed-send entry point: consumes the caller's single-use token
// (owner-bound, 2-minute TTL) and only then executes. An invalid, expired,
// cancelled, already-used, or wrong-owner token never reaches Baileys.
const executeConfirmed = async (conn, owner, token) => {
    const action = consume(owner, token)
    if (!action) return { ok: false, error: 'Token is invalid, expired, cancelled, or belongs to another owner session.' }
    return execute(conn, owner, action)
}

const getAudit = (owner) => audit.filter(item => item.owner === String(owner || '')).slice(-20)

module.exports = {
    normalizeNumber,
    normalizeJid,
    checkNumber,
    resolveTarget,
    stage,
    stageMany,
    consume,
    cancel,
    getPending,
    loadPendingFromDb,
    persistPending,
    execute,
    executeConfirmed,
    formatPreview,
    formatPreviewMany,
    formatNairobiTime,
    getAudit,
    MAX_PENDING,
    PENDING_TTL_MS,
    PERSIST_KEY,
    _pending: pending,
}
