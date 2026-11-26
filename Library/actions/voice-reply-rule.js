'use strict'

// ── ChatBera voice-reply rule ───────────────────────────────────────────────
// Bera's rule (2026-11-26): ChatBera answers in voice at the start of a
// conversation, and whenever the other person speaks in voice:
//   1. The incoming message was a voice note → the reply is a voice note,
//      always, regardless of how many replies came before.
//   2. A typed conversation gets its first 3 ChatBera replies as voice
//      notes; from the 4th reply onward, text only.
//   3. The per-sender voice mode (chatbera.voiceReplies) still forces voice
//      replies exactly as before — this rule only ADDS voice cases, it never
//      removes an existing one.
// The per-chat counter of replies already sent lives in
// db.data.chatbera.replyCounts (keyed by chat JID) so a restart does not
// reset the first-3 allowance.
// Kill switch: BERA_CHATBERA_VOICE_RULE=0 disables the NEW cases (1) and (2);
// existing voice-mode behaviour is untouched.

const FIRST_VOICE_REPLIES = 3

const isVoiceReplyRuleEnabled = (env = process.env) => env.BERA_CHATBERA_VOICE_RULE !== '0'

// Pure decision: should this ChatBera reply go out as a voice note?
//   fromVoiceNote — the incoming message began as a voice note (transcribed
//                   by voice-listen; marked m.fromVoiceNote / m.isVoiceNote)
//   voiceModeOn   — per-sender voice mode is on for this sender
//   repliesSent   — ChatBera replies already sent in this chat before this one
//   ruleEnabled   — kill-switch state; defaults to reading the environment
const shouldVoiceReply = ({ fromVoiceNote = false, voiceModeOn = false, repliesSent = 0, ruleEnabled } = {}) => {
    if (voiceModeOn) return true
    const enabled = ruleEnabled === undefined ? isVoiceReplyRuleEnabled() : ruleEnabled === true
    if (!enabled) return false
    if (fromVoiceNote) return true
    const sent = Number.isFinite(repliesSent) ? Math.max(0, Math.floor(repliesSent)) : 0
    return sent < FIRST_VOICE_REPLIES
}

module.exports = { shouldVoiceReply, isVoiceReplyRuleEnabled, FIRST_VOICE_REPLIES }
