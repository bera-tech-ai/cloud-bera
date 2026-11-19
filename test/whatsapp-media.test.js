'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const { sendAudioMessage, isHttpUrl } = require('../Library/actions/whatsapp-media')

const fakeConnection = () => {
    const calls = []
    return { calls, conn: { sendMessage: async (...args) => { calls.push(args); return { key: { id: 'fake-message-id' } } } } }
}

test('sends a remote audio URL using Baileys URL payload and preserves quote/options', async () => {
    const { calls, conn } = fakeConnection()
    const quoted = { key: { id: 'incoming-message' } }
    const response = await sendAudioMessage(conn, '12345@s.whatsapp.net', 'https://media.example/song.mp3', {
        mimetype: 'audio/mpeg',
        fileName: 'sample.mp3',
        quoted
    })
    assert.deepEqual(calls[0], [
        '12345@s.whatsapp.net',
        { audio: { url: 'https://media.example/song.mp3' }, mimetype: 'audio/mpeg', ptt: false, fileName: 'sample.mp3' },
        { quoted }
    ])
    assert.equal(response.key.id, 'fake-message-id')
})

test('sends downloaded audio bytes as a Buffer payload', async () => {
    const { calls, conn } = fakeConnection()
    const bytes = Buffer.from([0x49, 0x44, 0x33, 0x00])
    await sendAudioMessage(conn, '12345@s.whatsapp.net', bytes, { fileName: 'sample.mp3' })
    assert.equal(calls.length, 1)
    assert.equal(calls[0][1].audio, bytes)
    assert.equal(calls[0][1].mimetype, 'audio/mpeg')
    assert.equal(calls[0][1].ptt, false)
    assert.equal(calls[0][2], undefined)
})

test('rejects object-shaped API responses before calling Baileys', async () => {
    const { calls, conn } = fakeConnection()
    await assert.rejects(
        sendAudioMessage(conn, '12345@s.whatsapp.net', { downloadUrl: 'https://media.example/song.mp3' }),
        /Audio source must be a Buffer or an HTTP\(S\) URL string/
    )
    assert.equal(calls.length, 0)
})

test('rejects malformed URLs and missing WhatsApp destinations', async () => {
    const { calls, conn } = fakeConnection()
    assert.equal(isHttpUrl('https://media.example/audio.mp3'), true)
    assert.equal(isHttpUrl('javascript:alert(1)'), false)
    await assert.rejects(sendAudioMessage(conn, '', 'https://media.example/audio.mp3'), /JID is required/)
    assert.equal(calls.length, 0)
})
