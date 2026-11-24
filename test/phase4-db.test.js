'use strict'

// Phase 4 §26 matrix — explicit Postgres schema (spec §20, Neon finding) and
// the failed-write alarm (spec §20: no silent discard).

const test = require('node:test')
const assert = require('node:assert/strict')
const { DEFAULT_SCHEMA, resolveDbSchema, qualified, quoteIdent, searchPathOption } = require('../Library/lib/db-schema')
const { recordWriteSuccess, recordWriteFailure, getWriteHealth, alarmMessage, resetWriteHealth } = require('../Library/lib/db-health')

test('schema defaults to berahost — where the tenant rows live — not public', () => {
    assert.equal(DEFAULT_SCHEMA, 'berahost')
    assert.equal(resolveDbSchema({}), 'berahost')
    assert.equal(resolveDbSchema({ BERA_DB_SCHEMA: '' }), 'berahost')
    assert.equal(resolveDbSchema({ BERA_DB_SCHEMA: 'public' }), 'public')
    assert.throws(() => resolveDbSchema({ BERA_DB_SCHEMA: 'berahost; DROP TABLE x' }), /valid PostgreSQL schema name/)
    assert.throws(() => resolveDbSchema({ BERA_DB_SCHEMA: '1bad' }), /valid PostgreSQL schema name/)
})

test('table names are schema-qualified and identifiers are quoted', () => {
    assert.equal(qualified('berahost', 'bera_state'), '"berahost"."bera_state"')
    assert.equal(qualified('public', 'bera_session_leases'), '"public"."bera_session_leases"')
    assert.equal(quoteIdent('we"ird'), '"we""ird"')
    assert.equal(searchPathOption('berahost'), '-c search_path="berahost"')
})

test('write health starts healthy, records failures, and recovers on success', () => {
    resetWriteHealth()
    assert.deepEqual(getWriteHealth(), {
        ok: true, consecutiveFailures: 0, totalFailures: 0,
        lastError: null, lastErrorAt: null, lastSuccessAt: null
    })
    assert.match(alarmMessage(), /no failures recorded/)

    const afterFirst = recordWriteFailure(new Error('connection terminated'))
    assert.equal(afterFirst.ok, false)
    assert.equal(afterFirst.consecutiveFailures, 1)
    assert.equal(afterFirst.totalFailures, 1)
    assert.equal(afterFirst.lastError, 'connection terminated')
    assert.ok(afterFirst.lastErrorAt)

    recordWriteFailure('plain string failure')
    assert.equal(getWriteHealth().consecutiveFailures, 2)
    assert.equal(getWriteHealth().totalFailures, 2)
    assert.match(alarmMessage(), /DATABASE WRITE ALARM: 2 consecutive failed write\(s\)/)
    assert.match(alarmMessage(), /connection terminated|plain string failure/)
    assert.match(alarmMessage(), /must not silently discard|newer in the local JSON cache/i)

    recordWriteSuccess()
    assert.equal(getWriteHealth().ok, true)
    assert.equal(getWriteHealth().consecutiveFailures, 0)
    assert.equal(getWriteHealth().totalFailures, 2, 'history is kept after recovery')
    assert.ok(getWriteHealth().lastSuccessAt)
    assert.match(alarmMessage(), /recovered: 2 past failure/)
    resetWriteHealth()
})
