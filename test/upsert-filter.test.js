// messages.upsert 'append' filter (2026-11-27): the owner's own phone
// messages — self-chat ("Message yourself"), voice notes included — reach
// this linked-device bot as upsert type 'append', and start.js used to
// drop every non-'notify' batch before the Handler. The owner's ~6
// self-chat voice notes in one evening were never transcribed (zero
// [VOICE LISTEN] lines, ever). The pure decision lives in
// Library/lib/upsert-filter.js; start.js applies it per message so
// 'notify' behaviour is untouched and history-sync replays stay dropped.
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const { shouldProcessUpsertMessage, isFreshAppendMessage, APPEND_FRESH_MS } = require('../Library/lib/upsert-filter')

const NOW = 1_700_000_000_000 // ms
const NOW_S = NOW / 1000     // messageTimestamp is in seconds

// A voice-note-shaped message as Baileys delivers it in an upsert batch.
const voiceNoteMsg = (overrides = {}) => ({
    key: { id: 'VN1', remoteJid: '254116763755@s.whatsapp.net', fromMe: true },
    message: { audioMessage: { ptt: true, mimetype: 'audio/ogg; codecs=opus', seconds: 4 } },
    messageTimestamp: NOW_S - 5,
    ...overrides
})

// Runs a batch through the same per-message gate the start.js handler
// uses and returns the messages a (stubbed) handleMessage would receive.
const deliveredToHandler = (type, messages, now = NOW) =>
    messages.filter(msg => shouldProcessUpsertMessage(type, msg, now))

test("(a) 'append': a fresh fromMe voice note reaches the Handler", () => {
    const msg = voiceNoteMsg()
    assert.equal(shouldProcessUpsertMessage('append', msg, NOW), true)
    assert.deepEqual(deliveredToHandler('append', [msg]), [msg])
})

test("(b) 'append': a stale fromMe message is dropped (history-sync replay)", () => {
    const stale = voiceNoteMsg({ messageTimestamp: NOW_S - 3600 })
    assert.equal(shouldProcessUpsertMessage('append', stale, NOW), false)
    assert.deepEqual(deliveredToHandler('append', [stale]), [])
    // Just past the freshness window is already too old.
    const borderline = voiceNoteMsg({ messageTimestamp: NOW_S - APPEND_FRESH_MS / 1000 - 1 })
    assert.equal(shouldProcessUpsertMessage('append', borderline, NOW), false)
})

test("(c) 'append': a fresh non-fromMe message is dropped", () => {
    const theirs = voiceNoteMsg({ key: { id: 'VN2', remoteJid: '254700000000@s.whatsapp.net', fromMe: false } })
    assert.equal(shouldProcessUpsertMessage('append', theirs, NOW), false)
    assert.deepEqual(deliveredToHandler('append', [theirs]), [])
})

test("(d) 'notify': behaviour unchanged — every message is processed", () => {
    const fresh = voiceNoteMsg()
    const stale = voiceNoteMsg({ messageTimestamp: NOW_S - 86400 })
    const theirs = voiceNoteMsg({ key: { id: 'VN3', remoteJid: '254700000000@s.whatsapp.net', fromMe: false } })
    const noTimestamp = voiceNoteMsg({ messageTimestamp: undefined })
    for (const msg of [fresh, stale, theirs, noTimestamp]) {
        assert.equal(shouldProcessUpsertMessage('notify', msg, NOW), true)
    }
    assert.deepEqual(deliveredToHandler('notify', [fresh, stale, theirs, noTimestamp]), [fresh, stale, theirs, noTimestamp])
})

test("'append': a mixed batch delivers only the fresh fromMe messages", () => {
    const freshMine = voiceNoteMsg()
    const staleMine = voiceNoteMsg({ key: { id: 'OLD', remoteJid: '254116763755@s.whatsapp.net', fromMe: true }, messageTimestamp: NOW_S - 7200 })
    const freshTheirs = voiceNoteMsg({ key: { id: 'THEIRS', remoteJid: '254700000000@s.whatsapp.net', fromMe: false } })
    assert.deepEqual(deliveredToHandler('append', [freshMine, staleMine, freshTheirs]), [freshMine])
})

test("'append': missing or junk timestamps fail closed", () => {
    for (const bad of [undefined, null, NaN, 'not-a-number', '', {}, []]) {
        const msg = voiceNoteMsg({ messageTimestamp: bad })
        assert.equal(shouldProcessUpsertMessage('append', msg, NOW), false, `timestamp ${String(bad)} must not be fresh`)
        assert.equal(isFreshAppendMessage(msg, NOW), false)
    }
    assert.equal(shouldProcessUpsertMessage('append', null, NOW), false)
    assert.equal(shouldProcessUpsertMessage('append', {}, NOW), false)
    assert.equal(shouldProcessUpsertMessage('append', { key: {} }, NOW), false)
})

test("'append': freshness window boundary and timestamp shapes", () => {
    // Exactly at the window edge still counts as fresh.
    assert.equal(isFreshAppendMessage(voiceNoteMsg({ messageTimestamp: NOW_S - APPEND_FRESH_MS / 1000 }), NOW), true)
    // Numeric strings and protobuf Longs are accepted shapes.
    assert.equal(isFreshAppendMessage(voiceNoteMsg({ messageTimestamp: String(NOW_S - 5) }), NOW), true)
    assert.equal(isFreshAppendMessage(voiceNoteMsg({ messageTimestamp: { toNumber: () => NOW_S - 5 } }), NOW), true)
    // Slight clock skew into the future is fresh, not an error.
    assert.equal(isFreshAppendMessage(voiceNoteMsg({ messageTimestamp: NOW_S + 30 }), NOW), true)
})

test("other upsert types are never processed", () => {
    const msg = voiceNoteMsg()
    for (const type of ['prepend', 'history', undefined, null, '']) {
        assert.equal(shouldProcessUpsertMessage(type, msg, NOW), false, `type ${String(type)}`)
    }
})

test('start.js wiring: the upsert handler gates on the filter, notify path intact', () => {
    const src = fs.readFileSync(path.join(__dirname, '..', 'Connection', 'start.js'), 'utf8')
    assert.match(src, /require\('\.\.\/Library\/lib\/upsert-filter'\)/)
    // The old blanket drop is gone…
    assert.doesNotMatch(src, /if \(type !== 'notify'\) return/)
    // …replaced by an append-aware gate plus the per-message predicate.
    assert.match(src, /if \(type !== 'notify' && type !== 'append'\) return/)
    const handler = src.slice(src.indexOf("conn.ev.on('messages.upsert'"))
    assert.match(handler.slice(0, 1200), /shouldProcessUpsertMessage\(type, msg\)/)
    assert.match(handler, /await handleMessage\(conn, msg\)/)
})
