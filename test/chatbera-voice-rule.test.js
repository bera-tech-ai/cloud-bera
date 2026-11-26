'use strict'

// ChatBera voice-reply rule (2026-11-26, Bera's rule): a voice note in always
// gets a voice reply; a typed conversation gets its first 3 ChatBera replies
// as voice notes, then text; per-sender voice mode still always voices.
// Library/actions/voice-reply-rule.js is the pure decision helper the Handler
// ChatBera branch consults; the per-chat counter lives in
// db.data.chatbera.replyCounts. Also covers the m.fromVoiceNote marker that
// voice-listen stamps on a transcribed message for downstream reply paths.

const test = require('node:test')
const assert = require('node:assert/strict')
const { shouldVoiceReply, isVoiceReplyRuleEnabled, FIRST_VOICE_REPLIES } = require('../Library/actions/voice-reply-rule')
const { applyVoiceTranscript } = require('../Library/actions/voice-listen')

test('the first-3 allowance is exactly 3 replies', () => {
    assert.equal(FIRST_VOICE_REPLIES, 3)
})

test('a voice note in always gets a voice reply, regardless of count', () => {
    for (const repliesSent of [0, 1, 2, 3, 4, 25]) {
        assert.equal(shouldVoiceReply({ fromVoiceNote: true, repliesSent }), true, `repliesSent=${repliesSent}`)
    }
})

test('typed conversations: replies 1-3 are voice, the 4th onward is text', () => {
    assert.equal(shouldVoiceReply({ fromVoiceNote: false, repliesSent: 0 }), true)
    assert.equal(shouldVoiceReply({ fromVoiceNote: false, repliesSent: 1 }), true)
    assert.equal(shouldVoiceReply({ fromVoiceNote: false, repliesSent: 2 }), true)
    assert.equal(shouldVoiceReply({ fromVoiceNote: false, repliesSent: 3 }), false)
    assert.equal(shouldVoiceReply({ fromVoiceNote: false, repliesSent: 4 }), false)
    assert.equal(shouldVoiceReply({ fromVoiceNote: false, repliesSent: 100 }), false)
})

test('voice mode on always voices, even past the first 3', () => {
    assert.equal(shouldVoiceReply({ voiceModeOn: true, repliesSent: 0 }), true)
    assert.equal(shouldVoiceReply({ voiceModeOn: true, repliesSent: 3 }), true)
    assert.equal(shouldVoiceReply({ voiceModeOn: true, fromVoiceNote: false, repliesSent: 50 }), true)
})

test('kill switch off: the new cases never voice, voice mode still does', () => {
    assert.equal(shouldVoiceReply({ fromVoiceNote: true, repliesSent: 0, ruleEnabled: false }), false)
    assert.equal(shouldVoiceReply({ fromVoiceNote: false, repliesSent: 0, ruleEnabled: false }), false)
    assert.equal(shouldVoiceReply({ fromVoiceNote: false, repliesSent: 1, ruleEnabled: false }), false)
    assert.equal(shouldVoiceReply({ voiceModeOn: true, repliesSent: 9, ruleEnabled: false }), true)
})

test('BERA_CHATBERA_VOICE_RULE=0 disables the rule via the environment', () => {
    const original = process.env.BERA_CHATBERA_VOICE_RULE
    try {
        process.env.BERA_CHATBERA_VOICE_RULE = '0'
        assert.equal(isVoiceReplyRuleEnabled(), false)
        // No explicit ruleEnabled: the helper reads the env itself.
        assert.equal(shouldVoiceReply({ fromVoiceNote: true, repliesSent: 0 }), false)
        assert.equal(shouldVoiceReply({ fromVoiceNote: false, repliesSent: 0 }), false)
        assert.equal(shouldVoiceReply({ voiceModeOn: true, repliesSent: 0 }), true)
        delete process.env.BERA_CHATBERA_VOICE_RULE
        assert.equal(isVoiceReplyRuleEnabled(), true)
        assert.equal(shouldVoiceReply({ fromVoiceNote: true, repliesSent: 7 }), true)
    } finally {
        if (original === undefined) delete process.env.BERA_CHATBERA_VOICE_RULE
        else process.env.BERA_CHATBERA_VOICE_RULE = original
    }
})

test('shouldVoiceReply tolerates a missing or junk counter', () => {
    assert.equal(shouldVoiceReply({}), true, 'no replies sent yet counts as the first reply')
    assert.equal(shouldVoiceReply({ repliesSent: NaN }), true)
    assert.equal(shouldVoiceReply({ repliesSent: -2 }), true)
    assert.equal(shouldVoiceReply(), true)
})

test('applyVoiceTranscript stamps the fromVoiceNote marker for reply paths', async () => {
    const m = {
        key: { id: 'VN-MARKER-1', fromMe: false },
        mtype: 'audioMessage',
        msg: { ptt: true, mimetype: 'audio/ogg; codecs=opus' },
        text: '', body: '', isGroup: false, fromMe: false,
        chat: '254700000000@s.whatsapp.net', sender: '254700000000@s.whatsapp.net'
    }
    const conn = { downloadMediaMessage: async () => Buffer.alloc(256, 0x4f) }
    const result = await applyVoiceTranscript(m, conn, {
        isOwner: false,
        transcribeAudio: async () => ({ success: true, text: 'niaje mkuu' })
    })
    assert.equal(result.status, 'ok')
    assert.equal(m.fromVoiceNote, true, 'downstream paths can tell the message began as a voice note')
    assert.equal(m.isVoiceNote, true)
    assert.equal(m.text, 'niaje mkuu')
})

test('a skipped message gets no fromVoiceNote marker', async () => {
    const m = {
        key: { id: 'VN-MARKER-2', fromMe: false },
        mtype: 'audioMessage',
        msg: { ptt: true, mimetype: 'audio/ogg; codecs=opus' },
        text: '', body: '', isGroup: true, fromMe: false,
        chat: '120363000000000000@g.us', sender: '254700000000@s.whatsapp.net'
    }
    const conn = { downloadMediaMessage: async () => Buffer.alloc(256, 0x4f) }
    const result = await applyVoiceTranscript(m, conn, {
        isOwner: false, // group + non-owner → not eligible
        transcribeAudio: async () => ({ success: true, text: 'hi' })
    })
    assert.equal(result.status, 'skip')
    assert.equal(m.fromVoiceNote, undefined)
})
