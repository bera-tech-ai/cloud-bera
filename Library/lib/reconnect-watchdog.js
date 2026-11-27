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

module.exports = { shouldReconnect, OFFLINE_THRESHOLD_MS }
