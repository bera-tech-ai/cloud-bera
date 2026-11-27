// Reconnect watchdog (2026-11-27): on 2026-11-27 a 428 disconnect hit
// during a brief DNS/database outage; startBot() threw in initDb() on
// both scheduled attempts, the final failure was swallowed, and the bot
// stayed offline (process alive) until a manual service restart.
// The watchdog decision is pure (Library/lib/reconnect-watchdog.js);
// Connection/start.js polls it every 30s and forces a reconnect when
// the socket has been inactive too long. The retry chain in
// scheduleReconnect must also never terminate silently again.
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const { shouldReconnect, OFFLINE_THRESHOLD_MS } = require('../Library/lib/reconnect-watchdog')

const NOW = 1_000_000_000

test('offline and inactive past the threshold → reconnect', () => {
    assert.equal(shouldReconnect({ isOnline: false, lastActivityAt: NOW - OFFLINE_THRESHOLD_MS - 1, now: NOW }), true)
})

test('online → never reconnect', () => {
    assert.equal(shouldReconnect({ isOnline: true, lastActivityAt: NOW - OFFLINE_THRESHOLD_MS * 10, now: NOW }), false)
})

test('a reconnect already in flight → do not force another', () => {
    assert.equal(shouldReconnect({ isOnline: false, reconnecting: true, lastActivityAt: NOW - OFFLINE_THRESHOLD_MS * 10, now: NOW }), false)
})

test('shutting down → never reconnect', () => {
    assert.equal(shouldReconnect({ isOnline: false, shuttingDown: true, lastActivityAt: NOW - OFFLINE_THRESHOLD_MS * 10, now: NOW }), false)
})

test('recently active (slow connect still within grace) → no reconnect yet', () => {
    assert.equal(shouldReconnect({ isOnline: false, lastActivityAt: NOW - 30000, now: NOW }), false)
    assert.equal(shouldReconnect({ isOnline: false, lastActivityAt: NOW - OFFLINE_THRESHOLD_MS, now: NOW }), false)
})

test('no activity ever recorded → no reconnect (boot path owns startup)', () => {
    assert.equal(shouldReconnect({ isOnline: false, lastActivityAt: 0, now: NOW }), false)
})

test('start.js wiring: watchdog is loaded, started and stamps connection activity', () => {
    const src = fs.readFileSync(path.join(__dirname, '..', 'Connection', 'start.js'), 'utf8')
    assert.match(src, /reconnect-watchdog/)
    assert.match(src, /ensureConnectionWatchdog\(\)/)
    assert.match(src, /_lastConnActivityAt = Date\.now\(\)/)
    assert.match(src, /_isOnline = true/)
    assert.match(src, /_isOnline = false/)
})

test('start.js wiring: the retry chain cannot die silently anymore', () => {
    const src = fs.readFileSync(path.join(__dirname, '..', 'Connection', 'start.js'), 'utf8')
    // The old dead end: one 10s retry whose failure was swallowed whole.
    assert.doesNotMatch(src, /startBot\(\)\.catch\(\(\) => \{\}\)/)
    // A failed startBot must schedule another reconnect.
    assert.match(src, /console\.error\('\[FATAL\]', e\.message\)\s*\n\s*\/\/ Never let the retry chain die/)
    assert.match(src, /scheduleReconnect\(15000\)/)
})
