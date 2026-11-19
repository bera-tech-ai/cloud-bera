'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const { createPostgresAuthState } = require('../Library/lib/postgres-auth-state')

const fakeBaileys = {
    BufferJSON: {
        replacer: (_key, value) => Buffer.isBuffer(value)
            ? { type: 'Buffer', data: [...value] }
            : value,
        reviver: (_key, value) => value?.type === 'Buffer' && Array.isArray(value.data)
            ? Buffer.from(value.data)
            : value
    },
    initAuthCreds: () => ({ registered: false, noiseKey: { private: Buffer.from('fresh') } }),
    proto: { Message: { AppStateSyncKeyData: { fromObject: value => ({ ...value, revived: true }) } } }
}

const createFakePool = () => {
    const rows = new Map()
    const keyFor = (sid, type, id) => `${sid}\u0000${type}\u0000${id}`
    const query = async (sql, params = []) => {
        const text = String(sql).trim().toUpperCase()
        if (text.startsWith('CREATE TABLE')) return { rows: [] }
        if (text.startsWith('SELECT PAYLOAD')) {
            const row = rows.get(keyFor(...params))
            return { rows: row ? [{ payload: row.payload }] : [] }
        }
        if (text.startsWith('SELECT AUTH_KEY, PAYLOAD')) {
            const [sid, type, ids] = params
            return { rows: ids.map(id => rows.get(keyFor(sid, type, id))).filter(Boolean).map(row => ({ auth_key: row.id, payload: row.payload })) }
        }
        if (text.startsWith('INSERT INTO BERA_WHATSAPP_AUTH')) {
            const [sid, type, id, payload] = params
            rows.set(keyFor(sid, type, id), { id, payload: typeof payload === 'string' ? JSON.parse(payload) : payload })
            return { rows: [] }
        }
        if (text.startsWith('DELETE FROM BERA_WHATSAPP_AUTH')) {
            if (params.length === 1) {
                for (const [key, row] of rows) if (key.startsWith(`${params[0]}\u0000`)) rows.delete(key)
            } else if (params.length === 2) {
                for (const [key] of rows) if (key.startsWith(`${params[0]}\u0000`) && !key.startsWith(`${params[0]}\u0000${params[1]}\u0000`)) rows.delete(key)
            } else rows.delete(keyFor(...params))
            return { rows: [] }
        }
        if (['BEGIN', 'COMMIT', 'ROLLBACK'].includes(text)) return { rows: [] }
        throw new Error(`Unexpected SQL in fake pool: ${sql}`)
    }
    return {
        rows,
        query,
        connect: async () => ({ query, release() {} })
    }
}

const makeLegacyState = (creds = { registered: true, account: { id: 'legacy-account' } }, values = {}) => {
    const stored = new Map(Object.entries(values))
    return {
        creds,
        keys: {
            get: async (type, ids) => Object.fromEntries(ids.map(id => [id, stored.get(`${type}:${id}`) ?? null])),
            set: async data => {
                for (const [type, entries] of Object.entries(data || {})) {
                    for (const [id, value] of Object.entries(entries || {})) {
                        const mapKey = `${type}:${id}`
                        if (value == null) stored.delete(mapKey)
                        else stored.set(mapKey, value)
                    }
                }
            }
        },
        saveCreds: async () => {},
        stored
    }
}

const encryptionKey = 'unit-test-only-session-encryption-secret'

test('persists encrypted credentials and prefers database credentials on restart', async () => {
    const pool = createFakePool()
    const first = await createPostgresAuthState({ pool, encryptionKey, legacyState: makeLegacyState(), baileys: fakeBaileys })
    assert.equal(first.state.creds.account.id, 'legacy-account')
    await first.saveCreds()

    const storedRow = [...pool.rows.values()].find(row => row.id === '')
    assert.ok(storedRow)
    assert.equal(JSON.stringify(storedRow.payload).includes('legacy-account'), false)

    const localFallback = makeLegacyState({ registered: false, account: { id: 'new-local-state' } })
    const second = await createPostgresAuthState({
        pool,
        encryptionKey,
        legacyState: localFallback,
        baileys: fakeBaileys
    })
    assert.equal(second.state.creds.account.id, 'legacy-account')
    assert.equal(localFallback.creds.account.id, 'legacy-account')
})

test('lazily migrates missing legacy Signal keys and preserves binary values', async () => {
    const pool = createFakePool()
    const legacy = makeLegacyState(undefined, {
        'session:peer:1': { key: Buffer.from([1, 2, 3]) },
        'app-state-sync-key:sync-1': { keyData: Buffer.from([4, 5]) }
    })
    const auth = await createPostgresAuthState({ pool, encryptionKey, legacyState: legacy, baileys: fakeBaileys })

    const session = await auth.state.keys.get('session', ['peer:1'])
    assert.deepEqual(session['peer:1'].key, Buffer.from([1, 2, 3]))
    assert.ok(legacy.stored.has('session:peer:1'))

    const sync = await auth.state.keys.get('app-state-sync-key', ['sync-1'])
    assert.deepEqual(sync['sync-1'].keyData, Buffer.from([4, 5]))
    assert.equal(sync['sync-1'].revived, true)
})

test('persists key updates and deletions to PostgreSQL and the local fallback', async () => {
    const pool = createFakePool()
    const legacy = makeLegacyState()
    const auth = await createPostgresAuthState({ pool, encryptionKey, legacyState: legacy, baileys: fakeBaileys })
    await auth.state.keys.set({ session: { 'peer:1': { key: Buffer.from('persisted') } } })
    assert.equal((await auth.state.keys.get('session', ['peer:1']))['peer:1'].key.toString(), 'persisted')
    assert.ok(legacy.stored.has('session:peer:1'))

    await auth.state.keys.set({ session: { 'peer:1': null } })
    assert.equal((await auth.state.keys.get('session', ['peer:1']))['peer:1'], null)
    assert.equal(legacy.stored.has('session:peer:1'), false)
})

test('refuses database-backed auth storage without a strong encryption key', async () => {
    const pool = createFakePool()
    await assert.rejects(
        createPostgresAuthState({ pool, encryptionKey: 'short', legacyState: makeLegacyState(), baileys: fakeBaileys }),
        /BERA_SESSION_ENCRYPTION_KEY/
    )
})
