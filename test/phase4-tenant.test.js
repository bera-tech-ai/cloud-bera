'use strict'

// Phase 4 §26 matrix — tenant scale (spec §20): auto-generated tenant IDs,
// per-number session IDs, derived storage paths, provisioning.

const test = require('node:test')
const assert = require('node:assert/strict')
const {
    generateTenantId,
    isValidTenantId,
    sessionIdFor,
    sessionIdForTenant,
    storagePathsFor,
    resolveTenantId,
    provisionTenant,
    listTenants
} = require('../Library/lib/tenant')

test('tenant IDs are auto-generated in the production shape bot-<16 hex>', () => {
    const ids = new Set(Array.from({ length: 20 }, () => generateTenantId()))
    assert.equal(ids.size, 20, 'generated tenant IDs must be unique')
    for (const id of ids) assert.ok(isValidTenantId(id), `${id} must match bot-<16 hex>`)
    assert.equal(isValidTenantId('default'), false)
    assert.equal(isValidTenantId('bot-XYZ'), false)
})

test('session IDs are deterministic per tenant + number and never shared across numbers', () => {
    const tenant = 'bot-841d09ae650aed44'
    const a = sessionIdFor({ tenantId: tenant, phone: '+254711000001' })
    const b = sessionIdFor({ tenantId: tenant, phone: '+254711000001' })
    const c = sessionIdFor({ tenantId: tenant, phone: '+254722000002' })
    const d = sessionIdFor({ tenantId: 'bot-93e95a0a89ae3295', phone: '+254711000001' })
    assert.equal(a, b, 'same tenant + number derives the same session ID')
    assert.notEqual(a, c, 'different numbers must never share a session ID')
    assert.notEqual(a, d, 'same number under a different tenant must not share a session ID')
    assert.ok(!a.includes('254711000001'), 'session ID must not embed the phone number')
    assert.throws(() => sessionIdFor({ tenantId: tenant, phone: '123' }), /7–15 digits/)
    assert.throws(() => sessionIdFor({ phone: '+254711000001' }), /tenant ID/)
})

test('storage paths are derived from the tenant ID, never hand-configured', () => {
    const paths = storagePathsFor('bot-841d09ae650aed44')
    assert.equal(paths.sessionDir, 'sessions/bot-841d09ae650aed44')
    assert.equal(paths.backupDir, 'backups/bot-841d09ae650aed44')
    assert.match(paths.dbFile, /bot-841d09ae650aed44\.db\.json$/)
    assert.notEqual(storagePathsFor('bot-aaaaaaaaaaaaaaaa').sessionDir, paths.sessionDir)
    assert.throws(() => storagePathsFor(''), /tenant ID/)
})

test('tenant resolution: explicit env wins, then auth session, then marker, then generate-once', () => {
    assert.deepEqual(
        resolveTenantId({ env: { BERA_TENANT_ID: 'bot-aaaaaaaaaaaaaaaa', BERA_AUTH_SESSION_ID: 'bot-bbbbbbbbbbbbbbbb' } }),
        { tenantId: 'bot-aaaaaaaaaaaaaaaa', source: 'env:BERA_TENANT_ID', generated: false }
    )
    assert.deepEqual(
        resolveTenantId({ env: { BERA_AUTH_SESSION_ID: 'wa-legacy-session' } }),
        { tenantId: 'wa-legacy-session', source: 'env:BERA_AUTH_SESSION_ID', generated: false }
    )
    assert.deepEqual(
        resolveTenantId({ env: {}, readMarker: () => 'bot-cccccccccccccccc' }),
        { tenantId: 'bot-cccccccccccccccc', source: 'marker', generated: false }
    )
    let written = null
    const first = resolveTenantId({ env: {}, readMarker: () => '', writeMarker: value => { written = value } })
    assert.equal(first.source, 'generated')
    assert.equal(first.generated, true)
    assert.ok(isValidTenantId(first.tenantId))
    assert.equal(written, first.tenantId, 'a generated ID must be persisted so restarts reuse it')
    // A second start with the marker present reuses the same tenant.
    assert.deepEqual(
        resolveTenantId({ env: {}, readMarker: () => written }),
        { tenantId: written, source: 'marker', generated: false }
    )
})

test('provisioning auto-generates IDs/paths, records the tenant, and refuses duplicates', () => {
    const store = {
        records: {},
        save(record) { this.records[record.tenantId] = record },
        get(id) { return this.records[id] || null },
        list() { return Object.values(this.records) }
    }
    const record = provisionTenant({ phone: '+254711000001', owner: '+254700000000', store })
    assert.ok(isValidTenantId(record.tenantId))
    assert.equal(record.sessionId, sessionIdFor({ tenantId: record.tenantId, phone: '254711000001' }))
    assert.equal(record.phone, '254711000001')
    assert.equal(record.storagePaths.sessionDir, `sessions/${record.tenantId}`)
    assert.ok(record.createdAt)

    assert.throws(
        () => provisionTenant({ tenantId: record.tenantId, store }),
        /already exists/
    )
    assert.throws(() => provisionTenant({ tenantId: 'not-a-tenant', store }), /bot-<16/)
    assert.throws(() => provisionTenant({ phone: '12', store }), /7–15 digits/)
    assert.throws(() => provisionTenant({ phone: '+254711000001' }), /tenant store/)

    const noPhone = provisionTenant({ store })
    assert.equal(noPhone.phone, null)
    assert.equal(noPhone.sessionId, sessionIdForTenant(noPhone.tenantId))
    assert.equal(listTenants(store).length, 2)
})
