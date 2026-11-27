'use strict'

// Voice-note listening (2026-11-26): transcribeAudio in beraai.js talks to
// Casper's Whisper endpoint (POST apiz.xcasper.space/api/ai/groq-audio), and
// Library/actions/voice-listen.js decides which incoming messages get
// auto-transcribed in the Handler. fetch is mocked throughout — no network.

const test = require('node:test')
const assert = require('node:assert/strict')
const { transcribeAudio, TRANSCRIBE_MAX_BYTES } = require('../Library/actions/beraai')
const { isVoiceNoteMessage, voiceListenEligible, applyVoiceTranscript, markBotSentVoice, isBotSentVoice } = require('../Library/actions/voice-listen')

const withFetch = async (impl, fn) => {
    const original = global.fetch
    const calls = []
    global.fetch = async (url, init) => { calls.push({ url, init }); return impl(url, init) }
    try { return await fn(calls) } finally { global.fetch = original }
}

const okJson = (payload) => ({ ok: true, status: 200, json: async () => payload })

test('transcribeAudio returns the transcript from a success envelope', async () => {
    await withFetch(async () => okJson({ success: true, data: { text: '  hello bera  ' } }), async (calls) => {
        const result = await transcribeAudio(Buffer.from('fake-ogg-bytes'))
        assert.deepEqual(result, { success: true, text: 'hello bera' })
        assert.equal(calls.length, 1)
        assert.equal(calls[0].url, 'https://apiz.xcasper.space/api/ai/groq-audio')
        const body = JSON.parse(calls[0].init.body)
        assert.equal(body.task, 'transcribe')
        assert.equal(body.model, 'whisper-large-v3-turbo')
        assert.ok(body.audioBase64.startsWith('data:audio/ogg;base64,'))
        assert.ok(!('language' in body), 'language must be omitted by default so Whisper auto-detects')
    })
})

test('transcribeAudio forwards language only when explicitly given', async () => {
    await withFetch(async () => okJson({ success: true, data: { text: 'sasa' } }), async (calls) => {
        const result = await transcribeAudio(Buffer.from('fake-ogg-bytes'), { language: 'sw', mime: 'audio/ogg; codecs=opus' })
        assert.equal(result.success, true)
        const body = JSON.parse(calls[0].init.body)
        assert.equal(body.language, 'sw')
        assert.ok(body.audioBase64.startsWith('data:audio/ogg;base64,'), 'mime parameters must be stripped from the data URI')
    })
})

test('transcribeAudio fails honestly on a success:false envelope', async () => {
    await withFetch(async () => okJson({ success: false, error: 'provider down' }), async () => {
        const result = await transcribeAudio(Buffer.from('fake-ogg-bytes'))
        assert.equal(result.success, false)
        assert.match(result.error, /provider down/)
    })
})

test('transcribeAudio fails honestly on an HTTP error', async () => {
    await withFetch(async () => ({ ok: false, status: 500, json: async () => ({}) }), async () => {
        const result = await transcribeAudio(Buffer.from('fake-ogg-bytes'))
        assert.equal(result.success, false)
        assert.match(result.error, /500/)
    })
})

test('transcribeAudio fails honestly on a network error', async () => {
    await withFetch(async () => { throw new Error('socket hangup') }, async () => {
        const result = await transcribeAudio(Buffer.from('fake-ogg-bytes'))
        assert.equal(result.success, false)
        assert.match(result.error, /socket hangup/)
    })
})

test('transcribeAudio rejects oversize audio without calling fetch', async () => {
    await withFetch(async () => okJson({ success: true, data: { text: 'x' } }), async (calls) => {
        const result = await transcribeAudio(Buffer.alloc(TRANSCRIBE_MAX_BYTES + 1))
        assert.equal(result.success, false)
        assert.match(result.error, /too large/i)
        assert.equal(calls.length, 0, 'fetch must not be called for oversize buffers')
    })
})

