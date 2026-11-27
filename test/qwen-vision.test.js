// Qwen vision (2026-11-27): Bera AI's image analysis used to be honestly
// UNAVAILABLE — the old /api/ai/vision endpoint's own auth is broken
// (HTTP 500). Casper's Qwen endpoint (POST /api/ai/qwen, body
// {imageBase64, query} → data.reply, model qwen/qwen3.8-27b) was verified
// live twice (2026-11-26, 2026-11-27) and is now the primary path in
// Library/actions/vision.js, with BERA_VISION_QWEN=0 as kill switch and
// the honest unavailable message (pointing at .ocr) when Qwen fails.
// The xcasper client is stubbed via the require cache: no network here.
const test = require('node:test')
const assert = require('node:assert/strict')

const xcasperPath = require.resolve('../Library/actions/xcasper')
const calls = []
let nextResponse = null
let nextError = null
require.cache[xcasperPath] = {
    id: xcasperPath,
    filename: xcasperPath,
    loaded: true,
    exports: {
        requestPost: async (path, body, timeout) => {
            calls.push({ path, body, timeout })
            if (nextError) throw nextError
            return nextResponse
        },
        vision: async () => ({ success: false, error: 'legacy dead' }),
        textFrom: () => ''
    }
}

const { analyzeImageFromBuffer, analyzeImageFromUrl, visionStatus, VISION_UNAVAILABLE_MESSAGE } = require('../Library/actions/vision')

const reset = () => {
    calls.length = 0
    nextResponse = { success: true, code: 200, data: { model: 'qwen/qwen3.8-27b', reply: 'A red car parked by a gate.' } }
    nextError = null
    delete process.env.BERA_VISION_QWEN
    delete process.env.BERA_VISION_FORCE_ENABLE
}
reset()

test('buffer analysis goes to Qwen with the verified request shape', async () => {
    reset()
    const res = await analyzeImageFromBuffer(Buffer.from('fake-jpeg-bytes'), 'What is in this image?')
    assert.equal(res.success, true)
    assert.equal(res.result, 'A red car parked by a gate.')
    assert.equal(res.provider, 'qwen')
    assert.equal(calls.length, 1)
    assert.equal(calls[0].path, '/api/ai/qwen')
    assert.match(calls[0].body.imageBase64, /^data:image\/jpeg;base64,/)
    assert.equal(calls[0].body.query, 'What is in this image?')
})

test('visionStatus reports Qwen as the available provider', () => {
    reset()
    const status = visionStatus()
    assert.equal(status.available, true)
    assert.match(status.provider, /qwen/i)
    assert.equal(status.checkedAt, '2026-11-27')
})

test('Qwen provider failure → honest unavailable error naming the .ocr alternative, never a fake description', async () => {
    reset()
    nextResponse = { success: false, code: 500, error: 'boom' }
    const res = await analyzeImageFromBuffer(Buffer.from('fake'))
    assert.equal(res.success, false)
    assert.equal(res.error, VISION_UNAVAILABLE_MESSAGE)
    assert.match(res.error, /\.ocr/)
})

test('Qwen network throw → honest unavailable error', async () => {
    reset()
    nextError = new Error('socket hang up')
    const res = await analyzeImageFromBuffer(Buffer.from('fake'))
    assert.equal(res.success, false)
    assert.equal(res.error, VISION_UNAVAILABLE_MESSAGE)
})

test('kill switch BERA_VISION_QWEN=0 → no provider call, previous unavailable behaviour', async () => {
    reset()
    process.env.BERA_VISION_QWEN = '0'
    try {
        assert.equal(visionStatus().available, false)
        const res = await analyzeImageFromBuffer(Buffer.from('fake'))
        assert.equal(res.success, false)
        assert.equal(res.error, VISION_UNAVAILABLE_MESSAGE)
        const resUrl = await analyzeImageFromUrl('https://example.com/x.jpg')
        assert.equal(resUrl.success, false)
        assert.equal(calls.length, 0)
    } finally {
        delete process.env.BERA_VISION_QWEN
    }
})

test('guards: no buffer and oversize buffer are rejected before any call', async () => {
    reset()
    assert.equal((await analyzeImageFromBuffer(null)).error, 'No image supplied.')
    const big = Buffer.alloc(8 * 1024 * 1024 + 1)
    const res = await analyzeImageFromBuffer(big)
    assert.equal(res.success, false)
    assert.match(res.error, /too large/i)
    assert.equal(calls.length, 0)
})
