'use strict'

// Phase 4 §26 matrix — backup / restore for bera_state + session files
// (spec §20). The restore procedure is: create → serialise → validate →
// restore → compare. A snapshot that fails validation must never apply.

const test = require('node:test')
const assert = require('node:assert/strict')
const { createBackup, backupFileName, validateBackup, restoreBackup, backupSummary } = require('../Library/lib/tenant-backup')

const state = {
    users: { '254711000001@s.whatsapp.net': { limit: 10 } },
    reminders: [{ id: 'r1', msg: 'call mum', fireAt: 1790000000000 }],
    settings: { prefix: '.' }
}

test('backup round-trips state and session files through JSON (the tested restore)', () => {
    const backup = createBackup({
        tenantId: 'bot-841d09ae650aed44',
        state,
        sessionFiles: [
            { name: 'creds.json', data: Buffer.from('{"registered":true}') },
            { name: 'app-state-sync-key-0001', data: 'plain-text-key' }
        ],
        createdAt: '2026-11-24T00:00:00.000Z'
    })
    assert.equal(backup.format, 'bera-state-backup')
    assert.equal(backup.version, 1)

    // The file that would be copied to the target host.
    const restored = restoreBackup(JSON.parse(JSON.stringify(backup)))
    assert.equal(restored.tenantId, 'bot-841d09ae650aed44')
    assert.deepEqual(restored.state, state)
    assert.equal(restored.sessionFiles[0].name, 'creds.json')
    assert.equal(restored.sessionFiles[0].data.toString('utf8'), '{"registered":true}')
    assert.equal(restored.sessionFiles[1].data.toString('utf8'), 'plain-text-key')
})

test('backup file names identify the tenant and are sortable by time', () => {
    const name = backupFileName({ tenantId: 'bot-841d09ae650aed44', createdAt: '2026-11-24T15:00:00.000Z' })
    assert.match(name, /^bera_state-bot-841d09ae650aed44-2026-11-24T15-00-00-000Z\.json$/)
})

test('restore refuses unknown formats, wrong versions, and cross-tenant snapshots', () => {
    const backup = createBackup({ tenantId: 'bot-841d09ae650aed44', state })
    assert.throws(() => restoreBackup({ ...backup, format: 'other' }), /Unknown backup format/)
    assert.throws(() => restoreBackup({ ...backup, version: 99 }), /Unsupported backup version/)
    assert.throws(() => restoreBackup(backup, { tenantId: 'bot-93e95a0a89ae3295' }), /not bot-93e95a0a89ae3295/)
    assert.throws(() => restoreBackup({ ...backup, state: null }), /no state object/)
    assert.throws(() => restoreBackup(null), /not a JSON object/)
    assert.throws(() => createBackup({ tenantId: '', state }), /tenant ID/)
    assert.throws(() => createBackup({ tenantId: 'bot-841d09ae650aed44', state: [1, 2] }), /must be an object/)
})

test('restore refuses session files with bad base64 or path-like names', () => {
    const backup = createBackup({ tenantId: 'bot-841d09ae650aed44', state })
    backup.sessionFiles = [{ name: 'creds.json', base64: '!!!not-base64!!!' }]
    assert.equal(validateBackup(backup).ok, false)
    assert.throws(() => restoreBackup(backup), /not valid base64/)
    assert.throws(
        () => createBackup({ tenantId: 'bot-841d09ae650aed44', state, sessionFiles: [{ name: '../escape.json', data: 'x' }] }),
        /plain file name/
    )
    const summary = backupSummary(createBackup({ tenantId: 'bot-841d09ae650aed44', state }))
    assert.equal(summary.ok, true)
    assert.deepEqual(summary.stateKeys, ['users', 'reminders', 'settings'])
    assert.equal(summary.sessionFileCount, 0)
})
