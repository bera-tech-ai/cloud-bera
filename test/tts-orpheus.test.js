'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('fs')
const os = require('os')
const path = require('path')
const { fetchTts, fetchOrpheusWav, splitOrpheusChunks } = require('../Library/actions/tts')

// 2026-11-26: Casper's Orpheus voice (groq-audio, task 'speak') is the
// first-choice English voice in fetchTts, ahead of Piper → Google.
// These tests mock global.fetch so no real provider calls are made; the
// mocked WAV still goes through the real ffmpeg concat + Opus conversion.

// A minimal valid PCM WAV (24 kHz mono s16le silence, like Orpheus returns).
const makeWav = (seconds = 0.25, sampleRate = 24000) => {
    const frames = Math.floor(seconds * sampleRate)
    const dataSize = frames * 2
    const buf = Buffer.alloc(44 + dataSize)
    buf.write('RIFF', 0, 'ascii')
    buf.writeUInt32LE(36 + dataSize, 4)
    buf.write('WAVE', 8, 'ascii')
    buf.write('fmt ', 12, 'ascii')
    buf.writeUInt32LE(16, 16)
    buf.writeUInt16LE(1, 20) // PCM
    buf.writeUInt16LE(1, 22) // mono
    buf.writeUInt32LE(sampleRate, 24)
    buf.writeUInt32LE(sampleRate * 2, 28)
    buf.writeUInt16LE(2, 32)
    buf.writeUInt16LE(16, 34)
    buf.write('data', 36, 'ascii')
    buf.writeUInt32LE(dataSize, 40)
    return buf
}

const okResponse = () => ({
    ok: true,
    status: 200,
    json: async () => ({ success: true, data: { task: 'speak', mimeType: 'audio/wav', audioBase64: makeWav().toString('base64') } })
})

// Installs a mock global.fetch that records parsed request bodies.
const withMockFetch = async (handler, fn) => {
    const calls = []
    const original = global.fetch
    global.fetch = async (url, opts) => {
        const body = JSON.parse(opts.body)
        calls.push({ url, body })
        return handler(calls.length, body)
    }
    try {
        return await fn(calls)
    } finally {
        global.fetch = original
    }
}

const withEnv = async (value, fn) => {
    const prev = process.env.BERA_TTS_ORPHEUS
    if (value === undefined) delete process.env.BERA_TTS_ORPHEUS
    else process.env.BERA_TTS_ORPHEUS = value
    try {
        return await fn()
    } finally {
        if (prev === undefined) delete process.env.BERA_TTS_ORPHEUS
        else process.env.BERA_TTS_ORPHEUS = prev
    }
}

const longSentence = (tag) => `${tag} ${'word '.repeat(28)}done.`

test('splitOrpheusChunks packs sentences under the 200-char limit', () => {
    const text = [longSentence('Alpha'), longSentence('Bravo'), longSentence('Charlie')].join(' ')
    const chunks = splitOrpheusChunks(text)
    assert.equal(chunks.length, 3)
    for (const chunk of chunks) assert.ok(chunk.length <= 200, `chunk too long: ${chunk.length}`)
    assert.equal(chunks.join(' '), text)
})

test('splitOrpheusChunks hard-splits a single over-long sentence at word boundaries', () => {
    const text = `${'filler '.repeat(80)}end.`
    const chunks = splitOrpheusChunks(text)
    assert.ok(chunks.length >= 3)
    for (const chunk of chunks) assert.ok(chunk.length <= 200, `chunk too long: ${chunk.length}`)
    assert.equal(chunks.join(' '), text)
})

test('fetchOrpheusWav returns null without calling fetch when text needs more than 3 chunks', async () => {
    const text = Array.from({ length: 5 }, (_, i) => longSentence(`Part${i}`)).join(' ')
    assert.ok(splitOrpheusChunks(text).length > 3)
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'orpheus-test-'))
    try {
        await withMockFetch(() => okResponse(), async (calls) => {
            const out = await fetchOrpheusWav(text, tempDir)
            assert.equal(out, null)
            assert.equal(calls.length, 0)
        })
    } finally {
        fs.rmSync(tempDir, { recursive: true, force: true })
    }
})

