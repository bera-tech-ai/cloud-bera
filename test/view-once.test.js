'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const { parseViewOnceReveal } = require('../Library/actions/command-intent')
const { isViewOnceMessage, findMedia } = require('../Library/lib/baileys-media')

test('parses natural view-once reveal asks', () => {
    assert.equal(parseViewOnceReveal('Agent, open this view once'), true)
    assert.equal(parseViewOnceReveal('reveal the view-once photo'), true)
    assert.equal(parseViewOnceReveal('agent vv'), true)
    assert.equal(parseViewOnceReveal('.vv'), true)
    assert.equal(parseViewOnceReveal('show me this viewonce'), true)
})

test('does not misfire on unrelated messages', () => {
    assert.equal(parseViewOnceReveal('what is a view once message'), false)
    assert.equal(parseViewOnceReveal('antiviewonce on'), false)
    assert.equal(parseViewOnceReveal('send a voice note'), false)
})

test('detects view-once wrappers and media viewOnce flags', () => {
    assert.equal(isViewOnceMessage({ viewOnceMessage: { message: { imageMessage: {} } } }), true)
    assert.equal(isViewOnceMessage({ viewOnceMessageV2: { message: { videoMessage: {} } } }), true)
    assert.equal(isViewOnceMessage({ ephemeralMessage: { message: { viewOnceMessage: { message: { imageMessage: {} } } } } }), true)
    assert.equal(isViewOnceMessage({ imageMessage: { viewOnce: true } }), true)
    assert.equal(isViewOnceMessage({ imageMessage: {} }), false)
    assert.equal(isViewOnceMessage({ conversation: 'hi' }), false)
})

test('findMedia unwraps a view-once image', () => {
    const media = findMedia({ viewOnceMessageV2: { message: { imageMessage: { mimetype: 'image/jpeg' } } } })
    assert.equal(media.kind, 'image')
})

test('the view-once fork loader resolves safely (null or the fork API)', async () => {
    const { loadViewOnceFork } = require('../Library/lib/baileys-media')
    const fork = await loadViewOnceFork()
    assert.ok(fork === null || typeof fork.downloadViewOnceMessage === 'function')
})

test('the raw-message store survives a reload (restart persistence)', () => {
    const fs = require('node:fs')
    const os = require('node:os')
    const path = require('node:path')
    const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'vo-store-')), 'store.json')
    process.env.BERA_VIEWONCE_STORE_FILE = file
    const storePath = require.resolve('../Library/lib/view-once-store')
    delete require.cache[storePath]
    const first = require(storePath)
    const raw = { key: { remoteJid: '123@s.whatsapp.net', id: 'ABC' }, message: { viewOnceMessage: { message: { imageMessage: { mediaKey: 'k' } } } } }
    first.remember(raw)
    first._flush()
    delete require.cache[storePath]
    const second = require(storePath)
    assert.deepEqual(second.get('123@s.whatsapp.net', 'ABC'), raw)
    delete process.env.BERA_VIEWONCE_STORE_FILE
    delete require.cache[storePath]
})

test('downloadViewOnceFirst fails honestly when the media cannot be served', async () => {
    const { downloadViewOnceFirst, findMedia } = require('../Library/lib/baileys-media')
    const raw = {
        key: { remoteJid: '123@s.whatsapp.net', id: 'VO1' },
        message: { viewOnceMessageV2: { message: { imageMessage: { mediaKey: 'aGVsbG8td29ybGQtdGVzdA==' } } } },
    }
    const media = findMedia(raw.message)
    assert.equal(media.kind, 'image')
    const sock = { updateMediaMessage: async () => { throw new Error('sender device did not respond') } }
    await assert.rejects(() => downloadViewOnceFirst(raw, media, sock))
    await assert.rejects(() => downloadViewOnceFirst(raw, null, sock), /No original raw message/)
})

test('extractViewOnceText reveals a media-less view-once card', () => {
    const { extractViewOnceText } = require('../Library/lib/baileys-media')
    const card = { viewOnceMessage: { message: { interactiveMessage: {
        header: { title: 'Toxic-MD', subtitle: 'Q', hasMediaAttachment: false },
        body: { text: 'the hidden body text' },
        footer: { text: 'a footer' },
    } } } }
    const text = extractViewOnceText(card)
    assert.match(text, /Toxic-MD/)
    assert.match(text, /hidden body text/)
    const mediaVo = { viewOnceMessageV2: { message: { imageMessage: { mimetype: 'image/jpeg' } } } }
    assert.equal(extractViewOnceText(mediaVo), null)
})

test('the arrival media cache round-trips bytes and metadata', () => {
    const fs = require('node:fs')
    const os = require('node:os')
    const path = require('node:path')
    process.env.BERA_VIEWONCE_MEDIA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'vo-media-'))
    const cachePath = require.resolve('../Library/lib/view-once-cache')
    delete require.cache[cachePath]
    const cache = require(cachePath)
    const buf = Buffer.from('fake-jpeg-bytes')
    assert.equal(cache.put('123@g.us', 'MSG1', buf, { kind: 'image', field: 'image', mimetype: 'image/jpeg' }), true)
    const hit = cache.get('123@g.us', 'MSG1')
    assert.deepEqual(hit.buffer, buf)
    assert.equal(hit.meta.kind, 'image')
    assert.equal(cache.get('123@g.us', 'NOPE'), null)
    delete process.env.BERA_VIEWONCE_MEDIA_DIR
    delete require.cache[cachePath]
})
