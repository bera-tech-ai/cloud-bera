'use strict'

// Library/lib/referents.js — Spec §3 context resolution (Phase 2).
//
// Per-chat referent tracker: the last mentioned/quoted person, the last
// bot message key and the last user message key, with a TTL and pruning.
// Pronouns ("him/her/them", "that person", "the person who replied") and
// message references ("the message I just sent", "the last message") resolve
// against this tracker. On ambiguity the tracker returns a candidate list
// for the standard clarification reply — callers must never send on
// ambiguity (spec §3: "Bera must never silently send a message to an
// unintended person or group").

const REFERENT_TTL_MS = 10 * 60 * 1000
const MAX_PERSONS = 5
const MAX_CHATS = 500

// ── Name directory (forward/send to a named person) ──────────────────────
// The bot cannot read the user's phone contacts, so names come from two
// sources only: (1) pushNames seen on inbound messages (the sender's own
// WhatsApp display name — NOT the user's saved contact name), learned in
// recordInbound and persisted in db.data.learnedNames; (2) aliases the
// user teaches with "remember <name> is <number>", persisted in
// db.data.nameAliases. Never guess a recipient: when two distinct people
// share one pushName and no taught alias overrides it, resolveName
// returns ambiguous and callers must ask instead.
const names = new Map() // normalized name -> { jid, name, source, at } (first claimant; display/fallback entry)
const claimants = new Map() // normalized name -> Map(bareNumber -> { jid, name, at }) — EVERY pushName claimant
const MAX_NAMES = 2000
const normalizeName = (value) => String(value || '').trim().toLowerCase().replace(/\s+/g, ' ')
const bareNumber = (jid) => String(jid || '').split('@')[0].split(':')[0]

// Learned pushNames persist in db.data.learnedNames (same store the taught
// aliases use) so a restart does not rebuild the directory from scratch —
// rebuilding is exactly when the first-writer race below could hand a name
// to the wrong person. Writes are throttled: learnName runs on every
// inbound message, db.write() persists the whole snapshot.
let learnedSaveTimer = null
const schedulePersistLearnedNames = () => {
    if (learnedSaveTimer) return
    learnedSaveTimer = setTimeout(() => {
        learnedSaveTimer = null
        try {
            if (global.db?.data && typeof global.db.write === 'function') {
                const out = {}
                for (const [key, claims] of claimants) {
                    out[key] = [...claims.values()].map(v => ({ jid: v.jid, name: v.name, at: v.at }))
                }
                global.db.data.learnedNames = out
                global.db.write().catch(() => {})
            }
        } catch {}
    }, 2000)
    learnedSaveTimer.unref?.()
}
const loadLearnedNames = () => {
    try {
        const saved = global.db?.data?.learnedNames
        if (saved && typeof saved === 'object') {
            for (const [name, rows] of Object.entries(saved)) {
                const key = normalizeName(name)
                if (!key || !Array.isArray(rows)) continue
                let claims = claimants.get(key)
                if (!claims) { claims = new Map(); claimants.set(key, claims) }
                for (const row of rows) {
                    const id = normalizeJid(row?.jid)
                    if (!id) continue
                    const bare = bareNumber(id)
                    if (!claims.has(bare)) claims.set(bare, { jid: id, name: String(row?.name || name).trim(), at: Number(row?.at || 0) })
                }
                if (!names.has(key) && claims.size) {
                    const first = claims.values().next().value
                    names.set(key, { jid: first.jid, name: first.name, source: 'pushName', at: first.at || Date.now() })
                }
            }
        }
    } catch {}
}

