'use strict'

// ── Auto-listen for incoming voice notes ────────────────────────────────────
// A voice note (audioMessage with ptt:true and no caption/text) is downloaded,
// transcribed with Whisper via transcribeAudio (beraai.js), and the transcript
// is injected as the message text so the normal Handler flow — chat, commands,
// agent, project builds — treats it exactly as if it had been typed.
//
// SELF-BOT REALITY: this bot runs on the owner's own WhatsApp account, so
// EVERY message the owner sends — self-chat ('Message yourself') and groups
// included — arrives with key.fromMe=true. Blocking all fromMe voice notes
// (the original loop guard) therefore muted the owner completely. fromMe is
// no longer a blanket block; eligibility below decides:
//
// - PMs, not fromMe: any voice note is transcribed.
// - Self-chat (chat JID == the bot account's own number): the owner's own
//   voice notes are transcribed (caller passes isSelfChat).
// - Groups: owner only (caller passes isOwner via Auth.isAuthorized), fromMe
//   or not, so the bot does not transcribe/answer every member's voice notes.
// - A fromMe voice note in an ordinary PM is eligible only for the owner /
//   self-chat — never for anyone else.
//
// LOOP SAFETY (two layers, because fromMe is now allowed through):
// 1. Bot-sent registry: every place the bot sends a ptt voice note registers
//    the sent message id (markBotSentVoice); a voice note whose key.id is
//    registered is never transcribed.
// 2. Trigger backstop: transcripts of fromMe messages still pass the
//    Handler's existing fromMe guard afterwards, which only lets through
//    text starting with the prefix or a 'bera'/'agent' trigger — the same
//    rule as the owner's typed messages on this account. The bot's spoken
//    replies don't start with a trigger, so an unregistered echo dies there.
//
// - Ordinary audio files (ptt falsy) and view-once media are never touched.

// ── Bot-sent voice registry ─────────────────────────────────────────────────
// Bounded in-memory set of message ids the bot itself sent as voice notes.
// FIFO eviction at the cap, plus a TTL sweep so stale ids don't linger.
const BOT_SENT_TTL_MS = 30 * 60 * 1000
const BOT_SENT_MAX = 500
const botSentVoice = new Map() // messageId -> timestamp

const pruneBotSentVoice = () => {
    const cutoff = Date.now() - BOT_SENT_TTL_MS
    for (const [id, ts] of botSentVoice) {
        if (ts < cutoff) botSentVoice.delete(id)
    }
    while (botSentVoice.size > BOT_SENT_MAX) {
        botSentVoice.delete(botSentVoice.keys().next().value)
    }
}

const markBotSentVoice = (messageId) => {
    if (!messageId || typeof messageId !== 'string') return
    botSentVoice.set(messageId, Date.now())
    pruneBotSentVoice()
}

const isBotSentVoice = (messageId) => {
    if (!messageId) return false
    const ts = botSentVoice.get(messageId)
    if (ts === undefined) return false
    if (Date.now() - ts > BOT_SENT_TTL_MS) { botSentVoice.delete(messageId); return false }
    return true
}

// Shape check only: a bare ptt voice note with no text that the bot did not
// itself send. Who may be heard is voiceListenEligible's job, not this one's.
const isVoiceNoteMessage = (m) => {
    if (!m || typeof m !== 'object') return false
    if (m.text && String(m.text).trim()) return false
    const mtype = m.mtype || ''
    if (mtype === 'viewOnceMessage' || mtype === 'viewOnceMessageV2' || mtype === 'viewOnceMessageV2Extension') return false
    if (m.msg?.viewOnce === true) return false
    if (mtype !== 'audioMessage') return false
    if (m.msg?.ptt !== true) return false
    if (isBotSentVoice(m.key?.id)) return false
    return true
}

