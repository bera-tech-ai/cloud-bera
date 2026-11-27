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

// ── Liveness probing: the half-open socket (2026-11-27 ~09:32 EAT) ─────────
// The socket never reported 'close', _isOnline stayed true, no messages
// arrived, and the old decision could only say "online → never". The
// watchdog now probes a silent-but-"online" socket and reconnects only
// after consecutive probe failures.

const { watchdogAction, probeSocket, PROBE_AFTER_MS, PROBE_RETRY_MS } = require('../Library/lib/reconnect-watchdog')
const { EventEmitter } = require('node:events')

test('watchdogAction: offline path matches the original decision', () => {
    assert.equal(watchdogAction({ isOnline: false, lastActivityAt: NOW - OFFLINE_THRESHOLD_MS - 1, now: NOW }), 'reconnect')
    assert.equal(watchdogAction({ isOnline: false, lastActivityAt: NOW - 1000, now: NOW }), 'none')
    assert.equal(watchdogAction({ isOnline: false, reconnecting: true, lastActivityAt: NOW - OFFLINE_THRESHOLD_MS * 9, now: NOW }), 'none')
    assert.equal(watchdogAction({ isOnline: false, shuttingDown: true, lastActivityAt: NOW - OFFLINE_THRESHOLD_MS * 9, now: NOW }), 'none')
    assert.equal(watchdogAction({ isOnline: true, lastActivityAt: 0, now: NOW }), 'none')
})

test('watchdogAction: online and recently active → none; silent past the probe window → probe', () => {
    assert.equal(watchdogAction({ isOnline: true, lastActivityAt: NOW - 60000, now: NOW }), 'none')
    assert.equal(watchdogAction({ isOnline: true, lastActivityAt: NOW - PROBE_AFTER_MS, now: NOW }), 'none')
    assert.equal(watchdogAction({ isOnline: true, lastActivityAt: NOW - PROBE_AFTER_MS - 1, now: NOW }), 'probe')
})

test('watchdogAction: probes are spaced, and two failures force the reconnect', () => {
    const stale = NOW - PROBE_AFTER_MS - 5000
    // One failure recorded, retry window not yet passed → wait.
    assert.equal(watchdogAction({ isOnline: true, lastActivityAt: stale, probeFailures: 1, lastProbeAt: NOW - 1000, now: NOW }), 'none')
    // Retry window passed → probe again.
    assert.equal(watchdogAction({ isOnline: true, lastActivityAt: stale, probeFailures: 1, lastProbeAt: NOW - PROBE_RETRY_MS - 1, now: NOW }), 'probe')
    // Two failures → reconnect, no more probing.
    assert.equal(watchdogAction({ isOnline: true, lastActivityAt: stale, probeFailures: 2, lastProbeAt: NOW - PROBE_RETRY_MS - 1, now: NOW }), 'reconnect')
})

test('probeSocket: a pong means alive; silence means dead', async () => {
    const alive = new EventEmitter(); alive.readyState = 1; alive.ping = () => setImmediate(() => alive.emit('pong'))
    assert.equal(await probeSocket({ ws: alive }, { timeoutMs: 200 }), true)
    const dead = new EventEmitter(); dead.readyState = 1; dead.ping = () => {}
    assert.equal(await probeSocket({ ws: dead }, { timeoutMs: 50 }), false)
    const closed = new EventEmitter(); closed.readyState = 3; closed.ping = () => setImmediate(() => closed.emit('pong'))
    assert.equal(await probeSocket({ ws: closed }, { timeoutMs: 50 }), false)
})

test('probeSocket: query fallback, and never reconnect blind', async () => {
    assert.equal(await probeSocket({ query: async () => ({}) }, { timeoutMs: 200 }), true)
    assert.equal(await probeSocket({ query: async () => { throw new Error('gone') } }, { timeoutMs: 200 }), false)
    assert.equal(await probeSocket(null), true)
    assert.equal(await probeSocket({}), true)
})

test('start.js wiring: watchdog probes, and message traffic stamps activity', () => {
    const src = fs.readFileSync(path.join(__dirname, '..', 'Connection', 'start.js'), 'utf8')
    assert.match(src, /watchdogAction\(/)
    assert.match(src, /probeSocket\(_activeConn\)/)
    assert.match(src, /\[WATCHDOG\] Liveness probe failed/)
    const upsert = src.slice(src.indexOf("conn.ev.on('messages.upsert'"))
    assert.match(upsert.slice(0, 400), /_lastConnActivityAt = Date\.now\(\)/)
})