const learnName = (jid, name) => {
    const key = normalizeName(name)
    const id = normalizeJid(jid)
    if (!key || key.length < 2 || !id) return
    loadLearnedNames()
    // Track EVERY claimant of this pushName, keyed by bare number so the
    // same person seen under a LID and a phone JID counts once. Two
    // distinct numbers claiming one name makes the name ambiguous —
    // resolveName must ask, never silently pick the first writer.
    let claims = claimants.get(key)
    if (!claims) { claims = new Map(); claimants.set(key, claims) }
    const bare = bareNumber(id)
    const existing = claims.get(bare)
    const isNew = !existing
    // Prefer the phone JID form when both forms of the same person appear.
    const bestJid = existing && !String(id).endsWith('@s.whatsapp.net') ? existing.jid : id
    claims.set(bare, { jid: bestJid, name: String(name).trim(), at: Date.now() })
    if (!names.has(key)) names.set(key, { jid: id, name: String(name).trim(), source: 'pushName', at: Date.now() })
    while (names.size > MAX_NAMES) names.delete(names.keys().next().value)
    while (claimants.size > MAX_NAMES) claimants.delete(claimants.keys().next().value)
    if (isNew) schedulePersistLearnedNames()
}
// Reverse lookup: the display name (pushName or user-taught alias) known for
// a JID, or null. Used by the wa_group_members tool so a member list can
// show names instead of bare numbers. Matches on the full JID and on the
// bare number part, so LID and phone JIDs for the same person both hit.
const nameForJid = (jid) => {
    const id = normalizeJid(jid)
    if (!id) return null
    loadLearnedNames()
    const bare = String(id).split('@')[0].split(':')[0]
    for (const entry of names.values()) {
        if (!entry?.jid) continue
        const entryBare = String(entry.jid).split('@')[0].split(':')[0]
        if (entry.jid === id || entryBare === bare) return entry.name
    }
    // The names map keeps only the first claimant per name; a second person
    // sharing that pushName is in claimants instead.
    for (const claims of claimants.values()) {
        for (const [claimBare, v] of claims) {
            if (v.jid === id || claimBare === bare) return v.name
        }
    }
    return null
}

const loadAliases = () => {
    try {
        const saved = global.db?.data?.nameAliases
        if (saved && typeof saved === 'object') {
            for (const [name, jid] of Object.entries(saved)) {
                const key = normalizeName(name)
                if (key && jid) names.set(key, { jid: normalizeJid(jid), name: String(name).trim(), source: 'alias', at: Date.now() })
            }
        }
    } catch {}
}
const rememberAlias = (name, jid) => {
    const key = normalizeName(name)
    const id = normalizeJid(jid)
    if (!key || key.length < 2 || !id) return false
    loadAliases()
    names.set(key, { jid: id, name: String(name).trim(), source: 'alias', at: Date.now() })
    try {
        if (global.db?.data) {
            global.db.data.nameAliases = global.db.data.nameAliases || {}
            global.db.data.nameAliases[String(name).trim()] = id
            if (typeof global.db.write === 'function') global.db.write().catch(() => {})
        }
    } catch {}
    return true
}
// Resolve a person's name. Returns {jid} | {ambiguous:true, candidates:[{jid,name}]}
// | null when unknown. Matching is exact, then prefix/substring on known names.
const resolveName = (name) => {
    const key = normalizeName(name)
    if (!key) return null
    loadAliases()
    loadLearnedNames()
    const entry = names.get(key)
    // A user-taught alias always wins and is never ambiguous: the user
    // explicitly said who this name means.
    if (entry?.source === 'alias') return { jid: entry.jid }
    // Two or more distinct people share this pushName and no alias
    // disambiguates it: ambiguous — callers must ask, never guess
    // (spec §3). Returning the first writer here is how a message to
    // "babe" could silently land on a stranger with the same display name.
    const claims = claimants.get(key)
    if (claims && claims.size > 1) {
        return { ambiguous: true, candidates: [...claims.values()].map(v => ({ jid: v.jid, name: v.name })).slice(0, MAX_PERSONS) }
    }
    if (entry) return { jid: entry.jid }
    const pool = [...names.values()].filter(n => n.jid && (n.jid && (normalizeName(n.name).startsWith(key) || key.startsWith(normalizeName(n.name)) || normalizeName(n.name).includes(key))))
    // Expand pool entries whose name is claimed by several people, so a
    // partial match on a shared name is ambiguous too, not first-writer.
    const expanded = []
    for (const n of pool) {
        const nClaims = claimants.get(normalizeName(n.name))
        if (nClaims && nClaims.size > 1) {
            for (const v of nClaims.values()) expanded.push({ jid: v.jid, name: v.name })
        } else expanded.push(n)
    }
    const deduped = [...new Map(expanded.map(n => [n.jid, n])).values()]
    if (deduped.length === 1) return { jid: deduped[0].jid }
    if (deduped.length > 1) return { ambiguous: true, candidates: deduped.slice(0, MAX_PERSONS) }
    return null
}