// deps: { isOwner, isSelfChat } — both computed by the caller (Handler), which
// owns the Auth check and knows the bot account's own JID (conn.user.id).
// A bare boolean is still accepted as shorthand for { isOwner }.
const voiceListenEligible = (m, deps = {}) => {
    if (typeof deps === 'boolean') deps = { isOwner: deps }
    if (!isVoiceNoteMessage(m)) return false
    if (m.isGroup) return deps.isOwner === true
    if (m.fromMe) return deps.isSelfChat === true || deps.isOwner === true
    return true
}

// ── Voice-note download ─────────────────────────────────────────────────────
// A downloaded buffer smaller than this is not a real voice note — the
// explicit .transcribe flow in Commands/bera.js uses the same threshold.
const VOICE_MIN_BYTES = 100
const isUsableAudio = (buffer) => Buffer.isBuffer(buffer) && buffer.length >= VOICE_MIN_BYTES

// Download the voice note's audio, codebase style:
// 1. conn.downloadMediaMessage with the minimal { key, message } shape —
//    the pattern every working download in this codebase uses (passing the
//    whole processed wrapper `m` instead is the suspected live failure:
//    eligible notes reached the Handler but no audio ever got transcribed).
// 2. Library/lib/baileys-media.js downloadRawMedia — unwraps the raw
//    message and re-requests the media via conn.updateMediaMessage, built
//    for messages whose media has no direct URL (e.g. LID-addressed notes).
// Returns { buffer } on success or { error } with the last failure seen.
const downloadVoiceNote = async (m, conn, deps = {}) => {
    let lastError = null
    if (typeof conn?.downloadMediaMessage === 'function') {
        try {
            const buffer = await conn.downloadMediaMessage({ key: m.key, message: m.message })
            if (isUsableAudio(buffer)) return { buffer }
            lastError = new Error(`downloadMediaMessage returned ${Buffer.isBuffer(buffer) ? `${buffer.length} bytes` : 'a non-buffer'}`)
        } catch (e) {
            lastError = e
        }
    } else {
        lastError = new Error('Media download is unavailable.')
    }
    try {
        const baileysMedia = require('../lib/baileys-media')
        const findMedia = deps.findMedia || baileysMedia.findMedia
        const downloadRawMedia = deps.downloadRawMedia || baileysMedia.downloadRawMedia
        const media = findMedia(m.message)
        if (media) {
            const buffer = await downloadRawMedia({ key: m.key, message: m.message }, media, conn)
            if (isUsableAudio(buffer)) return { buffer }
            lastError = new Error(`downloadRawMedia returned ${Buffer.isBuffer(buffer) ? `${buffer.length} bytes` : 'a non-buffer'}`)
        }
    } catch (e) {
        lastError = e
    }
    return { error: lastError }
}

// Returns one of:
//   { status: 'skip' }                          — not an eligible voice note; caller proceeds untouched
//   { status: 'ok', text }                      — m.text/m.body now hold the transcript
//   { status: 'failed', stage, error }          — eligible voice note, but a stage failed;
//                                                 stage is 'download' or 'transcribe' so the
//                                                 Handler log can tell the two apart
const applyVoiceTranscript = async (m, conn, deps = {}) => {
    const transcribe = deps.transcribeAudio || require('./beraai').transcribeAudio
    if (!voiceListenEligible(m, deps)) return { status: 'skip' }
    const { buffer, error: downloadError } = await downloadVoiceNote(m, conn, deps)
    if (!buffer) {
        return { status: 'failed', stage: 'download', error: `Could not download the voice note: ${downloadError?.message || downloadError || 'unknown error'}` }
    }
    const result = await transcribe(buffer, { mime: m.msg?.mimetype || m.mimetype || 'audio/ogg' })
    if (!result?.success || !result.text?.trim()) {
        return { status: 'failed', stage: 'transcribe', error: result?.error || 'Transcription returned no text.' }
    }
    const text = result.text.trim()
    m.text = text
    m.body = text
    m.isVoiceNote = true
    m.voiceTranscript = text
    return { status: 'ok', text }
}

module.exports = { isVoiceNoteMessage, voiceListenEligible, applyVoiceTranscript, markBotSentVoice, isBotSentVoice, VOICE_MIN_BYTES }
