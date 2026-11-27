'use strict'

// ── messages.upsert batch filter ────────────────────────────────────────────
// Baileys delivers the account owner's OWN phone messages — self-chat
// ("Message yourself") above all, including voice notes — to this
// linked-device bot with upsert type 'append', NOT 'notify'.
// Connection/start.js historically processed only 'notify', so the owner's
// self-chat voice notes were dropped before the Handler ever saw them
// (never transcribed, zero [VOICE LISTEN] activity) and self-chat messages
// typed on the phone were dropped too.
//
// 'append' batches also carry history sync: on (re)connect WhatsApp replays
// old messages in 'append' batches, and processing those would resurrect
// ancient commands and conversations. So an 'append' message is processed
// only when BOTH:
//   - it is the owner's own message (key.fromMe === true), and
//   - it is fresh — messageTimestamp (seconds) within APPEND_FRESH_MS of
//     now. A missing or non-numeric timestamp counts as NOT fresh: the
//     filter fails closed, never open.
// Everything else in an 'append' batch stays dropped, and 'notify' batches
// are processed whole, exactly as before.
//
// Downstream loop safety is unchanged: the Handler's fromMe trigger guard
// only lets owner messages with a prefix / 'bera' / 'agent' trigger act,
// and the bot-sent voice registry in Library/actions/voice-listen.js means
// the bot's own spoken replies are never transcribed back.

const APPEND_FRESH_MS = 120 * 1000

// messageTimestamp arrives in seconds; Baileys may hand it over as a
// number, a numeric string, or a protobuf Long ({ toNumber() }).
// Returns milliseconds since epoch, or NaN for anything unusable.
const messageTimestampMs = (msg) => {
    const raw = msg?.messageTimestamp
    if (typeof raw === 'number') return Number.isFinite(raw) ? raw * 1000 : NaN
    if (typeof raw === 'string' && raw.trim() !== '') {
        const seconds = Number(raw)
        return Number.isFinite(seconds) ? seconds * 1000 : NaN
    }
    if (raw && typeof raw.toNumber === 'function') {
        const seconds = raw.toNumber()
        return Number.isFinite(seconds) ? seconds * 1000 : NaN
    }
    return NaN
}

const isFreshAppendMessage = (msg, now = Date.now()) => {
    const tsMs = messageTimestampMs(msg)
    if (!Number.isFinite(tsMs)) return false
    // A timestamp slightly in the future (clock skew) yields a negative
    // age and counts as fresh; anything older than the window does not.
    return now - tsMs <= APPEND_FRESH_MS
}

// Should this upsert message be handed to the Handler?
//   'notify' → always (unchanged behaviour, every message in the batch).
//   'append' → only a fresh fromMe message (the owner's own phone).
//   anything else ('prepend', history notifications, …) → never.
const shouldProcessUpsertMessage = (type, msg, now = Date.now()) => {
    if (type === 'notify') return true
    if (type !== 'append') return false
    if (msg?.key?.fromMe !== true) return false
    return isFreshAppendMessage(msg, now)
}

module.exports = { shouldProcessUpsertMessage, isFreshAppendMessage, APPEND_FRESH_MS }