test('transcribeAudio rejects empty / non-buffer input without calling fetch', async () => {
    await withFetch(async () => okJson({ success: true, data: { text: 'x' } }), async (calls) => {
        assert.equal((await transcribeAudio(Buffer.alloc(0))).success, false)
        assert.equal((await transcribeAudio('not a buffer')).success, false)
        assert.equal((await transcribeAudio()).success, false)
        assert.equal(calls.length, 0)
    })
})

// ── Auto-listen routing (voice-listen helper) ───────────────────────────────

// A realistic-sized fake voice note (download validation requires >= 100 bytes).
const goodAudio = () => Buffer.alloc(256, 0x4f)

const pmVoiceNote = () => ({
    mtype: 'audioMessage',
    msg: { ptt: true, mimetype: 'audio/ogg; codecs=opus' },
    text: '', body: '', isGroup: false, fromMe: false,
    chat: '254700000000@s.whatsapp.net', sender: '254700000000@s.whatsapp.net'
})
const groupVoiceNote = () => ({ ...pmVoiceNote(), isGroup: true, chat: '120363000000000000@g.us' })

test('isVoiceNoteMessage only matches bare ptt audio notes', () => {
    assert.equal(isVoiceNoteMessage(pmVoiceNote()), true)
    assert.equal(isVoiceNoteMessage({ ...pmVoiceNote(), msg: { ptt: false } }), false, 'ordinary audio files are not voice notes')
    assert.equal(isVoiceNoteMessage({ ...pmVoiceNote(), text: 'caption' }), false, 'audio with text is left to the normal flow')
    assert.equal(isVoiceNoteMessage({ ...pmVoiceNote(), fromMe: true }), true, 'shape only: on this self-bot account fromMe is the owner — eligibility, not shape, gates it')
    assert.equal(isVoiceNoteMessage({ ...pmVoiceNote(), mtype: 'viewOnceMessageV2' }), false, 'view-once media is never auto-transcribed')
    assert.equal(isVoiceNoteMessage({ ...pmVoiceNote(), mtype: 'conversation', msg: {} }), false)
    assert.equal(isVoiceNoteMessage(null), false)
})

test('voiceListenEligible: PMs always, groups owner-only', () => {
    assert.equal(voiceListenEligible(pmVoiceNote(), false), true)
    assert.equal(voiceListenEligible(pmVoiceNote(), true), true)
    assert.equal(voiceListenEligible(groupVoiceNote(), true), true)
    assert.equal(voiceListenEligible(groupVoiceNote(), false), false)
})

test('applyVoiceTranscript injects the transcript as the message text', async () => {
    const m = pmVoiceNote()
    const conn = { downloadMediaMessage: async () => goodAudio() }
    const seen = []
    const result = await applyVoiceTranscript(m, conn, {
        isOwner: false,
        transcribeAudio: async (buf, opts) => { seen.push({ buf, opts }); return { success: true, text: '  bera, build me a shop site  ' } }
    })
    assert.equal(result.status, 'ok')
    assert.equal(m.text, 'bera, build me a shop site')
    assert.equal(m.body, 'bera, build me a shop site')
    assert.equal(m.isVoiceNote, true)
    assert.equal(seen.length, 1)
    assert.equal(seen[0].opts.mime, 'audio/ogg; codecs=opus')
})

test('applyVoiceTranscript skips a non-owner group voice note without downloading', async () => {
    const m = groupVoiceNote()
    let downloads = 0
    const conn = { downloadMediaMessage: async () => { downloads++; return Buffer.from('x') } }
    const result = await applyVoiceTranscript(m, conn, { isOwner: false, transcribeAudio: async () => ({ success: true, text: 'hi' }) })
    assert.equal(result.status, 'skip')
    assert.equal(downloads, 0)
    assert.equal(m.text, '')
})