test('fetchTts uses Orpheus first for a short English reply, with the `text` field', { timeout: 60000 }, async () => {
    await withEnv(undefined, () => withMockFetch(() => okResponse(), async (calls) => {
        const audio = await fetchTts('Hello Bera, this is the new voice speaking.', 'en')
        assert.ok(Buffer.isBuffer(audio))
        assert.equal(audio.toString('ascii', 0, 4), 'OggS', 'result should be OGG/Opus')
        assert.equal(calls.length, 1)
        assert.equal(calls[0].url, 'https://apiz.xcasper.space/api/ai/groq-audio')
        assert.equal(calls[0].body.task, 'speak')
        assert.equal(calls[0].body.text, 'Hello Bera, this is the new voice speaking.')
        assert.ok(!('textToSpeak' in calls[0].body), 'must not send the textToSpeak field — the endpoint 500s on it')
        assert.equal(calls[0].body.model, 'canopylabs/orpheus-v1-english')
        assert.equal(calls[0].body.voice, 'hannah')
    }))
})

test('fetchTts chunks a 201-600 char English reply into ordered Orpheus calls', { timeout: 60000 }, async () => {
    const text = [longSentence('Alpha'), longSentence('Bravo'), longSentence('Charlie')].join(' ')
    const expectedChunks = splitOrpheusChunks(text)
    assert.ok(expectedChunks.length >= 2 && expectedChunks.length <= 3)
    await withEnv(undefined, () => withMockFetch(() => okResponse(), async (calls) => {
        const audio = await fetchTts(text, 'en')
        assert.ok(Buffer.isBuffer(audio))
        assert.equal(audio.toString('ascii', 0, 4), 'OggS')
        assert.deepEqual(calls.map(c => c.body.text), expectedChunks)
        for (const call of calls) assert.ok(call.body.text.length <= 200)
    }))
})

test('fetchTts skips Orpheus entirely for replies over ~600 chars', { timeout: 60000 }, async () => {
    const text = Array.from({ length: 5 }, (_, i) => longSentence(`Part${i}`)).join(' ')
    await withEnv(undefined, () => withMockFetch(() => okResponse(), async (calls) => {
        const audio = await fetchTts(text, 'en')
        assert.ok(Buffer.isBuffer(audio), 'fallback path should still produce audio')
        assert.equal(audio.toString('ascii', 0, 4), 'OggS')
        assert.equal(calls.length, 0, 'Orpheus must not be called for >3-chunk replies')
    }))
})

test('fetchTts falls back without throwing when Orpheus returns HTTP 500', { timeout: 60000 }, async () => {
    await withEnv(undefined, () => withMockFetch(() => ({ ok: false, status: 500, json: async () => ({ success: false }) }), async (calls) => {
        const audio = await fetchTts('Fallback check after a provider error.', 'en')
        assert.ok(Buffer.isBuffer(audio))
        assert.equal(audio.toString('ascii', 0, 4), 'OggS')
        assert.equal(calls.length, 1)
    }))
})

test('fetchTts falls back without throwing when Orpheus returns success:false', { timeout: 60000 }, async () => {
    await withEnv(undefined, () => withMockFetch(() => ({ ok: true, status: 200, json: async () => ({ success: false, data: {} }) }), async (calls) => {
        const audio = await fetchTts('Fallback check after an unsuccessful response.', 'en')
        assert.ok(Buffer.isBuffer(audio))
        assert.equal(audio.toString('ascii', 0, 4), 'OggS')
        assert.equal(calls.length, 1)
    }))
})

test('BERA_TTS_ORPHEUS=0 disables the Orpheus path', { timeout: 60000 }, async () => {
    await withEnv('0', () => withMockFetch(() => okResponse(), async (calls) => {
        const audio = await fetchTts('Kill switch check, one two three.', 'en')
        assert.ok(Buffer.isBuffer(audio))
        assert.equal(calls.length, 0)
    }))
})

test('fetchTts keeps Swahili on the existing path (Orpheus not called)', { timeout: 60000 }, async () => {
    await withEnv(undefined, () => withMockFetch(() => okResponse(), async (calls) => {
        const audio = await fetchTts('Sasa mkuu, niaje? Niko poa kabisa.', 'sw')
        assert.ok(Buffer.isBuffer(audio))
        assert.equal(audio.toString('ascii', 0, 4), 'OggS')
        assert.equal(calls.length, 0)
    }))
})
