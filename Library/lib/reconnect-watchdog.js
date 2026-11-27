'use strict'

// ── Reconnect watchdog decision ─────────────────────────────────────────────
// Connection/start.js schedules a reconnect when the WhatsApp socket
// closes, but the retry chain used to end after at most two failed
// startBot() attempts: on 2026-11-27 a disconnect (428) coincided with a
// brief DNS/database outage, initDb() threw on both attempts, the final
// failure was swallowed — and the bot stayed offline, process alive,
// until a human restarted the service ~4 minutes later.
//
// The watchdog in start.js polls this pure decision every 30s: if the
// socket has produced no connection activity for OFFLINE_THRESHOLD_MS
// and no reconnect is already in flight, force one. Extracted as a pure
// function so the decision is unit-testable without starting the bot.

const OFFLINE_THRESHOLD_MS = 120000

const shouldReconnect = ({
    isOnline = false,
    reconnecting = false,
    shuttingDown = false,
    lastActivityAt = 0,
    now = Date.now(),
    thresholdMs = OFFLINE_THRESHOLD_MS
} = {}) => {
    if (shuttingDown) return false
    if (isOnline) return false
    if (reconnecting) return false
    if (!Number.isFinite(lastActivityAt) || lastActivityAt <= 0) return false
    return now - lastActivityAt > thresholdMs
}

// ── Liveness probing (2026-11-27) ───────────────────────────────────────────
// shouldReconnect above is blind to the failure that actually bit on
// 2026-11-27 ~09:32 EAT: a HALF-OPEN socket. The connection never
// reported 'close', so _isOnline stayed true and the watchdog's answer
// was "online → never reconnect" at every poll, while WhatsApp had
// stopped delivering messages entirely; only a manual restart helped.
// The watchdog had never fired once (zero [WATCHDOG] lines in the log).
//
// watchdogAction extends the decision with a probe path. While the
// socket claims to be online, silence alone proves nothing — a quiet
// bot at 3am is healthy — so after PROBE_AFTER_MS without ANY socket
// activity (connection events OR inbound messages, both stamp the
// activity clock in start.js) the watchdog must actively PROBE the
// socket, and only force a reconnect after
// PROBE_FAILURES_TO_RECONNECT consecutive failed probes. A successful
// probe counts as activity, so a healthy-but-quiet bot gets one ping
// per PROBE_AFTER_MS of silence and nothing more.

const PROBE_AFTER_MS = 180000
const PROBE_RETRY_MS = 30000
const PROBE_FAILURES_TO_RECONNECT = 2

const watchdogAction = ({
    isOnline = false,
    reconnecting = false,
    shuttingDown = false,
    lastActivityAt = 0,
    probeFailures = 0,
    lastProbeAt = 0,
    now = Date.now(),
    offlineThresholdMs = OFFLINE_THRESHOLD_MS,
    probeAfterMs = PROBE_AFTER_MS,
    probeRetryMs = PROBE_RETRY_MS,
    probeFailuresToReconnect = PROBE_FAILURES_TO_RECONNECT
} = {}) => {
    if (shuttingDown || reconnecting) return 'none'
    if (!Number.isFinite(lastActivityAt) || lastActivityAt <= 0) return 'none'
    const staleMs = now - lastActivityAt
    if (!isOnline) return staleMs > offlineThresholdMs ? 'reconnect' : 'none'
    if (staleMs <= probeAfterMs) return 'none'
    if (probeFailures >= probeFailuresToReconnect) return 'reconnect'
    if (lastProbeAt && now - lastProbeAt < probeRetryMs) return 'none'
    return 'probe'
}

// Actively check whether a socket that claims to be online still
// answers: a WebSocket ping that must be ponged within timeoutMs
// (any pong counts — the peer answering at all is the signal), with
// a Baileys ping iq as fallback. A socket whose ws is not OPEN is
// dead by definition. When nothing can be probed, assume alive —
// the watchdog must never reconnect blind.
const probeSocket = (sock, { timeoutMs = 10000 } = {}) => new Promise((resolve) => {
    try {
        const ws = sock?.ws
        if (ws && typeof ws.ping === 'function') {
            if (ws.readyState !== 1) return resolve(false)
            let settled = false
            const done = (alive) => { if (!settled) { settled = true; clearTimeout(timer); try { ws.off?.('pong', onPong) } catch {} resolve(alive) } }
            const onPong = () => done(true)
            const timer = setTimeout(() => done(false), timeoutMs)
            timer.unref?.()
            ws.once('pong', onPong)
            ws.ping()
            return
        }
        if (typeof sock?.query === 'function') {
            const timeout = new Promise((_, reject) => {
                const t = setTimeout(() => reject(new Error('probe timeout')), timeoutMs)
                t.unref?.()
            })
            Promise.race([
                sock.query({ tag: 'iq', attrs: { id: `wdprobe.${Date.now()}`, to: 's.whatsapp.net', type: 'get', xmlns: 'w:p' }, content: [] }),
                timeout
            ]).then(() => resolve(true), () => resolve(false))
            return
        }
        resolve(true)
    } catch { resolve(false) }
})

module.exports = { shouldReconnect, watchdogAction, probeSocket, OFFLINE_THRESHOLD_MS, PROBE_AFTER_MS, PROBE_RETRY_MS, PROBE_FAILURES_TO_RECONNECT }
