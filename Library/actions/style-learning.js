'use strict'

// ── ChatBera continuous style learning ───────────────────────────────────────
// ChatBera's style profile (db.data.chatbera.profile.myMessages) was trained
// once from exported chats and then never grew. This module lets it learn
// from Bera's REAL outgoing messages as he chats: a fromMe text message in a
// PM that the bot did NOT send is one of his own replies, so it becomes a new
// style sample.
//
// Telling his messages from the bot's: every ChatBera (and ghost) reply the
// bot sends is registered per chat in db.data.chatbera.sentReplies (last 10,
// with timestamps). A fromMe message that matches a registered reply within
// 10 minutes is bot-generated — it is skipped and the registry entry is
// consumed so the same text typed by Bera himself later still counts.
//
// Kill switch: BERA_CHATBERA_LEARN=0 disables learning (this module's caller
// checks isStyleLearningEnabled); the sent-reply registry is maintained
// regardless so re-enabling does not misclassify older bot replies.
// Pure helpers only — the Handler does the db reads/writes.

const SENT_REPLY_TTL_MS = 10 * 60 * 1000
const SENT_REPLIES_PER_CHAT = 10
const MAX_STYLE_SAMPLES = 400
const MIN_SAMPLE_CHARS = 3

const isStyleLearningEnabled = (env = process.env) => env.BERA_CHATBERA_LEARN !== '0'

const normalizeLearnText = (value) => String(value || '').trim().replace(/\s+/g, ' ')

// Index of the registry entry matching this text within the TTL, else -1.
const matchSentReplyIndex = (entries, text, now = Date.now()) => {
    const target = normalizeLearnText(text)
    if (!target || !Array.isArray(entries)) return -1
    return entries.findIndex(e => e
        && normalizeLearnText(e.text) === target
        && Number.isFinite(Number(e.ts))
        && now - Number(e.ts) <= SENT_REPLY_TTL_MS
        && Number(e.ts) <= now)
}

// Pure decision: should this message become a style sample?
// Returns { learn, reason } — plus sentReplyIndex when reason is 'bot-sent'
// so the caller can consume that registry entry.
const shouldLearnFromMessage = ({ fromMe = false, isGroup = false, isSelfChat = false, text = '', prefix = '', sentReplies = [], now } = {}) => {
    if (!fromMe) return { learn: false, reason: 'not-from-me' }
    if (isGroup) return { learn: false, reason: 'group' }
    if (isSelfChat) return { learn: false, reason: 'self-chat' }
    const value = normalizeLearnText(text)
    if (value.length < MIN_SAMPLE_CHARS) return { learn: false, reason: 'too-short' }
    if (prefix && value.startsWith(prefix)) return { learn: false, reason: 'command' }
    if (/^(bera|agent)\b/i.test(value)) return { learn: false, reason: 'agent-trigger' }
    if (/^https?:\/\/\S+$/i.test(value)) return { learn: false, reason: 'url-only' }
    const idx = matchSentReplyIndex(sentReplies, value, now)
    if (idx >= 0) return { learn: false, reason: 'bot-sent', sentReplyIndex: idx }
    return { learn: true, reason: 'owner-message', text: value }
}

// Register a bot-sent reply text for a chat (mutates the chatbera store).
// Returns true when an entry was recorded.
const registerSentReply = (store, chat, text, now = Date.now()) => {
    const value = normalizeLearnText(text)
    if (!store || typeof store !== 'object' || !chat || !value) return false
    store.sentReplies = (store.sentReplies && typeof store.sentReplies === 'object') ? store.sentReplies : {}
    const list = Array.isArray(store.sentReplies[chat]) ? store.sentReplies[chat] : []
    list.push({ text: value, ts: now })
    store.sentReplies[chat] = list.slice(-SENT_REPLIES_PER_CHAT)
    return true
}

// Remove one consumed registry entry (mutates the chatbera store).
const consumeSentReply = (store, chat, index) => {
    const list = store?.sentReplies?.[chat]
    if (!Array.isArray(list) || !Number.isInteger(index) || index < 0 || index >= list.length) return false
    list.splice(index, 1)
    return true
}

// Append a style sample to a profile (mutates profile.myMessages).
// Dedupes on normalized text; FIFO-caps the list at `max` samples, keeping
// the most recent. Returns true when the sample was added.
const appendStyleSample = (profile, text, max = MAX_STYLE_SAMPLES) => {
    if (!profile || typeof profile !== 'object') return false
    const value = normalizeLearnText(text)
    if (value.length < MIN_SAMPLE_CHARS) return false
    profile.myMessages = Array.isArray(profile.myMessages) ? profile.myMessages : []
    if (profile.myMessages.some(s => normalizeLearnText(s) === value)) return false
    profile.myMessages.push(value)
    const cap = Number.isFinite(max) && max > 0 ? Math.floor(max) : MAX_STYLE_SAMPLES
    if (profile.myMessages.length > cap) profile.myMessages = profile.myMessages.slice(-cap)
    return true
}

module.exports = {
    isStyleLearningEnabled,
    normalizeLearnText,
    matchSentReplyIndex,
    shouldLearnFromMessage,
    registerSentReply,
    consumeSentReply,
    appendStyleSample,
    SENT_REPLY_TTL_MS,
    SENT_REPLIES_PER_CHAT,
    MAX_STYLE_SAMPLES,
    MIN_SAMPLE_CHARS
}