// ── Self-bot cases: the owner IS this account, so his notes are fromMe ──────
// Regression tests for the live bug where Bera's self-chat voice notes got
// no response at all: isVoiceNoteMessage used to reject every fromMe note.

const OWN = '254743982206@s.whatsapp.net'
const selfChatVoiceNote = () => ({
    ...pmVoiceNote(), fromMe: true, chat: OWN, sender: OWN, key: { id: 'OWNER-SELF-1', fromMe: true }
})

test('self-chat: the owner\'s own (fromMe) voice note is eligible and transcribed', async () => {
    const m = selfChatVoiceNote()
    assert.equal(voiceListenEligible(m, { isOwner: true, isSelfChat: true }), true)
    const conn = { downloadMediaMessage: async () => goodAudio() }
    const result = await applyVoiceTranscript(m, conn, {
        isOwner: true, isSelfChat: true,
        transcribeAudio: async () => ({ success: true, text: 'Agent, remind me to call the supplier at nine' })
    })
    assert.equal(result.status, 'ok')
    assert.equal(m.text, 'Agent, remind me to call the supplier at nine')
    assert.equal(m.isVoiceNote, true)
})

test('group: a fromMe voice note from the owner is eligible', async () => {
    const m = { ...groupVoiceNote(), fromMe: true, sender: OWN, key: { id: 'OWNER-GRP-1', fromMe: true } }
    assert.equal(voiceListenEligible(m, { isOwner: true }), true)
    assert.equal(voiceListenEligible(m, { isOwner: false }), false, 'group stays owner-only even for fromMe notes')
    const conn = { downloadMediaMessage: async () => goodAudio() }
    const result = await applyVoiceTranscript(m, conn, {
        isOwner: true,
        transcribeAudio: async () => ({ success: true, text: 'agent, who is casper' })
    })
    assert.equal(result.status, 'ok')
    assert.equal(m.text, 'agent, who is casper')
})

// ── ChatBera groups: members' voice notes must be hearable (2026-11-27) ────
// Regression tests for the live failure where ChatBera's voice-reply rule
// ("a voice note in always gets a voice reply") never fired in groups: the
// ChatBera branch only answers !fromMe messages, but group transcription
// was owner-only and the only owner is the bot account itself (always
// fromMe in a group) — so no answerable group message ever got transcribed,
// m.fromVoiceNote was never set, and members' voice notes got no reply at
// all. Where ChatBera is active in a group, its members' voice notes are
// now transcribed too; every other group stays owner-only.

test('group: a member voice note is eligible only when ChatBera is active in that group', () => {
    assert.equal(voiceListenEligible(groupVoiceNote(), { isOwner: false, groupChatBeraActive: true }), true)
    assert.equal(voiceListenEligible(groupVoiceNote(), { isOwner: false, groupChatBeraActive: false }), false)
    assert.equal(voiceListenEligible(groupVoiceNote(), { isOwner: false }), false, 'no ChatBera flag → owner-only, as before')
    assert.equal(voiceListenEligible(groupVoiceNote(), { isOwner: true }), true, 'owner needs no ChatBera flag')
    assert.equal(voiceListenEligible(groupVoiceNote(), { isOwner: true, groupChatBeraActive: true }), true)
})

test('group: the ChatBera flag does not widen PM eligibility', () => {
    const strangerPm = { ...pmVoiceNote(), fromMe: true, key: { id: 'STRANGER-PM-2', fromMe: true } }
    assert.equal(voiceListenEligible(strangerPm, { isOwner: false, isSelfChat: false, groupChatBeraActive: true }), false)
})

