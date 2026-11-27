'use strict'

const crypto = require('crypto')
const { assertAccepted, BAILEYS_ACCEPTED_MESSAGE } = require('./truthful-status')

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

const CLOSE_FRIENDS_UNSUPPORTED = 'Close-friends / restricted status is unsupported: WhatsApp does not expose a close-friends audience for status posts through the installed Baileys runtime. Post to your normal status or a group status instead, or retry without a restricted audience.'

const mChat = (action) => action?.chat || action?.jid || ''

const normalizeJid = (value) => {
    const raw = String(value || '').trim()
    if (!raw) return null
    if (raw.includes('@')) return raw.replace(/^\+/, '')
    return `${normalizeNumber(raw)}@s.whatsapp.net`
}

const resolveNameFromGroup = async (conn, chat, name) => {
    // A name the directory doesn't know may still be sitting in the group
    // the message came from: match it against the participants' WhatsApp
    // usernames (@handle, from groupMetadata) and any display name the bot
    // knows. Same matching as the "who is X" member search — exact first,
    // then substring — and never a silent guess when several match.
    if (typeof conn?.groupMetadata !== 'function' || !chat?.endsWith('@g.us')) return null
    const key = String(name || '').trim().toLowerCase().replace(/^@/, '')
    if (!key) return null
    let meta
    try { meta = await conn.groupMetadata(chat) } catch { return null }
    const referents = require('./referents')
    const matches = []
    for (const p of meta?.participants || []) {
        const rawId = p?.id || p?.jid || p?.lid || ''
        if (!rawId) continue
        const username = String(p?.username || '').replace(/^@/, '').toLowerCase()
        const display = String(referents.nameForJid(rawId) || '').toLowerCase()
        if (username === key || display === key || username.includes(key) || display.includes(key)) {
            matches.push({ jid: rawId, name: username || display || rawId })
        }
    }
    const deduped = [...new Map(matches.map(x => [x.jid, x])).values()]
    if (deduped.length === 1) return { jid: deduped[0].jid }
    if (deduped.length > 1) return { ambiguous: true, candidates: deduped }
    return null
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
    if (!jid && lower.startsWith('name:')) {
        // Named recipient ("forward this to babe"): resolve against the name
        // directory — pushNames the bot has seen plus aliases the user taught
        // with "remember <name> is <number>". The bot cannot read the user's
        // phone contacts, so an unknown name is an error, never a guess.
        const name = value.slice(5).trim()
        try {
            const referents = require('./referents')
            const resolved = referents.resolveName(name)
            if (resolved?.ambiguous) throw new Error(referents.clarificationReply(resolved.candidates.map(c => c.jid)))
            if (resolved?.jid) jid = resolved.jid
            else {
                // Not in the name directory — but if the message came from a
                // group, the roster itself may know the member. This is the
                // 2026-11-24 TECH SPACE bug: "who is baba" found
                // @baba.hany from the roster while "send hello to baba"
                // said it didn't know him, because the send path only
                // consulted the directory. A roster match is a real
                // WhatsApp fact, so it is also learned for later use.
                const groupResolved = await resolveNameFromGroup(conn, m?.chat, name)
                if (groupResolved?.ambiguous) throw new Error(referents.clarificationReply(groupResolved.candidates.map(c => c.jid)))
                if (groupResolved?.jid) {
                    jid = groupResolved.jid
                    try { referents.rememberAlias(name, jid) } catch {}
                } else throw new Error(`I don't know who "${name}" is yet. I can't see your phone contacts — tag them, reply to one of their messages, or give me their number (e.g. forward this to 254712345678). To teach me, say: remember ${name} is 254712345678`)
            }
        } catch (error) {
            if (error?.message?.includes('Which person did you mean') || error?.message?.includes("don't know who")) throw error
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

// Internal executor: runs a WhatsApp action that has ALREADY been confirmed
// (staged, then consumed via consume()/executeConfirmed()). External sends
// must never call execute() directly — they go through stage() + consume(),
// so every high-impact/external send has a preview, a single-use token, an
// owner check and a 2-minute TTL before anything reaches Baileys.
const execute = async (conn, owner, action) => {
    try {
        if (!action || !['send', 'sendMedia', 'forward', 'story', 'groupstory', 'react', 'pin', 'unpin', 'edit', 'delete', 'poll'].includes(action.type)) throw new Error('Unknown WhatsApp action.')
        if (action.type === 'send') {
            const target = action.jid ? { jid: action.jid, number: action.number || action.jid.split('@')[0], exists: true } : await checkNumber(conn, action.number)
            if (target.exists === false) throw new Error(`+${target.number} is not registered on WhatsApp.`)
            const sent = await conn.sendMessage(target.jid, { text: action.text })
            assertAccepted(sent, 'message')
            const result = { ok: true, jid: target.jid, number: target.number, message: BAILEYS_ACCEPTED_MESSAGE }
            record(owner, action, result)
            return result
        }

        if (action.type === 'sendMedia') {
            if (!action.jid || !action.url || !['image', 'video', 'audio', 'document', 'sticker'].includes(action.mediaType)) throw new Error('Invalid media action.')
            const sent = await conn.sendMessage(action.jid, { [action.mediaType]: { url: action.url }, ...(action.caption ? { caption: action.caption } : {}) })
            assertAccepted(sent, 'media message')
            const result = { ok: true, jid: action.jid, message: BAILEYS_ACCEPTED_MESSAGE }
            record(owner, action, result)
            return result
        }

        if (action.type === 'forward' && !Array.isArray(action.destinations)) {
            if (!action.jid || !action.message) throw new Error('A recipient and quoted message are required.')
            const sent = typeof conn.copyNForward === 'function'
                ? await conn.copyNForward(action.jid, action.message, true)
                : await conn.sendMessage(action.jid, action.message)
            assertAccepted(sent, 'forwarded message')
            const result = { ok: true, jid: action.jid, message: BAILEYS_ACCEPTED_MESSAGE }
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
            assertAccepted(sent, 'group story')
            const result = { ok: true, jid: action.groupJid, message: BAILEYS_ACCEPTED_MESSAGE }
            record(owner, action, result)
            return result
        }
        const sent = await conn.sendMessage('status@broadcast', {
            text: text.slice(0, 700),
            backgroundColor: action.backgroundColor || '#1DA462',
            font: Number.isInteger(action.font) ? action.font : 1,
        })
        assertAccepted(sent, 'story')
        const result = { ok: true, jid: 'status@broadcast', message: BAILEYS_ACCEPTED_MESSAGE }
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

// Native Yes/No buttons for a staged confirmation (Bera, 2026-11-27):
// instead of typing ".wact confirm <token>", the user taps a button.
// The tap comes back with the button id; parseConfirmationButtonId
// turns it back into (kind, token) for the Handler's tap route, which
// runs the exact same executeConfirmed/cancel path as the typed
// commands. The typed commands stay as the fallback (and the preview
// text still shows them), so nothing depends on buttons rendering.
const confirmationButtons = (token) => ([
    { id: `wact_confirm_${token}`, text: '✅ Yes — do it' },
    { id: `wact_cancel_${token}`, text: '❌ No — cancel' }
])
const parseConfirmationButtonId = (btnId) => {
    const match = /^(wact_confirm|wact_cancel)_([A-Za-z0-9]+)$/.exec(String(btnId || ''))
    if (!match) return null
    return { kind: match[1] === 'wact_confirm' ? 'confirm' : 'cancel', token: match[2] }
}

module.exports = {
    CLOSE_FRIENDS_UNSUPPORTED,
    PENDING_TTL_MS,
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
    confirmationButtons,
    parseConfirmationButtonId,
    formatPreview,
    formatPreviewMany,
    formatNairobiTime,
    getAudit,
    MAX_PENDING,
    PENDING_TTL_MS,
    PERSIST_KEY,
    _pending: pending,
}
