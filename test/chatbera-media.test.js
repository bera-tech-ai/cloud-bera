'use strict'
// ChatBera media replies (2026-11-27): with ChatBera on, an image, a
// sticker or a GIF is looked at via Qwen vision and answered in
// persona — a bare image used to get silence (no text, no trigger)
// and a captioned one got an answer to the caption words only.
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { spawnSync } = require('node:child_process')

// Stub the vision module before chatbera-media ever calls it.
const visionPath = require.resolve('../Library/actions/vision')
let visionImpl = async () => ({ success: true, result: 'a cat on a mat' })
let lastVisionBuffer = null
require.cache[visionPath] = {
    id: visionPath, filename: visionPath, loaded: true,
    exports: { analyzeImageFromBuffer: async (buf, q) => { lastVisionBuffer = buf; return visionImpl(buf, q) } }
}

const { mediaKindOf, composeMediaTurnText, describeChatMedia } = require('../Library/actions/chatbera-media')

const connWith = (buffer) => ({ downloadMediaMessage: async () => buffer })

test('mediaKindOf: images, stickers and GIFs only', () => {
    assert.equal(mediaKindOf({ mtype: 'imageMessage', msg: {} }), 'image')
    assert.equal(mediaKindOf({ mtype: 'stickerMessage', msg: {} }), 'sticker')
    assert.equal(mediaKindOf({ mtype: 'videoMessage', msg: { gifPlayback: true } }), 'gif')
    assert.equal(mediaKindOf({ mtype: 'videoMessage', msg: {} }), null)
    assert.equal(mediaKindOf({ mtype: 'viewOnceMessageV2', msg: {} }), null)
    assert.equal(mediaKindOf({ mtype: 'conversation', msg: {} }), null)
    assert.equal(mediaKindOf(null), null)
})

test('composeMediaTurnText: description first, real caption kept', () => {
    assert.equal(
        composeMediaTurnText({ kind: 'sticker', description: 'a laughing cat sticker', caption: '' }),
        '[Sent a sticker — it shows: a laughing cat sticker]')
    assert.equal(
        composeMediaTurnText({ kind: 'image', description: 'a receipt from Naivas', caption: 'paid the rent' }),
        '[Sent an image — what it shows: a receipt from Naivas]\npaid the rent')
    assert.match(composeMediaTurnText({ kind: 'gif', description: 'a man clapping' }), /Sent a GIF — a frame from it shows/)
})

test('describeChatMedia: a plain image goes to vision as-is', async () => {
    visionImpl = async () => ({ success: true, result: 'a cat on a mat' })
    const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3])
    const out = await describeChatMedia(connWith(jpeg), { mtype: 'imageMessage', msg: {}, mimetype: 'image/jpeg', key: {}, message: {} })
    assert.deepEqual(out, { kind: 'image', description: 'a cat on a mat' })
    assert.equal(lastVisionBuffer, jpeg)
})

test('describeChatMedia: a sticker webp is converted to JPEG first', async () => {
    const sharp = require('sharp')
    const webp = await sharp({ create: { width: 16, height: 16, channels: 3, background: { r: 200, g: 0, b: 0 } } }).webp().toBuffer()
    visionImpl = async () => ({ success: true, result: 'a red square sticker' })
    const out = await describeChatMedia(connWith(webp), { mtype: 'stickerMessage', msg: {}, mimetype: 'image/webp', key: {}, message: {} })
    assert.equal(out.kind, 'sticker')
    assert.equal(lastVisionBuffer[0], 0xff)
    assert.equal(lastVisionBuffer[1], 0xd8)
})

test('describeChatMedia: a GIF contributes a real frame', { timeout: 30000 }, async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cb-gif-test-'))
    const mp4Path = path.join(dir, 'clip.mp4')
    const made = spawnSync('ffmpeg', ['-y', '-f', 'lavfi', '-i', 'color=c=red:s=64x64:d=1', '-pix_fmt', 'yuv420p', mp4Path], { stdio: 'ignore' })
    assert.equal(made.status, 0, 'ffmpeg fixture build')
    const mp4 = fs.readFileSync(mp4Path)
    fs.rmSync(dir, { recursive: true, force: true })
    visionImpl = async () => ({ success: true, result: 'a red screen' })
    const out = await describeChatMedia(connWith(mp4), { mtype: 'videoMessage', msg: { gifPlayback: true }, mimetype: 'video/mp4', key: {}, message: {} })
    assert.equal(out.kind, 'gif')
    assert.equal(lastVisionBuffer[0], 0xff)
    assert.equal(lastVisionBuffer[1], 0xd8)
})

test('describeChatMedia: failures and the kill switch stay silent (null)', async () => {
    const jpeg = Buffer.from([0xff, 0xd8, 1])
    const m = { mtype: 'imageMessage', msg: {}, mimetype: 'image/jpeg', key: {}, message: {} }
    visionImpl = async () => ({ success: false, error: 'provider down' })
    assert.equal(await describeChatMedia(connWith(jpeg), m), null)
    process.env.BERA_CHATBERA_VISION = '0'
    try { assert.equal(await describeChatMedia(connWith(jpeg), m), null) } finally { delete process.env.BERA_CHATBERA_VISION }
    // Non-media never even downloads.
    const noDl = { downloadMediaMessage: async () => { throw new Error('must not download') } }
    assert.equal(await describeChatMedia(noDl, { mtype: 'conversation', msg: {} }), null)
})

test('wiring: the Handler looks at media before the ChatBera trigger', () => {
    const handler = fs.readFileSync(path.join(__dirname, '..', 'Handler', 'index.js'), 'utf8')
    assert.match(handler, /describeChatMedia\(conn, m\)/)
    assert.match(handler, /\(text \|\| _cbMedia\)/)
    assert.match(handler, /composeMediaTurnText/)
    // People memory still learns from the person's own words (the
    // caption), never from the vision description.
    assert.match(handler, /learnFromMessage\(\{ jid: sender, altJid: m\.key\?\.remoteJidAlt, text \}\)/)
})
