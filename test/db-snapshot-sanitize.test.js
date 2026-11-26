'use strict'
const { test } = require('node:test')
const assert = require('node:assert/strict')
const { sanitizeSnapshotJson } = require('../Database')

test('strips NUL escapes that PostgreSQL jsonb rejects', () => {
    const dirty = JSON.stringify({ a: 'x' + String.fromCharCode(0) + 'y' })
    const clean = sanitizeSnapshotJson(dirty)
    assert.ok(!clean.includes('\\u0000'))
    assert.equal(JSON.parse(clean).a, 'x\ufffdy')
})

test('replaces lone surrogate escapes but keeps valid pairs', () => {
    const dirty = JSON.stringify({ lone: 'a\ud83db', pair: 'a\ud83d\ude00b' })
    const parsed = JSON.parse(sanitizeSnapshotJson(dirty))
    assert.equal(parsed.lone, 'a\ufffdb')
    assert.equal(parsed.pair, 'a\ud83d\ude00b')
})

test('leaves ordinary snapshots untouched', () => {
    const clean = JSON.stringify({ name: 'Bera', n: 42, nested: { ok: true } })
    assert.equal(sanitizeSnapshotJson(clean), clean)
})
