'use strict'

// ── Auto-listen for incoming voice notes ────────────────────────────────────
// A voice note (audioMessage with ptt:true and no caption/text) is downloaded,
// transcribed with Whisper via transcribeAudio (beraai.js), and the transcript
// is injected as the message text so the normal Handler flow — chat, commands,
// agent, project builds — treats it exactly as if it had been typed.
//
// Scoping (deliberate):
// - PMs: any voice note is transcribed.
// - Groups: owner only, so the bot does not transcribe/answer every member's
//   voice notes (the caller computes isOwner via Auth.isAuthorized).
// - The bot's own messages (fromMe) are never transcribed — its outgoing
//   voice replies are ptt audio too, and listening to them would loop.
// - Ordinary audio files (ptt falsy) and view-once media are never touched.

const isVoiceNoteMessage = (m) => {
    if (!m || typeof m !== 'object') return false
    if (m.fromMe) return false
    if (m.text && String(m.text).trim()) return false
    const mtype = m.mtype || ''
    if (mtype === 'viewOnceMessage' || mtype === 'viewOnceMessageV2' || mtype === 'viewOnceMessageV2Extension') return false
    if (m.msg?.viewOnce === true) return false
    if (mtype !== 'audioMessage') return false
    return m.msg?.ptt === true
}

const voiceListenEligible = (m, isOwner) => {
    if (!isVoiceNoteMessage(m)) return false
    if (m.isGroup) return isOwner === true
    return true
}

// Returns one of:
//   { status: 'skip' }            — not an eligible voice note; caller proceeds untouched
//   { status: 'ok', text }        — m.text/m.body now hold the transcript
//   { status: 'failed', error }   — eligible voice note, but download/transcription failed
const applyVoiceTranscript = async (m, conn, deps = {}) => {
    const transcribe = deps.transcribeAudio || require('./beraai').transcribeAudio
    if (!voiceListenEligible(m, deps.isOwner === true)) return { status: 'skip' }
    if (typeof conn?.downloadMediaMessage !== 'function') {
        return { status: 'failed', error: 'Media download is unavailable.' }
    }
    let buffer
    try {
        buffer = await conn.downloadMediaMessage(m)
    } catch (e) {
        return { status: 'failed', error: `Could not download the voice note: ${e?.message || e}` }
    }
    if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
        return { status: 'failed', error: 'Could not download the voice note.' }
    }
    const result = await transcribe(buffer, { mime: m.msg?.mimetype || m.mimetype || 'audio/ogg' })
    if (!result?.success || !result.text?.trim()) {
        return { status: 'failed', error: result?.error || 'Transcription returned no text.' }
    }
    const text = result.text.trim()
    m.text = text
    m.body = text
    m.isVoiceNote = true
    m.voiceTranscript = text
    return { status: 'ok', text }
}

module.exports = { isVoiceNoteMessage, voiceListenEligible, applyVoiceTranscript }
