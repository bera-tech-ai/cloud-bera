'use strict'

// Voice-note listening (2026-11-26): transcribeAudio in beraai.js talks to
// Casper's Whisper endpoint (POST apiz.xcasper.space/api/ai/groq-audio), and
// Library/actions/voice-listen.js decides which incoming messages get
// auto-transcribed in the Handler. fetch is mocked throughout — no network.

const test = require('node:test')
const assert = require('node:assert/strict')
const { transcribeAudio, TRANSCRIBE_MAX_BYTES } = require('../Library/actions/beraai')
const { isVoiceNoteMessage, voiceListenEligible, applyVoiceTranscript } = require('../Library/actions/voice-listen')

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
    assert.equal(isVoiceNoteMessage({ ...pmVoiceNote(), fromMe: true }), false, "the bot's own voice replies must not loop")
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
    const conn = { downloadMediaMessage: async () => Buffer.from('ogg-bytes') }
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

test('applyVoiceTranscript reports failure and leaves the text untouched', async () => {
    const m = pmVoiceNote()
    const conn = { downloadMediaMessage: async () => Buffer.from('ogg-bytes') }
    const result = await applyVoiceTranscript(m, conn, {
        isOwner: false,
        transcribeAudio: async () => ({ success: false, error: 'Transcription service returned HTTP 500.' })
    })
    assert.equal(result.status, 'failed')
    assert.match(result.error, /500/)
    assert.equal(m.text, '')
})
