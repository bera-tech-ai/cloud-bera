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