// chatJid -> { persons: [{jid, at, kind}], lastBotMessageKey, lastUserMessageKey,
//              lastMessageKey, lastQuotedPerson, lastMentionedPerson, updatedAt }
const store = new Map()

const normalizeJid = (value) => {
    const raw = String(value || '').trim()
    return raw ? raw.replace(/^\+/, '') : null
}

const pruneChat = (chat) => {
    const entry = store.get(chat)
    if (!entry) return null
    const now = Date.now()
    entry.persons = (entry.persons || []).filter(p => now - p.at <= REFERENT_TTL_MS)
    if (!entry.persons.length && !entry.lastBotMessageKey && !entry.lastUserMessageKey) {
        store.delete(chat)
        return null
    }
    return entry
}

const getEntry = (chat) => {
    if (!chat) return null
    pruneChat(chat)
    return store.get(chat) || null
}

const ensureEntry = (chat) => {
    let entry = store.get(chat)
    if (!entry) {
        entry = { persons: [], lastBotMessageKey: null, lastUserMessageKey: null, lastMessageKey: null, lastQuotedPerson: null, lastMentionedPerson: null, updatedAt: Date.now() }
        store.set(chat, entry)
        while (store.size > MAX_CHATS) store.delete(store.keys().next().value)
    }
    return entry
}

const rememberPerson = (entry, jid, kind) => {
    const normalized = normalizeJid(jid)
    if (!normalized) return
    entry.persons = (entry.persons || []).filter(p => p.jid !== normalized)
    entry.persons.unshift({ jid: normalized, at: Date.now(), kind: kind || 'mentioned' })
    while (entry.persons.length > MAX_PERSONS) entry.persons.pop()
    entry.updatedAt = Date.now()
}

// Record an inbound user message: sender, quoted sender, mentions, key.
const recordInbound = (m) => {
    const chat = m?.chat || m?.key?.remoteJid
    if (!chat || !m?.key) return null
    const entry = ensureEntry(chat)
    if (m.sender) rememberPerson(entry, m.sender, 'sender')
    // Learn the sender's own WhatsApp display name for name resolution.
    // This is their pushName, not the user's saved contact name.
    if (m.sender && m.pushName) learnName(m.sender, m.pushName)
    const quotedSender = m?.quoted?.sender || m?.quoted?.key?.participant || m?.quoted?.key?.participantAlt
    if (quotedSender) {
        entry.lastQuotedPerson = normalizeJid(quotedSender)
        rememberPerson(entry, quotedSender, 'quoted')
    }
    const mentioned = m?.mentionedJid?.[0] || m?.message?.extendedTextMessage?.contextInfo?.mentionedJid?.[0]
    if (mentioned) {
        entry.lastMentionedPerson = normalizeJid(mentioned)
        rememberPerson(entry, mentioned, 'mentioned')
    }
    // The replier is also a referent: "the person who replied".
    if (quotedSender && m.sender) rememberPerson(entry, m.sender, 'replier')
    entry.lastUserMessageKey = m.key
    entry.lastMessageKey = m.key
    entry.updatedAt = Date.now()
    return entry
}

// Record an outbound bot message so "the message I just sent" resolves.
const recordOutbound = (chat, key) => {
    if (!chat || !key) return null
    const entry = ensureEntry(chat)
    entry.lastBotMessageKey = key
    entry.lastMessageKey = key
    entry.updatedAt = Date.now()
    return entry
}

