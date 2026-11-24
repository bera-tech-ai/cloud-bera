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
    _store: store,
}