test('group: a member voice note in a ChatBera group is transcribed and marked fromVoiceNote', async () => {
    const m = groupVoiceNote()
    const conn = { downloadMediaMessage: async () => goodAudio() }
    const result = await applyVoiceTranscript(m, conn, {
        isOwner: false, groupChatBeraActive: true,
        transcribeAudio: async () => ({ success: true, text: 'sasa, habari yako' })
    })
    assert.equal(result.status, 'ok')
    assert.equal(m.text, 'sasa, habari yako')
    assert.equal(m.isVoiceNote, true)
    // The marker the ChatBera voice-reply rule keys on: with it set, the
    // reply is voice no matter how many replies the chat already had —
    // in a group exactly as in a PM.
    assert.equal(m.fromVoiceNote, true)
    const { shouldVoiceReply } = require('../Library/actions/voice-reply-rule')
    assert.equal(shouldVoiceReply({ fromVoiceNote: m.fromVoiceNote === true, voiceModeOn: false, repliesSent: 99 }), true)
})

test('group: a member voice note without ChatBera active is still skipped untouched', async () => {
    const m = groupVoiceNote()
    let downloads = 0
    const conn = { downloadMediaMessage: async () => { downloads++; return Buffer.from('x') } }
    const result = await applyVoiceTranscript(m, conn, { isOwner: false, groupChatBeraActive: false, transcribeAudio: async () => ({ success: true, text: 'hi' }) })
    assert.equal(result.status, 'skip')
    assert.equal(downloads, 0)
    assert.equal(m.text, '')
    assert.equal(m.fromVoiceNote, undefined)
})

test('Handler wiring: the auto-listen call passes the group ChatBera activation through', () => {
    const fs = require('node:fs')
    const path = require('node:path')
    const src = fs.readFileSync(path.join(__dirname, '..', 'Handler', 'index.js'), 'utf8')
    assert.match(src, /groupChatBeraActive/)
    assert.match(src, /applyVoiceTranscript\(m, conn, \{[^}]*groupChatBeraActive \}\)/)
    // Activation mirrors the ChatBera branch: group toggle + global or per-chat on.
    assert.match(src, /_cbPrefs\.groupEnabled === true/)
    assert.match(src, /_cbPrefs\.enabled\?\.\[m\.chat\]/)
})

test('a voice note registered as bot-sent is skipped, even in self-chat', async () => {
    markBotSentVoice('BOT-SENT-1')
    assert.equal(isBotSentVoice('BOT-SENT-1'), true)
    const m = { ...selfChatVoiceNote(), key: { id: 'BOT-SENT-1', fromMe: true } }
    assert.equal(isVoiceNoteMessage(m), false, 'registered bot voice notes are never voice-note candidates')
    let downloads = 0
    const conn = { downloadMediaMessage: async () => { downloads++; return Buffer.from('x') } }
    const result = await applyVoiceTranscript(m, conn, {
        isOwner: true, isSelfChat: true,
        transcribeAudio: async () => ({ success: true, text: 'bot reply transcript' })
    })
    assert.equal(result.status, 'skip')
    assert.equal(downloads, 0)
    assert.equal(m.text, '')
})

test('a fromMe voice note in a PM that is not self-chat and not the owner is skipped', async () => {
    const m = { ...pmVoiceNote(), fromMe: true, key: { id: 'STRANGER-PM-1', fromMe: true } }
    assert.equal(voiceListenEligible(m, { isOwner: false, isSelfChat: false }), false)
    let downloads = 0
    const conn = { downloadMediaMessage: async () => { downloads++; return Buffer.from('x') } }
    const result = await applyVoiceTranscript(m, conn, {
        isOwner: false, isSelfChat: false,
        transcribeAudio: async () => ({ success: true, text: 'hi' })
    })
    assert.equal(result.status, 'skip')
    assert.equal(downloads, 0)
    assert.equal(m.text, '')
})

// ── Download stage: codebase shape, robust fallback, stage-tagged failures ──
// Regression tests for the live failure where every real voice note got
// "transcription failed": applyVoiceTranscript used to pass the whole
// processed wrapper `m` to conn.downloadMediaMessage instead of the
// codebase's minimal { key, message } shape, and the real error was
// swallowed. These lock the download pattern and the failure observability.

