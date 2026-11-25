'use strict'

// Phase 4 — failed-write alarm (spec §20).
//
// "A failed database write must not silently discard important state."
// Before this module, Database/index.js swallowed PostgreSQL write failures
// with a single console.error inside a promise chain: the write promise
// still resolved, the caller could not tell the write had failed, and the
// local JSON cache kept diverging from the database with no record of it.
// The Neon inspection found 323 bot-log lines mentioning postgres / [DB] /
// write-failed (81 in the last 24 h), so this is a live failure mode, not a
// hypothetical one.
//
// This module is the single place that records write outcomes. Database
// persistence calls recordWriteSuccess() / recordWriteFailure(error); any
// status or monitoring code reads getWriteHealth(). Nothing here throws.

let consecutiveFailures = 0
let totalFailures = 0
let lastError = null
let lastErrorAt = null
let lastSuccessAt = null

const recordWriteSuccess = () => {
    consecutiveFailures = 0
    lastSuccessAt = new Date().toISOString()
    return getWriteHealth()
}

const recordWriteFailure = error => {
    consecutiveFailures += 1
    totalFailures += 1
    lastError = String(error?.message || error || 'unknown error').slice(0, 500)
    lastErrorAt = new Date().toISOString()
    return getWriteHealth()
}

const getWriteHealth = () => ({
    ok: consecutiveFailures === 0,
    consecutiveFailures,
    totalFailures,
    lastError,
    lastErrorAt,
    lastSuccessAt
})

// Human-readable one-liner for logs and the .tenant health command. Never
// includes credentials or state contents — only counts and the error text.
const alarmMessage = (health = getWriteHealth()) => {
    if (health.ok) {
        return totalFailures === 0
            ? 'Database writes healthy: no failures recorded.'
            : `Database writes recovered: ${health.totalFailures} past failure(s), last at ${health.lastErrorAt}.`
    }
    return `DATABASE WRITE ALARM: ${health.consecutiveFailures} consecutive failed write(s)` +
        ` (${health.totalFailures} total). Last failure at ${health.lastErrorAt}: ${health.lastError || 'unknown error'}. ` +
        'State may be newer in the local JSON cache than in PostgreSQL — do not restart until writes recover.'
}

const resetWriteHealth = () => {
    consecutiveFailures = 0
    totalFailures = 0
    lastError = null
    lastErrorAt = null
    lastSuccessAt = null
}

module.exports = { recordWriteSuccess, recordWriteFailure, getWriteHealth, alarmMessage, resetWriteHealth }