const PRONOUN_WORDS = new Set(['him', 'her', 'them', 'they', 'that person', 'this person', 'the person', 'that user', 'the user'])
const PERSON_WHO_REPLIED = /\b(person|user|member|admin)\s+who\s+(replied|answered|responded)\b/i

// Resolve a person reference. Returns {jid} | {ambiguous:true, candidates:[jid]}
// | {jid:null} when nothing is known. `spec` may be a pronoun, "quoted",
// "mentioned"/"tagged", or a bare JID/number (handled by wa-actions).
const resolvePerson = (chat, spec, m) => {
    const value = String(spec || '').trim().toLowerCase()
    const entry = getEntry(chat)
    const quoted = m?.quoted?.sender || m?.quoted?.key?.participant || m?.quoted?.key?.participantAlt
    const mentioned = m?.mentionedJid?.[0] || m?.message?.extendedTextMessage?.contextInfo?.mentionedJid?.[0]
    if (value === 'quoted' || value === 'replied' || value === 'reply') {
        return quoted ? { jid: normalizeJid(quoted) } : { jid: null }
    }
    if (['tag', 'tagged', 'mention', 'mentioned'].includes(value)) {
        return mentioned ? { jid: normalizeJid(mentioned) } : { jid: null }
    }
    if (PERSON_WHO_REPLIED.test(value)) {
        // The replier is the inbound sender when a quote exists; otherwise the
        // last quoted person is the only safe reading.
        if (quoted && m?.sender) return { jid: normalizeJid(m.sender) }
        return entry?.lastQuotedPerson ? { jid: entry.lastQuotedPerson } : { jid: null }
    }
    if (!PRONOUN_WORDS.has(value) && !/^(him|her|them)$/.test(value)) return { jid: null }
    if (!entry || !entry.persons.length) return { jid: null }
    const candidates = entry.persons.map(p => p.jid)
    // The sender themselves is never a pronoun target unless they are the
    // only recent person; exclude them when another candidate exists.
    const others = candidates.filter(jid => m?.sender && normalizeJid(m.sender) !== jid)
    const pool = others.length ? others : candidates
    if (pool.length === 1) return { jid: pool[0] }
    return { ambiguous: true, candidates: pool.slice(0, MAX_PERSONS) }
}

// Resolve a message-key reference. `currentKey` is the inbound message's key
// ("this message"). Returns {key} | {key:null}.
const resolveMessageKey = (chat, spec, currentKey, m) => {
    const value = String(spec || '').trim().toLowerCase()
    const entry = getEntry(chat)
    if (['this', 'this message', 'this msg', 'current message'].includes(value)) {
        return { key: currentKey || m?.key || null }
    }
    if (['quoted', 'replied', 'quoted message'].includes(value)) {
        return { key: m?.quoted?.key || null }
    }
    if (['my last message', 'the message i just sent', 'the message i sent', 'my message', 'last bot message', 'bot message'].includes(value)) {
        return { key: entry?.lastBotMessageKey || null }
    }
    if (['last message', 'the last message', 'that message', 'that msg'].includes(value)) {
        return { key: entry?.lastMessageKey || currentKey || null }
    }
    return { key: null }
}

const clarificationReply = (candidates) => {
    const lines = (candidates || []).map((jid, i) => `${i + 1}. +${String(jid).split('@')[0].split(':')[0]}`).join('\n')
    return '❓ Which person did you mean? I found more than one recent person, so I did not send anything.\n\n' +
        lines +
        '\n\nReply with the number, tag the person, or quote their message and try again.'
}

const clearChat = (chat) => store.delete(chat)

module.exports = {
    REFERENT_TTL_MS,
    recordInbound,
    recordOutbound,
    resolvePerson,
    resolveMessageKey,
    clarificationReply,
    clearChat,
    getEntry,
    learnName,
    rememberAlias,
    resolveName,
    nameForJid,
    normalizeName,
    _store: store,
    _names: names,
    _claimants: claimants,
}