const rawVoiceNote = () => ({
    ...pmVoiceNote(),
    key: { id: 'RAW-VN-1', remoteJid: '254700000000@s.whatsapp.net', fromMe: false },
    message: { audioMessage: { ptt: true, mimetype: 'audio/ogg; codecs=opus', seconds: 3 } }
})

test('download uses the codebase { key, message } shape, not the whole wrapper', async () => {
    const m = rawVoiceNote()
    const seenArgs = []
    const conn = {
        downloadMediaMessage: async (arg) => {
            seenArgs.push(arg)
            const shaped = arg && typeof arg === 'object' && arg.key === m.key && arg.message === m.message &&
                Object.keys(arg).length === 2
            if (!shaped) throw new Error('downloadMediaMessage called with the wrong shape')
            return goodAudio()
        }
    }
    const result = await applyVoiceTranscript(m, conn, {
        isOwner: false,
        transcribeAudio: async () => ({ success: true, text: 'agent, hello' })
    })
    assert.equal(result.status, 'ok')
    assert.equal(m.text, 'agent, hello')
    assert.equal(seenArgs.length, 1)
})

test('when the shaped download throws, the robust raw-media fallback is used', async () => {
    const m = rawVoiceNote()
    let fallbackRaw = null
    const conn = {
        downloadMediaMessage: async () => { throw new Error('No valid media URL or directPath present in message') },
        updateMediaMessage: async () => {}
    }
    const result = await applyVoiceTranscript(m, conn, {
        isOwner: false,
        downloadRawMedia: async (raw, media, sock) => {
            fallbackRaw = raw
            assert.equal(media.type, 'audioMessage', 'fallback receives the findMedia descriptor')
            assert.equal(sock, conn, 'fallback receives the connection for re-upload requests')
            return goodAudio()
        },
        transcribeAudio: async () => ({ success: true, text: 'agent, fallback worked' })
    })
    assert.equal(result.status, 'ok')
    assert.equal(m.text, 'agent, fallback worked')
    assert.deepEqual(fallbackRaw, { key: m.key, message: m.message })
})

test('a tiny/empty download (fallback also empty) fails at the download stage, transcribe never called', async () => {
    const m = rawVoiceNote()
    let transcribeCalls = 0
    const conn = { downloadMediaMessage: async () => Buffer.alloc(10) }
    const result = await applyVoiceTranscript(m, conn, {
        isOwner: false,
        downloadRawMedia: async () => Buffer.alloc(0),
        transcribeAudio: async () => { transcribeCalls++; return { success: true, text: 'hi' } }
    })
    assert.equal(result.status, 'failed')
    assert.equal(result.stage, 'download')
    assert.match(result.error, /download/i)
    assert.equal(transcribeCalls, 0)
    assert.equal(m.text, '')
})

test('a transcription failure after a good download is tagged stage transcribe', async () => {
    const m = rawVoiceNote()
    const conn = { downloadMediaMessage: async () => goodAudio() }
    const result = await applyVoiceTranscript(m, conn, {
        isOwner: false,
        transcribeAudio: async () => ({ success: false, error: 'Whisper provider unavailable.' })
    })
    assert.equal(result.status, 'failed')
    assert.equal(result.stage, 'transcribe')
    assert.match(result.error, /Whisper provider/)
    assert.equal(m.text, '')
})

test('applyVoiceTranscript reports failure and leaves the text untouched', async () => {
    const m = pmVoiceNote()
    const conn = { downloadMediaMessage: async () => goodAudio() }
    const result = await applyVoiceTranscript(m, conn, {
        isOwner: false,
        transcribeAudio: async () => ({ success: false, error: 'Transcription service returned HTTP 500.' })
    })
    assert.equal(result.status, 'failed')
    assert.match(result.error, /500/)
    assert.equal(m.text, '')
})
