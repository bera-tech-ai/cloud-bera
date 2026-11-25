'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const { fetchTts, resolvePiper, toSpeechText } = require('../Library/actions/tts')

// 2026-11-24: the voice sounded like Google Translate TTS, so fetchTts now
// prefers a local Piper neural voice (en_US-lessac) and falls back to
// Google TTS only when Piper is missing or fails. These tests assert real
// audio comes back on both paths — they need the Piper install in this
// work dir (Library/assets/piper) or network access for the Google path.
test('toSpeechText strips the Bera AI card frame, markdown and emoji', () => {
    const card = '╭──────────────────────╮\n│ ◉ 𝗕𝗘𝗥𝗔 𝗔𝗜\n│   ᴡʜᴀᴛsᴀᴘᴘ ᴀssɪsᴛᴀɴᴛ\n├──────────────────────┤\n│ ◈ sᴛᴀᴛᴜs ⟶ ℹ️ ʀᴇsᴘᴏɴsᴇ\n│\n│ Yes — *Casper* is in this group. 🎉\n│ See https://example.com for more.\n│\n│   ⌬ ʙᴇʀᴀ ᴀɪ · ᴘʀᴇᴍɪᴜᴍ · v3.0.0\n╰──────────────────────╯'
    const spoken = toSpeechText(card)
    assert.equal(spoken, 'Yes — Casper is in this group. See for more.')
    assert.ok(!spoken.includes('𝗕𝗘𝗥𝗔'), 'card header must not be spoken')
    assert.ok(!spoken.includes('╭'), 'card frame must not be spoken')
    assert.ok(!spoken.includes('*'), 'markdown must not be spoken')
    assert.ok(!spoken.includes('https://'), 'URLs must not be spoken')
})

test('fetchTts returns Opus audio via the local neural voice', { timeout: 60000 }, async (t) => {
    const piper = resolvePiper('en')
    if (!piper) t.skip('Piper is not installed in this checkout — install Library/assets/piper to exercise the neural voice')
    const audio = await fetchTts('Hey Bera, this is me talking like a normal human now.', 'en')
    assert.ok(Buffer.isBuffer(audio), 'audio should be a Buffer')
    assert.ok(audio.length > 1000, `audio should be substantial, got ${audio.length} bytes`)
})

test('fetchTts speaks Swahili/Sheng text with the same voice', { timeout: 60000 }, async () => {
    const audio = await fetchTts('Sasa mkuu, niaje? Niko poa kabisa.', 'sw')
    assert.ok(Buffer.isBuffer(audio))
    assert.ok(audio.length > 1000, `audio should be substantial, got ${audio.length} bytes`)
})

test('fetchTts falls back to Google TTS when Piper is unavailable', { timeout: 60000 }, async () => {
    const prev = process.env.BERA_PIPER_BIN
    process.env.BERA_PIPER_BIN = '/nonexistent/piper'
    try {
        assert.equal(resolvePiper('en'), null)
        const audio = await fetchTts('Fallback check, one two three.', 'en')
        assert.ok(Buffer.isBuffer(audio))
        assert.ok(audio.length > 1000, `audio should be substantial, got ${audio.length} bytes`)
    } finally {
        if (prev === undefined) delete process.env.BERA_PIPER_BIN
        else process.env.BERA_PIPER_BIN = prev
    }
})
